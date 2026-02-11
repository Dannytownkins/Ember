---
status: pending
priority: p3
issue_id: "022"
tags: [code-review, performance, caching, cost-optimization]
dependencies: []
---

# Problem Statement

**COST/PERFORMANCE ISSUE**: Wake prompts are expensive Claude API calls that could be cached. If a user's memories have not changed since the last generation, regenerating the same wake prompt wastes money and adds latency. No invalidation strategy exists for when memories are added, updated, or deleted.

**Why This Matters**: Paid-tier wake prompt generation involves Claude compressing 200+ memories into ~800 tokens of essence. This is one of the most expensive API calls in the system. A user who generates the same wake prompt 5 times in an hour (experimenting with copy-paste into different AI chats) pays for 5 identical Claude calls. At $0.015/1K output tokens, this adds up quickly across all paid users.

## Findings

**Source**: architecture-strategist

**Evidence**:
- Wake prompt generation is dynamic/on-demand (lines 407-434) with no caching
- Plan explicitly states "NOT stored" (line 277) for wake prompts
- Paid-tier compression requires Claude API call every time
- No mention of caching strategy or invalidation triggers
- Token counting for budget display requires recalculation each time
- Free-tier truncation could also benefit from caching (saves DB queries)

**Impact Severity**: LOW - Cost optimization, not a functional issue

## Proposed Solutions

### Solution 1: Cache Wake Prompts with Memory-Change Invalidation (Recommended)

**Approach**: Cache generated wake prompts in Redis, keyed by user + category selection + memory hash. Invalidate when memories change.

**Implementation**:
```typescript
// lib/cache/wake-prompt-cache.ts
import { Redis } from '@upstash/redis';
import { createHash } from 'crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

interface WakePromptCacheEntry {
  prompt: string;
  tokenCount: number;
  generatedAt: string;
  memoryHash: string;
}

// Generate a hash of memory state for the selected categories
function computeMemoryHash(
  memories: Array<{ id: string; updatedAt: Date; useVerbatim: boolean }>
): string {
  const sorted = memories
    .map((m) => `${m.id}:${m.updatedAt.getTime()}:${m.useVerbatim}`)
    .sort()
    .join('|');

  return createHash('sha256').update(sorted).digest('hex').slice(0, 16);
}

function cacheKey(profileId: string, categories: string[]): string {
  const sorted = [...categories].sort().join(',');
  return `wake-prompt:${profileId}:${sorted}`;
}

export async function getCachedWakePrompt(
  profileId: string,
  categories: string[],
  currentMemories: Array<{ id: string; updatedAt: Date; useVerbatim: boolean }>
): Promise<WakePromptCacheEntry | null> {
  const key = cacheKey(profileId, categories);
  const cached = await redis.get<WakePromptCacheEntry>(key);

  if (!cached) return null;

  // Check if memories have changed since cache was created
  const currentHash = computeMemoryHash(currentMemories);
  if (cached.memoryHash !== currentHash) {
    await redis.del(key);
    return null;
  }

  return cached;
}

export async function cacheWakePrompt(
  profileId: string,
  categories: string[],
  memories: Array<{ id: string; updatedAt: Date; useVerbatim: boolean }>,
  prompt: string,
  tokenCount: number
): Promise<void> {
  const key = cacheKey(profileId, categories);
  const entry: WakePromptCacheEntry = {
    prompt,
    tokenCount,
    generatedAt: new Date().toISOString(),
    memoryHash: computeMemoryHash(memories),
  };

  // Cache for 24 hours (auto-expire as safety net)
  await redis.set(key, entry, { ex: 86400 });
}

// Invalidate all cached wake prompts for a profile when memories change
export async function invalidateWakePromptCache(
  profileId: string
): Promise<void> {
  const pattern = `wake-prompt:${profileId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

```typescript
// lib/actions/wake-prompt.ts
import { getCachedWakePrompt, cacheWakePrompt } from '@/lib/cache/wake-prompt-cache';

export async function generateWakePromptAction(
  profileId: string,
  categories: string[]
) {
  const session = await auth();

  // 1. Fetch memories for selected categories
  const memories = await db.select()
    .from(memoriesTable)
    .where(and(
      eq(memoriesTable.profileId, profileId),
      inArray(memoriesTable.category, categories)
    ))
    .orderBy(desc(memoriesTable.importance));

  // 2. Check cache
  const cached = await getCachedWakePrompt(profileId, categories, memories);
  if (cached) {
    return {
      status: 'success' as const,
      data: {
        prompt: cached.prompt,
        tokenCount: cached.tokenCount,
        fromCache: true,
      },
    };
  }

  // 3. Generate fresh wake prompt (expensive Claude API call)
  const prompt = await compressMemoriesIntoPropmt(memories, categories);

  // 4. Cache the result
  await cacheWakePrompt(profileId, categories, memories, prompt.text, prompt.tokenCount);

  return {
    status: 'success' as const,
    data: {
      prompt: prompt.text,
      tokenCount: prompt.tokenCount,
      fromCache: false,
    },
  };
}
```

```typescript
// lib/actions/memories.ts
// Invalidate cache when memories change
import { invalidateWakePromptCache } from '@/lib/cache/wake-prompt-cache';

export async function createMemoryAction(data: MemoryInput) {
  const memory = await db.insert(memoriesTable).values(data).returning();

  // Invalidate wake prompt cache for this profile
  await invalidateWakePromptCache(data.profileId);

  return memory;
}

export async function updateMemoryAction(id: string, data: Partial<MemoryInput>) {
  const memory = await db.update(memoriesTable)
    .set(data)
    .where(eq(memoriesTable.id, id))
    .returning();

  await invalidateWakePromptCache(memory[0].profileId);

  return memory;
}

export async function deleteMemoryAction(id: string) {
  const memory = await db.delete(memoriesTable)
    .where(eq(memoriesTable.id, id))
    .returning();

  await invalidateWakePromptCache(memory[0].profileId);
}
```

**Pros**:
- Eliminates redundant Claude API calls (saves money)
- Sub-10ms cache hits vs 2-5s generation
- Memory hash ensures stale prompts are never served
- Automatic invalidation on any memory change
- 24-hour TTL as safety net

**Cons**:
- Requires Redis (Upstash already needed for rate limiting in issue 006)
- Cache key pattern scanning (`KEYS`) is slow at scale (use `SCAN` in production)
- First generation after any memory change is still expensive

**Effort**: Low (half day)
**Risk**: Low - cache invalidation is well-understood

### Solution 2: Precompute Wake Prompts in Background Job

**Approach**: When memories change, precompute wake prompts for common category combinations in the background

**Implementation**:
```typescript
// lib/jobs/precompute-wake-prompts.ts
import { after } from 'next/server';

// Common category combinations to precompute
function getCommonCombinations(profileId: string): string[][] {
  return [
    ['work'],
    ['emotional'],
    ['work', 'preferences'],
    ['emotional', 'relationships'],
    ['work', 'preferences', 'relationships'],
    ['emotional', 'work', 'hobbies', 'relationships', 'preferences'], // All
  ];
}

export async function precomputeOnMemoryChange(profileId: string) {
  after(async () => {
    const combinations = getCommonCombinations(profileId);

    // Precompute top 3 most-used combinations only
    for (const categories of combinations.slice(0, 3)) {
      try {
        await generateWakePromptAction(profileId, categories);
      } catch {
        // Non-critical; log and continue
        console.error(`Failed to precompute wake prompt for ${categories}`);
      }
    }
  });
}
```

**Pros**:
- Users get instant wake prompt generation for common category combos
- Background processing does not block the user
- Pre-warms cache for most likely requests

**Cons**:
- Wastes API calls for combinations the user never requests
- Hard to predict which combinations a user will choose
- Higher Claude API costs for precomputation
- `after()` has timeout limits (see issue 005)

**Effort**: Medium (1 day)
**Risk**: MEDIUM - Could increase costs if predictions are wrong

### Solution 3: Client-Side Cache with ETag/If-None-Match

**Approach**: HTTP caching headers on the wake prompt generation endpoint

**Implementation**:
```typescript
// app/api/v1/wake-prompts/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { profileId, categories } = await req.json();

  // Compute ETag from memory state
  const memories = await getMemoriesForCategories(profileId, categories);
  const etag = computeMemoryHash(memories);

  // Check If-None-Match header
  const clientEtag = req.headers.get('If-None-Match');
  if (clientEtag === etag) {
    return new NextResponse(null, { status: 304 });
  }

  // Generate wake prompt
  const prompt = await generateWakePrompt(memories, categories);

  return NextResponse.json(prompt, {
    headers: {
      ETag: etag,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}
```

**Pros**:
- Standard HTTP caching pattern
- No Redis dependency for this specific feature
- Client stores the response, server validates freshness

**Cons**:
- Only helps the same client/browser session
- Does not help API consumers (agents) without client-side caching
- Still requires a server round-trip for validation
- Does not save on server-side computation for first request

**Effort**: Low (half day)
**Risk**: Low

## Recommended Action

**Choose Solution 1: Redis Cache with Memory-Change Invalidation**

Since Upstash Redis is already required for rate limiting (issue 006), adding wake prompt caching is incremental. The memory hash approach ensures stale prompts are never served, and automatic invalidation on memory CRUD operations keeps the cache fresh. This directly reduces Claude API costs for the most expensive operation in the system.

## Technical Details

**Affected Components**:
- `src/lib/cache/wake-prompt-cache.ts` (new module)
- `src/lib/actions/wake-prompt.ts` (add cache check)
- `src/lib/actions/memories.ts` (add cache invalidation)
- Upstash Redis (already needed for issue 006)

**Database Changes**: None

**New Dependencies**: None (Upstash Redis already required by issue 006)

## Acceptance Criteria

- [ ] Wake prompt cache stores generated prompts in Redis
- [ ] Cache key includes profile ID and sorted category selection
- [ ] Memory hash detects when memories have changed since last generation
- [ ] Stale cache entries are invalidated on memory create/update/delete
- [ ] Cached response includes `fromCache: true` indicator
- [ ] 24-hour TTL auto-expires stale entries as safety net
- [ ] Second identical wake prompt request returns in < 50ms

## Work Log

### 2026-02-10
- **Review finding**: Architecture strategist identified redundant Claude API calls for wake prompt generation
- **Severity**: Marked as P3 - cost optimization, not a functional blocker
- **Current state**: Wake prompts regenerated from scratch on every request
- **Next step**: Implement after rate limiting (issue 006) since both use Upstash Redis

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L405-L434) - Wake prompt generation flow
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L277) - "NOT stored" decision
- [Upstash Redis Documentation](https://upstash.com/docs/redis/overall/getstarted)
- [Cache Invalidation Strategies](https://redis.io/docs/manual/keyspace-notifications/)
