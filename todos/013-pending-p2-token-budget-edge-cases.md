---
status: done
completed_at: 2026-02-11
completed_by: Vera
priority: p2
issue_id: "013"
tags: [code-review, architecture, token-management, edge-cases]
dependencies: []
---

# Problem Statement

**TOKEN BUDGET OVERFLOW RISK**: The plan defines token budgets for wake prompts (e.g., 2000 tokens per category, ~8000 total budget) but provides NO strategy for edge cases. What happens when a single memory exceeds the entire category budget? What if a user accumulates 500 memories in one category? There is no truncation strategy, no pagination logic, no overflow redistribution, and no graceful degradation when the budget is exceeded.

**Why This Matters**: A user with extensive memories in the "Emotional" category (e.g., someone who has journaled through a difficult year) could have 500+ memories totaling 50,000 tokens. The wake prompt generator currently sorts by importance and packs until budget is reached (plan lines 413-434), but this naive approach silently drops 90%+ of memories with no user feedback. A single verbatim memory flagged with `useVerbatim=true` could be 3,000 tokens — exceeding the entire category budget — and the system has no defined behavior for this case.

## Findings

**Source**: architecture-strategist, code-review

**Evidence**:
- Wake prompt generation (plan lines 413-434) says "Pack to token budget" with no overflow behavior
- No maximum token size defined per individual memory
- `verbatimTokens` field exists but no validation against budget
- Free tier uses "simple truncation by importance" — but what if top-5 memories already exceed budget?
- Paid tier compression targets "~800 tokens" but no fallback if compression fails or produces more
- No user notification when memories are silently dropped from wake prompt
- `useVerbatim=true` flag can override budget — single memory could consume entire allocation

**Edge Case Scenarios**:

**Scenario 1: Single Oversized Memory**
```
User flags a 3,000-token memory as "use verbatim"
Category budget: 2,000 tokens
Result: ??? (undefined behavior)
Options: Truncate mid-sentence? Skip it? Expand budget?
```

**Scenario 2: Dense Category**
```
User has 500 memories in "Work & Projects" (active developer)
Average: 100 tokens each = 50,000 tokens total
Category budget: 2,000 tokens
Only top 20 memories fit — 96% silently dropped
User doesn't know which memories their AI is seeing
```

**Scenario 3: Compression Failure**
```
Paid tier requests compression of 200 memories → ~800 tokens
Claude API returns 2,500 tokens (compression didn't compress enough)
No retry logic, no secondary truncation
Wake prompt exceeds budget silently
```

**Impact Severity**: 🟡 MODERATE - Silent data loss in wake prompts, degraded user experience

## Proposed Solutions

### Solution 1: Smart Truncation with Importance-Based Ranking (Recommended)

**Approach**: Use `importance` score and `emotionalWeight` to rank memories, implement hard per-memory token limits, and provide transparent overflow reporting to the user.

**Implementation**:
```typescript
// src/lib/wake/token-budget.ts
import { memories } from '@/lib/db/schema';
import { desc, eq, and, inArray } from 'drizzle-orm';

interface BudgetAllocation {
  category: string;
  budget: number;
  usedTokens: number;
  includedMemories: number;
  droppedMemories: number;
  truncatedMemories: string[]; // IDs of memories that were truncated
}

const MAX_SINGLE_MEMORY_TOKENS = 500; // Hard cap per memory
const CATEGORY_BUDGET_DEFAULT = 2000;

export async function allocateTokenBudget(
  db: Database,
  profileId: string,
  selectedCategories: string[],
  totalBudget: number = 8000
): Promise<{
  allocations: BudgetAllocation[];
  warnings: string[];
  totalUsed: number;
}> {
  const warnings: string[] = [];
  const allocations: BudgetAllocation[] = [];

  // Calculate per-category budget (equal split)
  const perCategoryBudget = Math.floor(totalBudget / selectedCategories.length);

  for (const category of selectedCategories) {
    const categoryMemories = await db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.profileId, profileId),
          eq(memories.category, category)
        )
      )
      .orderBy(desc(memories.importance));

    let usedTokens = 0;
    let includedCount = 0;
    let droppedCount = 0;
    const truncatedIds: string[] = [];

    for (const memory of categoryMemories) {
      const tokenCount = memory.useVerbatim
        ? memory.verbatimTokens
        : (memory.summaryTokens ?? memory.verbatimTokens);

      // Enforce per-memory cap
      let effectiveTokens = tokenCount;
      if (effectiveTokens > MAX_SINGLE_MEMORY_TOKENS) {
        effectiveTokens = MAX_SINGLE_MEMORY_TOKENS;
        truncatedIds.push(memory.id);
        warnings.push(
          `Memory "${memory.factualContent.slice(0, 50)}..." truncated ` +
          `from ${tokenCount} to ${MAX_SINGLE_MEMORY_TOKENS} tokens`
        );
      }

      // Check if adding this memory exceeds category budget
      if (usedTokens + effectiveTokens > perCategoryBudget) {
        droppedCount++;
        continue;
      }

      usedTokens += effectiveTokens;
      includedCount++;
    }

    if (droppedCount > 0) {
      warnings.push(
        `${droppedCount} memories in "${category}" excluded due to token budget. ` +
        `Consider summarizing or removing low-importance memories.`
      );
    }

    allocations.push({
      category,
      budget: perCategoryBudget,
      usedTokens,
      includedMemories: includedCount,
      droppedMemories: droppedCount,
      truncatedMemories: truncatedIds,
    });
  }

  return {
    allocations,
    warnings,
    totalUsed: allocations.reduce((sum, a) => sum + a.usedTokens, 0),
  };
}
```

**UI Warning Component**:
```tsx
// src/components/wake/budget-warnings.tsx
'use client';

interface BudgetWarningsProps {
  allocations: BudgetAllocation[];
  warnings: string[];
}

export function BudgetWarnings({ allocations, warnings }: BudgetWarningsProps) {
  const hasDropped = allocations.some(a => a.droppedMemories > 0);

  if (!hasDropped && warnings.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <h4 className="text-sm font-medium text-amber-400">
        Token Budget Notices
      </h4>
      <ul className="mt-2 space-y-1 text-sm text-amber-300/80">
        {allocations
          .filter(a => a.droppedMemories > 0)
          .map(a => (
            <li key={a.category}>
              {a.category}: {a.includedMemories} of{' '}
              {a.includedMemories + a.droppedMemories} memories included
              ({a.usedTokens}/{a.budget} tokens)
            </li>
          ))}
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
```

**Pros**:
- Transparent — user sees exactly what was dropped and why
- Predictable — importance-based ranking means most valuable memories always included
- Per-memory cap prevents single memory from consuming entire budget
- Warnings give user actionable feedback (summarize, delete, adjust)

**Cons**:
- Hard truncation of individual memories may cut mid-thought
- Equal budget split across categories may not match user intent
- Does not leverage emotional weight for ranking (only importance)

**Effort**: Medium (1-2 days)
**Risk**: Low - improves existing behavior without architectural changes

### Solution 2: Pagination with "Top N Memories" Selection

**Approach**: Let users configure how many memories per category are included, with real-time token cost preview. Instead of automatic packing, give the user control over selection.

**Implementation**:
```typescript
// src/lib/wake/paginated-selection.ts
interface CategorySelection {
  category: string;
  topN: number; // User selects: "Include top 10 memories"
  sortBy: 'importance' | 'recency' | 'emotional_weight';
}

export async function getMemoriesForWakePrompt(
  db: Database,
  profileId: string,
  selections: CategorySelection[]
): Promise<{
  memories: SelectedMemory[];
  tokenCost: number;
  overflow: boolean;
}> {
  const allMemories: SelectedMemory[] = [];

  for (const sel of selections) {
    const orderColumn = {
      importance: desc(memories.importance),
      recency: desc(memories.createdAt),
      emotional_weight: desc(memories.importance), // TODO: add emotionalWeight column
    }[sel.sortBy];

    const selected = await db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.profileId, profileId),
          eq(memories.category, sel.category)
        )
      )
      .orderBy(orderColumn)
      .limit(sel.topN);

    allMemories.push(
      ...selected.map(m => ({
        ...m,
        selectedCategory: sel.category,
        effectiveTokens: m.useVerbatim
          ? m.verbatimTokens
          : (m.summaryTokens ?? m.verbatimTokens),
      }))
    );
  }

  const tokenCost = allMemories.reduce((sum, m) => sum + m.effectiveTokens, 0);

  return {
    memories: allMemories,
    tokenCost,
    overflow: tokenCost > 8000,
  };
}
```

**Category Selector UI**:
```tsx
// src/components/wake/category-selector.tsx
'use client';

import { useState } from 'react';

export function CategorySelector({
  categories,
  totalBudget = 8000
}: CategorySelectorProps) {
  const [selections, setSelections] = useState<Record<string, number>>({});

  return (
    <div className="space-y-4">
      {categories.map(cat => (
        <div key={cat.name} className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">{cat.name}</span>
            <span className="text-xs text-zinc-500 ml-2">
              {cat.totalMemories} memories
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">Include top</label>
            <input
              type="number"
              min={0}
              max={cat.totalMemories}
              value={selections[cat.name] ?? 10}
              onChange={e =>
                setSelections(s => ({
                  ...s,
                  [cat.name]: parseInt(e.target.value) || 0,
                }))
              }
              className="w-16 rounded bg-zinc-800 px-2 py-1 text-sm"
            />
            <span className="text-xs text-zinc-500">
              ~{cat.estimatedTokensPerMemory * (selections[cat.name] ?? 10)} tokens
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Pros**:
- User has full control over what is included
- No silent dropping — user explicitly chooses count
- Supports different sort strategies per category
- Real-time token preview prevents surprises

**Cons**:
- More complex UI — may overwhelm casual users
- Users must understand token budgets to make good choices
- Default "top 10" may not be optimal for all category sizes

**Effort**: Medium (1-2 days)
**Risk**: Low - additive feature, doesn't break existing flow

### Solution 3: Dynamic Token Allocation with Budget Redistribution

**Approach**: Instead of equal splits, dynamically allocate budget proportional to category size and redistribute unused tokens from smaller categories to larger ones.

**Implementation**:
```typescript
// src/lib/wake/dynamic-allocation.ts
interface CategoryStats {
  category: string;
  memoryCount: number;
  totalTokens: number;
  averageImportance: number;
}

export function calculateDynamicBudget(
  stats: CategoryStats[],
  totalBudget: number
): Map<string, number> {
  const budgets = new Map<string, number>();

  // Phase 1: Proportional allocation based on memory count
  const totalMemories = stats.reduce((sum, s) => sum + s.memoryCount, 0);

  for (const stat of stats) {
    const proportion = stat.memoryCount / totalMemories;
    const weightedProportion = proportion * (stat.averageImportance / 5);
    budgets.set(stat.category, Math.floor(totalBudget * weightedProportion));
  }

  // Phase 2: Redistribute from categories that don't need full allocation
  let surplus = 0;
  const needsMore: string[] = [];

  for (const stat of stats) {
    const allocated = budgets.get(stat.category)!;
    if (stat.totalTokens < allocated) {
      // This category doesn't need its full allocation
      surplus += allocated - stat.totalTokens;
      budgets.set(stat.category, stat.totalTokens);
    } else if (stat.totalTokens > allocated) {
      needsMore.push(stat.category);
    }
  }

  // Distribute surplus to categories that need more
  if (surplus > 0 && needsMore.length > 0) {
    const perCategory = Math.floor(surplus / needsMore.length);
    for (const cat of needsMore) {
      budgets.set(cat, budgets.get(cat)! + perCategory);
    }
  }

  return budgets;
}

// Server Action
export async function generateWakePromptAction(
  profileId: string,
  selectedCategories: string[]
) {
  const session = await auth();

  // Get stats for each selected category
  const stats = await Promise.all(
    selectedCategories.map(async (category) => {
      const result = await db
        .select({
          count: sql<number>`count(*)`,
          totalTokens: sql<number>`sum(
            CASE WHEN use_verbatim THEN verbatim_tokens
            ELSE COALESCE(summary_tokens, verbatim_tokens) END
          )`,
          avgImportance: sql<number>`avg(importance)`,
        })
        .from(memories)
        .where(
          and(
            eq(memories.profileId, profileId),
            eq(memories.category, category)
          )
        );

      return {
        category,
        memoryCount: result[0].count,
        totalTokens: result[0].totalTokens,
        averageImportance: result[0].avgImportance,
      };
    })
  );

  const budgets = calculateDynamicBudget(stats, 8000);

  // Pack memories per category using dynamic budgets
  // ...
}
```

**Pros**:
- Intelligent distribution — heavy categories get more budget
- Importance weighting means high-value categories are prioritized
- Surplus redistribution maximizes token utilization
- No wasted budget on small categories

**Cons**:
- More complex logic, harder to debug
- Less predictable for users (budget shifts between generations)
- Importance weighting may not match user intent
- Harder to show clear per-category budgets in UI

**Effort**: Medium (2 days)
**Risk**: Low-Medium - more moving parts, but better user experience

## Recommended Action

**Choose Solution 1: Smart Truncation with Importance-Based Ranking**

Start with transparent, predictable behavior: hard per-memory cap, importance-based ordering, and clear warnings when memories are dropped. This provides immediate protection against edge cases without overcomplicating the wake prompt UI. Layer in Solution 3 (dynamic allocation) as an enhancement for paid tier users who need smarter budget distribution.

## Technical Details

**Affected Components**:
- `src/lib/wake/` — wake prompt generation logic (new token budget module)
- `src/components/wake/` — category picker UI (add warning display)
- `src/lib/db/schema.ts` — potential new column for `emotionalWeight` (float)
- `src/app/(dashboard)/wake/page.tsx` — integrate budget warnings

**Database Changes**:
```sql
-- Optional: Add emotional weight for better ranking
ALTER TABLE memories ADD COLUMN emotional_weight REAL DEFAULT 0.5
  CHECK (emotional_weight >= 0.0 AND emotional_weight <= 1.0);

-- Index for efficient budget calculation queries
CREATE INDEX idx_memories_profile_category_importance
  ON memories(profile_id, category, importance DESC);
```

## Acceptance Criteria

- [ ] Single memory exceeding category budget is gracefully truncated (not dropped)
- [ ] Per-memory token cap enforced (e.g., 500 tokens max)
- [ ] User warned when memories are dropped due to budget constraints
- [ ] Warning shows count of included vs total memories per category
- [ ] `useVerbatim=true` memories respect per-memory cap with truncation notice
- [ ] Wake prompt never exceeds total token budget
- [ ] Paid tier compression fallback handles cases where compression exceeds target
- [ ] Unit tests cover: oversized single memory, dense category (500+ memories), empty category, all categories at budget, compression overflow
- [ ] UI displays token budget breakdown with overflow indicators

## Work Log

### 2026-02-10
- **Review finding**: Architecture review identified undefined behavior for token budget edge cases
- **Severity**: Marked as P2 MODERATE - silent data loss in wake prompts
- **Plan gap**: Wake prompt generation (lines 413-434) says "pack to token budget" with no overflow strategy
- **Key risk**: Users with extensive memory collections silently lose context in wake prompts
- **Next step**: Implement per-memory cap and budget warnings in wake prompt generator

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L413-L434) - Wake prompt generation
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L143-L148) - Intelligent compression
- [OpenAI Tokenizer](https://platform.openai.com/tokenizer) - Token counting reference
- [Anthropic Token Counting](https://docs.anthropic.com/en/docs/build-with-claude/token-counting) - Claude token counting API
- [tiktoken](https://github.com/openai/tiktoken) - Fast token counting library
