---
status: pending
priority: p2
issue_id: "010"
tags: [code-review, performance, caching, cost-optimization]
dependencies: []
---

# Problem Statement

**PERFORMANCE/COST ISSUE**: Wake prompts and memory queries hit the database on every request. No Redis or ISR caching layer is defined anywhere in the plan. Wake prompts are especially expensive — they fetch all memories for selected categories, sort by importance, pack to token budget, and for paid tier users, trigger a Claude API call for compression. This entire pipeline runs from scratch every time, even when the underlying memories haven't changed.

**Why This Matters**: A user generating a wake prompt 5 times in an hour (tweaking category selection) triggers 5 full database queries and potentially 5 Claude compression calls. At $0.015+ per compression call, this adds up fast. Memory browser pages listing hundreds of memories with category filters hit the database with every navigation. The plan mentions no caching strategy — not Redis, not ISR, not even basic in-memory memoization. At scale, this means unnecessary database load, unnecessary Claude API costs, and slower response times.

## Findings

**Source**: architecture-strategist, cost-sentinel

**Evidence**:
- Zero mentions of Redis, caching, ISR, or SWR in plan
- Wake prompt generation (lines 406-434) fetches all memories every time
- Paid tier compression calls Claude API with no caching
- Memory browser has no pagination or caching strategy
- Category token totals recalculated on every page load
- No cache invalidation strategy (when do caches expire?)
- Tech stack table (lines 217-228) lists no caching technology

**Cost Analysis**:

**Scenario 1: Wake Prompt Generation Without Caching**
```
1. User selects 3 categories, generates wake prompt
2. DB query: fetch ~100 memories across categories
3. Token counting: process all 100 memories
4. Paid tier: Claude compression call (~$0.015)
5. User tweaks selection, generates again
6. Same DB query, same compression, same cost
7. 5 generations/session = 5 DB hits + 5 Claude calls
8. Cost: ~$0.075/session in Claude calls alone
```

**Scenario 2: Memory Browser Without Caching**
```
1. User opens memories page → DB query (all memories)
2. Clicks "Work" category filter → DB query (filtered)
3. Clicks "Emotional" category → DB query (filtered)
4. Goes back to "All" → DB query (all again)
5. 4 page views = 4 identical or similar DB queries
6. At 200+ memories, each query returns significant data
```

**Scenario 3: Category Token Totals**
```
1. Category picker shows token count per category
2. Each count requires: fetch memories → sum tokens
3. 5 categories = 5 separate counts (or 1 grouped query)
4. Recalculated on every page load
5. Only changes when memories are added/edited/deleted
6. 99% of loads return identical data
```

**Impact Severity**: MEDIUM - Cost waste + unnecessary latency

## Proposed Solutions

### Solution 1: Upstash Redis Caching with TTL-Based Invalidation (Recommended)

**Approach**: Redis caching layer for expensive queries and Claude API results with smart invalidation

**Implementation**:
```typescript
// src/lib/cache/redis.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

// Cache key builders — consistent naming
export const cacheKeys = {
  categoryTokens: (profileId: string) =>
    `ember:profile:${profileId}:category-tokens`,

  memoriesByCategory: (profileId: string, category: string) =>
    `ember:profile:${profileId}:memories:${category}`,

  allMemories: (profileId: string) =>
    `ember:profile:${profileId}:memories:all`,

  wakePrompt: (profileId: string, categoriesHash: string) =>
    `ember:profile:${profileId}:wake-prompt:${categoriesHash}`,

  compressedPrompt: (profileId: string, categoriesHash: string) =>
    `ember:profile:${profileId}:compressed:${categoriesHash}`,
};

// Generic cache wrapper with TTL
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  // Try cache first
  const cachedValue = await redis.get<T>(key);
  if (cachedValue !== null) {
    return cachedValue;
  }

  // Cache miss: compute and store
  const value = await fn();
  await redis.set(key, value, { ex: ttlSeconds });
  return value;
}

// Invalidate all caches for a profile (after memory CRUD)
export async function invalidateProfileCache(profileId: string) {
  const pattern = `ember:profile:${profileId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

```typescript
// src/lib/queries/memories.ts — Cached memory queries
import { cached, cacheKeys, invalidateProfileCache } from '@/lib/cache/redis';
import { db } from '@/lib/db';
import { memories } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { createHash } from 'crypto';

// Cached category token totals (changes rarely, queried often)
export async function getCategoryTokenTotals(profileId: string) {
  return cached(
    cacheKeys.categoryTokens(profileId),
    300, // 5 minutes TTL
    async () => {
      const result = await db
        .select({
          category: memories.category,
          totalVerbatimTokens: sql<number>`sum(${memories.verbatimTokens})`,
          totalSummaryTokens: sql<number>`sum(coalesce(${memories.summaryTokens}, 0))`,
          count: sql<number>`count(*)`,
        })
        .from(memories)
        .where(eq(memories.profileId, profileId))
        .groupBy(memories.category);

      return result;
    }
  );
}

// Cached memories by category
export async function getMemoriesByCategory(profileId: string, category: string) {
  return cached(
    cacheKeys.memoriesByCategory(profileId, category),
    300, // 5 minutes TTL
    async () => {
      return db
        .select()
        .from(memories)
        .where(and(
          eq(memories.profileId, profileId),
          eq(memories.category, category)
        ))
        .orderBy(memories.importance);
    }
  );
}

// Cached wake prompt (expensive — includes potential Claude compression)
export async function getCachedWakePrompt(
  profileId: string,
  selectedCategories: string[],
  tokenBudget: number
) {
  // Hash the category selection + budget for cache key
  const hash = createHash('md5')
    .update(selectedCategories.sort().join(',') + ':' + tokenBudget)
    .digest('hex')
    .slice(0, 12);

  return cached(
    cacheKeys.wakePrompt(profileId, hash),
    600, // 10 minutes TTL — wake prompts are expensive
    async () => {
      return generateWakePromptUncached(profileId, selectedCategories, tokenBudget);
    }
  );
}

// Invalidation: call after any memory mutation
export async function onMemoryMutated(profileId: string) {
  await invalidateProfileCache(profileId);
}
```

```typescript
// src/lib/actions/memory.ts — Invalidation on mutations
'use server';

import { onMemoryMutated } from '@/lib/queries/memories';

export async function updateMemoryAction(formData: FormData) {
  // ... validation, auth check, update logic ...

  await db.update(memories)
    .set(updates)
    .where(eq(memories.id, memoryId));

  // Invalidate cache for this profile
  await onMemoryMutated(profileId);

  return { status: 'success', data: { memoryId } };
}

export async function deleteMemoryAction(memoryId: string) {
  // ... validation, auth check ...

  const memory = await db.delete(memories)
    .where(eq(memories.id, memoryId))
    .returning();

  // Invalidate cache
  await onMemoryMutated(memory[0].profileId);

  return { status: 'success', data: null };
}
```

**Pros**:
- Dramatic reduction in DB queries for repeat visits
- Wake prompt caching saves Claude API costs ($0.015+ per avoided call)
- Upstash Redis has a generous free tier (10K requests/day)
- TTL-based expiry prevents stale data issues
- Explicit invalidation on mutations ensures freshness
- Shared Redis with rate limiting (same Upstash instance)

**Cons**:
- Requires Upstash Redis dependency (already needed for rate limiting, issue 006)
- Cache invalidation must be called on every mutation (easy to miss)
- `redis.keys()` pattern matching can be slow at scale (consider scan)
- Cache stampede risk on cold starts

**Effort**: Medium (1-2 days)
**Risk**: Low - standard caching pattern, Redis already in stack for rate limiting

### Solution 2: Next.js ISR for Memory Browser Pages

**Approach**: Use Incremental Static Regeneration for memory browser pages that change infrequently

**Implementation**:
```typescript
// src/app/(dashboard)/memories/page.tsx — ISR with revalidation
import { revalidatePath } from 'next/cache';

// Revalidate every 60 seconds (or on-demand)
export const revalidate = 60;

export default async function MemoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const session = await auth();

  // This query result is cached by Next.js for 60 seconds
  const userMemories = await getMemoriesForUser(session.userId, category);
  const categoryTotals = await getCategoryTokenTotals(session.userId);

  return (
    <div>
      <CategoryFilter categories={categoryTotals} selected={category} />
      <MemoryList memories={userMemories} />
    </div>
  );
}
```

```typescript
// src/lib/actions/capture.ts — On-demand revalidation after capture
'use server';

import { revalidatePath } from 'next/cache';

export async function onCaptureCompleted(profileId: string) {
  // Revalidate the memories page for this user
  revalidatePath('/memories');
  revalidatePath('/wake');
}
```

```typescript
// next.config.ts — Configure data cache
export default {
  experimental: {
    // Use fetch cache for server component data
    staleTimes: {
      dynamic: 60, // Cache dynamic pages for 60 seconds
    },
  },
};
```

**Pros**:
- Built into Next.js (no external dependency)
- Automatic caching of server component data
- On-demand revalidation after mutations
- Works at the page level (coarse-grained but simple)
- CDN-cached at Vercel edge

**Cons**:
- Per-user pages are NOT good ISR candidates (too many variants)
- ISR is page-level, not query-level (less granular than Redis)
- Authenticated pages have limited ISR benefit
- `revalidatePath` invalidates ALL users, not per-user
- Does not cache Claude API calls (computation, not page rendering)

**Effort**: Low (half day)
**Risk**: Low - but limited benefit for authenticated pages

### Solution 3: Client-Side SWR with Stale-While-Revalidate

**Approach**: Use React Query or SWR for client-side caching with background revalidation

**Implementation**:
```typescript
// src/lib/queries/client.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Fetch memories with client-side caching
export function useMemories(profileId: string, category?: string) {
  return useQuery({
    queryKey: ['memories', profileId, category],
    queryFn: () => fetchMemories(profileId, category),
    staleTime: 5 * 60 * 1000, // 5 minutes before refetch
    gcTime: 30 * 60 * 1000,   // 30 minutes in garbage collection
    refetchOnWindowFocus: false,
  });
}

// Fetch category token totals (rarely changes)
export function useCategoryTokens(profileId: string) {
  return useQuery({
    queryKey: ['category-tokens', profileId],
    queryFn: () => fetchCategoryTokens(profileId),
    staleTime: 10 * 60 * 1000, // 10 minutes — very stable data
    gcTime: 60 * 60 * 1000,    // 1 hour in cache
  });
}

// Wake prompt with aggressive caching
export function useWakePrompt(
  profileId: string,
  categories: string[],
  tokenBudget: number
) {
  return useQuery({
    queryKey: ['wake-prompt', profileId, categories.sort(), tokenBudget],
    queryFn: () => generateWakePrompt(profileId, categories, tokenBudget),
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000,
    enabled: categories.length > 0, // Don't fetch if no categories selected
  });
}

// Mutation with cache invalidation
export function useDeleteMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memoryId: string) => deleteMemory(memoryId),
    onSuccess: (_data, _variables, _context) => {
      // Invalidate all memory-related caches
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      queryClient.invalidateQueries({ queryKey: ['category-tokens'] });
      queryClient.invalidateQueries({ queryKey: ['wake-prompt'] });
    },
  });
}
```

```typescript
// src/components/memories/memory-browser.tsx — Using cached hooks
'use client';

import { useMemories, useCategoryTokens } from '@/lib/queries/client';

export function MemoryBrowser({ profileId }: { profileId: string }) {
  const [selectedCategory, setSelectedCategory] = useState<string>();
  const { data: memories, isLoading, error } = useMemories(profileId, selectedCategory);
  const { data: tokenTotals } = useCategoryTokens(profileId);

  if (isLoading) return <MemorySkeleton />;
  if (error) return <ErrorDisplay error={error} />;

  return (
    <div>
      <CategoryTabs
        totals={tokenTotals}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        // Tab switching is INSTANT — data cached client-side
      />
      <MemoryList memories={memories} />
    </div>
  );
}
```

**Pros**:
- Instant category switching (cached client-side)
- Background revalidation keeps data fresh
- No server-side caching infrastructure needed
- Works well with optimistic updates
- React Query devtools for debugging

**Cons**:
- Client-side only — no benefit for initial page load (SSR)
- Memory data cached in browser (memory pressure on mobile)
- Requires converting Server Components to Client Components for some features
- Does not reduce server-side Claude API calls
- Each user maintains their own cache (no shared caching)

**Effort**: Medium (1-2 days)
**Risk**: Low - mature library, well-documented patterns

## Recommended Action

**Implement Solution 1 (Redis) + Solution 3 (React Query) as complementary layers:**

- **Redis (server-side)**: Cache database queries and Claude API compression results. Reduces DB load and API costs.
- **React Query (client-side)**: Cache API responses in the browser. Instant navigation between categories.

This gives you:
1. **Server-side**: Redis caches the expensive parts (DB queries, Claude calls)
2. **Client-side**: React Query caches API responses for instant UI
3. **Invalidation**: Mutations invalidate Redis + React Query caches simultaneously

Defer ISR (Solution 2) — it's not well-suited for per-user authenticated pages.

**Caching priorities by impact:**
1. Wake prompt Claude compression (highest cost savings)
2. Category token totals (most frequently requested, rarely changes)
3. Memory list by category (navigated frequently)

## Technical Details

**Affected Components**:
- `src/lib/cache/redis.ts` (new)
- `src/lib/queries/memories.ts` (add caching layer)
- `src/lib/queries/client.ts` (new — React Query hooks)
- `src/lib/actions/memory.ts` (add cache invalidation)
- `src/lib/actions/capture.ts` (add cache invalidation after extraction)
- `src/components/memories/memory-browser.tsx` (use React Query)
- `src/components/wake/category-picker.tsx` (use React Query)
- `src/app/providers.tsx` (add QueryClientProvider)

**Database Changes**:
```sql
-- No database changes required.
-- Caching is an application-layer concern.
```

**New Dependencies**:
```json
{
  "dependencies": {
    "@upstash/redis": "^1.28.0",
    "@tanstack/react-query": "^5.0.0"
  }
}
```

Note: `@upstash/redis` is already required for rate limiting (issue 006). Shared instance.

**Environment Variables**:
```
UPSTASH_REDIS_URL=https://...    (already set for rate limiting)
UPSTASH_REDIS_TOKEN=...          (already set for rate limiting)
```

## Acceptance Criteria

- [ ] Redis caching layer implemented with `cached()` helper
- [ ] Category token totals cached (5 min TTL)
- [ ] Memory queries cached by profile + category (5 min TTL)
- [ ] Wake prompt results cached by category selection hash (10 min TTL)
- [ ] Claude compression results cached (longest TTL — 30 min)
- [ ] Cache invalidated on memory create, update, delete
- [ ] Cache invalidated after capture extraction completes
- [ ] React Query hooks for memories, category tokens, wake prompt
- [ ] Category tab switching is instant after first load
- [ ] Wake prompt re-generation with same categories hits cache
- [ ] Verified: 5 identical wake prompt requests produce 1 Claude call
- [ ] Cache hit/miss ratio logged for monitoring

## Work Log

### 2026-02-10
- **Review finding**: Architecture strategist + cost sentinel identified caching gap
- **Severity**: Marked as P2 — performance and cost issue, not security
- **Plan gap**: Zero mentions of caching anywhere in plan document
- **Key cost**: Wake prompt compression is ~$0.015/call, easily cached
- **Shared dependency**: Upstash Redis already needed for rate limiting (issue 006)
- **Decision needed**: TTL durations (aggressive vs conservative caching)
- **Next step**: Implement Redis caching for wake prompt generation first (highest ROI)

## Resources

- [Plan document](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L406-L434) - Wake prompt generation
- [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted)
- [React Query](https://tanstack.com/query/latest)
- [Stale-While-Revalidate](https://web.dev/stale-while-revalidate/)
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)
