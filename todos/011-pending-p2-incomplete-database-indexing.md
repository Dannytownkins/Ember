---
status: pending
priority: p2
issue_id: "011"
tags: [code-review, database, performance, indexing]
dependencies: []
---

# Problem Statement

**PERFORMANCE ISSUE**: The plan defines only 4 indexes (lines 358-364) — the bare minimum. Missing composite indexes for the most common query patterns. Memories queried by category + profile will use the existing `INDEX(profileId, category)` but there are no indexes for importance-based sorting, capture status filtering, or token-based queries. The capture queue has no index on `status` for processing lookups. Queries for "most important memories" or "highest emotional weight" will do full table scans as the dataset grows.

**Why This Matters**: At MVP scale (hundreds of memories per user), missing indexes are invisible. At 1,000+ memories per user with 1,000+ users, every unindexed query becomes a full table scan. The wake prompt generator sorts by importance, the memory browser filters by category, and the capture pipeline queries by status — all high-frequency queries. Neon's serverless Postgres has connection overhead that makes slow queries even more painful. Adding indexes later requires migrations on production data.

## Findings

**Source**: architecture-strategist, performance-sentinel

**Evidence**:
- Plan defines 4 indexes only (lines 358-364):
  - `users: UNIQUE(clerkId), UNIQUE(captureEmail)`
  - `profiles: INDEX(userId)`
  - `captures: INDEX(profileId, createdAt)`
  - `memories: INDEX(profileId, category), INDEX(captureId)`
- No index on `captures.status` for queue processing
- No index on `memories.importance` for sorted queries
- No index on `memories.verbatimTokens` or `summaryTokens`
- No index for full-text search on memory content
- No partial indexes for active/pending records
- Wake prompt generator sorts by importance (line 421) — no supporting index

**Query Patterns Without Indexes**:

**Pattern 1: Capture Queue Processing**
```sql
-- Used by: after() pipeline, status polling endpoint
-- Frequency: Every capture + polling every 3 seconds per active capture
SELECT * FROM captures
WHERE status = 'pending'
ORDER BY created_at ASC;

-- Without index: full table scan on captures
-- With index: instant lookup
```

**Pattern 2: Wake Prompt Memory Fetch**
```sql
-- Used by: wake prompt generator
-- Frequency: Every wake prompt generation
SELECT * FROM memories
WHERE profile_id = $1
  AND category = ANY($2)
ORDER BY importance DESC;

-- Existing index: (profileId, category) — partially helps
-- Missing: importance ordering forces a sort operation
```

**Pattern 3: Most Important Memories**
```sql
-- Used by: free tier truncation (top N by importance)
-- Frequency: Every wake prompt for free users
SELECT * FROM memories
WHERE profile_id = $1
  AND category = $2
ORDER BY importance DESC
LIMIT $3;

-- Without composite index: index scan + sort
-- With (profileId, category, importance DESC): index-only scan
```

**Pattern 4: Memory Content Search (Future)**
```sql
-- Used by: memory search (future feature, but schema should support it)
SELECT * FROM memories
WHERE profile_id = $1
  AND (factual_content ILIKE '%search%'
    OR emotional_significance ILIKE '%search%');

-- Without GIN index: full table scan with ILIKE
-- With GIN index: fast full-text search
```

**Impact Severity**: MEDIUM - Performance degrades with scale, easy to fix now

## Proposed Solutions

### Solution 1: Add Composite Indexes Based on Query Patterns (Recommended)

**Approach**: Add targeted composite indexes for every known query pattern, ordered to maximize index-only scans

**Implementation**:
```typescript
// drizzle/schema.ts — Index definitions with Drizzle ORM

import {
  pgTable, uuid, text, integer, boolean, real,
  timestamp, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull(),
  email: text('email').notNull(),
  captureEmail: text('capture_email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_clerk_id_idx').on(table.clerkId),
  uniqueIndex('users_capture_email_idx').on(table.captureEmail),
]);

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  platform: text('platform'),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('profiles_user_id_idx').on(table.userId),
  // Find default profile for a user (onboarding, auto-selection)
  index('profiles_user_id_default_idx').on(table.userId, table.isDefault),
]);

export const captures = pgTable('captures', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  method: text('method').notNull(), // paste, screenshot, email
  status: text('status').notNull(), // pending, processing, completed, failed
  errorMessage: text('error_message'),
  rawText: text('raw_text'),
  imageUrls: jsonb('image_urls'),
  platform: text('platform'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Existing: user's captures timeline
  index('captures_profile_id_created_at_idx').on(table.profileId, table.createdAt),
  // NEW: Queue processing — find pending/processing captures
  index('captures_status_created_at_idx').on(table.status, table.createdAt),
  // NEW: User's captures by status (dashboard filtering)
  index('captures_profile_id_status_idx').on(table.profileId, table.status),
]);

export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  captureId: uuid('capture_id').references(() => captures.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  factualContent: text('factual_content').notNull(),
  emotionalSignificance: text('emotional_significance'),
  verbatimText: text('verbatim_text').notNull(),
  summaryText: text('summary_text'),
  useVerbatim: boolean('use_verbatim').notNull().default(false),
  importance: integer('importance').notNull(), // 1-5
  verbatimTokens: integer('verbatim_tokens').notNull(),
  summaryTokens: integer('summary_tokens'),
  speakerConfidence: real('speaker_confidence'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Existing: category filtering
  index('memories_profile_id_category_idx').on(table.profileId, table.category),
  // Existing: find memories from a capture
  index('memories_capture_id_idx').on(table.captureId),
  // NEW: Wake prompt generation — category + importance sort
  index('memories_profile_category_importance_idx')
    .on(table.profileId, table.category, table.importance),
  // NEW: All memories sorted by importance (cross-category)
  index('memories_profile_importance_idx')
    .on(table.profileId, table.importance),
  // NEW: Low confidence memories for review UI
  index('memories_profile_confidence_idx')
    .on(table.profileId, table.speakerConfidence),
  // NEW: Memories by creation time (recent memories view)
  index('memories_profile_created_at_idx')
    .on(table.profileId, table.createdAt),
]);
```

```sql
-- Equivalent raw SQL migration for reference
-- drizzle/migrations/0002_add_performance_indexes.sql

-- Captures: queue processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS captures_status_created_at_idx
  ON captures(status, created_at);

-- Captures: user's captures by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS captures_profile_id_status_idx
  ON captures(profile_id, status);

-- Memories: wake prompt generation (category + importance sort)
CREATE INDEX CONCURRENTLY IF NOT EXISTS memories_profile_category_importance_idx
  ON memories(profile_id, category, importance DESC);

-- Memories: cross-category importance sort
CREATE INDEX CONCURRENTLY IF NOT EXISTS memories_profile_importance_idx
  ON memories(profile_id, importance DESC);

-- Memories: speaker confidence review
CREATE INDEX CONCURRENTLY IF NOT EXISTS memories_profile_confidence_idx
  ON memories(profile_id, speaker_confidence)
  WHERE speaker_confidence IS NOT NULL;

-- Memories: recent memories timeline
CREATE INDEX CONCURRENTLY IF NOT EXISTS memories_profile_created_at_idx
  ON memories(profile_id, created_at DESC);

-- Profiles: default profile lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_user_id_default_idx
  ON profiles(user_id, is_default);
```

**Pros**:
- Covers all known query patterns from the plan
- Composite indexes enable index-only scans
- `CONCURRENTLY` allows adding indexes without table locks
- DESC ordering on importance matches query sort direction
- Easy to add incrementally as patterns emerge

**Cons**:
- More indexes = slightly slower writes (INSERT/UPDATE)
- Storage overhead (minor at MVP scale)
- Over-indexing risk (some indexes may never be used)
- Need to maintain as query patterns evolve

**Effort**: Low (half day)
**Risk**: Low - adding indexes is safe and reversible

### Solution 2: Partial Indexes for Filtered Queries

**Approach**: Add partial indexes that only index rows matching a condition, reducing index size and improving query performance for common filters

**Implementation**:
```sql
-- drizzle/migrations/0002_add_partial_indexes.sql

-- Partial index: only pending/processing captures (queue is usually small)
CREATE INDEX CONCURRENTLY IF NOT EXISTS captures_pending_queue_idx
  ON captures(created_at ASC)
  WHERE status IN ('pending', 'processing');

-- Partial index: only failed captures (for retry/admin dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS captures_failed_idx
  ON captures(profile_id, created_at DESC)
  WHERE status = 'failed';

-- Partial index: low confidence memories needing review
CREATE INDEX CONCURRENTLY IF NOT EXISTS memories_low_confidence_idx
  ON memories(profile_id, speaker_confidence)
  WHERE speaker_confidence IS NOT NULL AND speaker_confidence < 0.8;

-- Partial index: high importance memories (used in free tier truncation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS memories_high_importance_idx
  ON memories(profile_id, category, importance DESC)
  WHERE importance >= 4;

-- Partial index: memories with summaries (for compression review UI)
CREATE INDEX CONCURRENTLY IF NOT EXISTS memories_with_summary_idx
  ON memories(profile_id, category)
  WHERE summary_text IS NOT NULL;
```

```typescript
// Drizzle ORM partial index support
// Note: Drizzle supports partial indexes via sql`` in index definitions

import { sql } from 'drizzle-orm';

// In the table definition's index callback:
index('captures_pending_queue_idx')
  .on(captures.createdAt)
  .where(sql`${captures.status} IN ('pending', 'processing')`),

index('memories_low_confidence_idx')
  .on(memories.profileId, memories.speakerConfidence)
  .where(sql`${memories.speakerConfidence} IS NOT NULL AND ${memories.speakerConfidence} < 0.8`),
```

**Pros**:
- Smaller index size (only indexes matching rows)
- Faster lookups for common filtered queries
- Pending capture queue index stays tiny (most captures are completed)
- Perfect for the "review low confidence" and "retry failed" use cases

**Cons**:
- More complex to maintain than standard indexes
- Query planner must match the WHERE clause exactly to use partial index
- Drizzle ORM partial index support requires raw SQL conditions
- Developers must know partial indexes exist to query them correctly

**Effort**: Low (half day)
**Risk**: Low - partial indexes are standard Postgres

### Solution 3: GIN Indexes for Full-Text Search

**Approach**: Add GIN (Generalized Inverted Index) indexes for future full-text search on memory content

**Implementation**:
```sql
-- drizzle/migrations/0003_add_fulltext_search.sql

-- Add tsvector columns for search (computed from content)
ALTER TABLE memories ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(factual_content, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(emotional_significance, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(verbatim_text, '')), 'C')
  ) STORED;

-- GIN index on the search vector
CREATE INDEX CONCURRENTLY IF NOT EXISTS memories_search_vector_idx
  ON memories USING gin(search_vector);

-- Index for category-scoped search
CREATE INDEX CONCURRENTLY IF NOT EXISTS memories_profile_search_idx
  ON memories USING gin(search_vector)
  WHERE profile_id IS NOT NULL; -- Postgres requires this for GIN partial
```

```typescript
// src/lib/queries/search.ts — Full-text search with ranking
import { sql } from 'drizzle-orm';

export async function searchMemories(
  profileId: string,
  query: string,
  category?: string
) {
  const searchQuery = query
    .split(/\s+/)
    .map((term) => term + ':*') // Prefix matching
    .join(' & ');

  const conditions = [
    sql`${memories.profileId} = ${profileId}`,
    sql`${memories.searchVector} @@ to_tsquery('english', ${searchQuery})`,
  ];

  if (category) {
    conditions.push(sql`${memories.category} = ${category}`);
  }

  return db
    .select({
      ...memories,
      rank: sql<number>`ts_rank(${memories.searchVector}, to_tsquery('english', ${searchQuery}))`,
    })
    .from(memories)
    .where(sql.join(conditions, sql` AND `))
    .orderBy(sql`ts_rank(${memories.searchVector}, to_tsquery('english', ${searchQuery})) DESC`)
    .limit(50);
}
```

**Pros**:
- Native Postgres full-text search (no external service)
- Weighted search: factual content ranked higher than emotional context
- Prefix matching for type-ahead search
- Generated column keeps search vector in sync automatically
- Foundation for future semantic search

**Cons**:
- GIN indexes are larger than B-tree indexes
- Generated column adds storage overhead
- Full-text search is not in MVP scope (premature optimization)
- Migration adds column to existing table
- English-only stemming (may need multi-language later)

**Effort**: Medium (1 day)
**Risk**: Medium - premature for MVP, adds schema complexity

## Recommended Action

**Implement Solution 1 (composite indexes) immediately, Solution 2 (partial indexes) alongside:**

1. Add composite indexes for all known query patterns in the initial migration
2. Add partial indexes for queue processing and low-confidence review
3. Defer Solution 3 (GIN full-text search) until search is actually needed

**Index priority by query frequency:**
1. `captures(status, created_at)` — queue processing runs continuously
2. `memories(profileId, category, importance DESC)` — every wake prompt generation
3. `captures(profileId, status)` — dashboard capture list with status filter
4. `memories(profileId, importance)` — cross-category importance sorting
5. `memories(profileId, speakerConfidence)` — review UI for low-confidence items
6. `memories(profileId, createdAt)` — recent memories timeline

Use `CREATE INDEX CONCURRENTLY` in production migrations to avoid table locks.

## Technical Details

**Affected Components**:
- `drizzle/schema.ts` (add index definitions)
- `drizzle/migrations/` (new migration file)
- No application code changes required — indexes are transparent to queries

**Database Changes**:
```sql
-- 7 new indexes across captures and memories tables
-- See Solution 1 + Solution 2 for full SQL

-- Estimated storage overhead:
-- At 10K memories: ~2-5 MB additional index storage
-- At 100K memories: ~20-50 MB additional index storage
-- Neon free tier: 512 MB storage — indexes well within budget
```

**New Dependencies**:
```json
{
  "dependencies": {}
}
```
No new dependencies. Pure database-level optimization.

## Acceptance Criteria

- [ ] Composite index on captures(status, createdAt) for queue processing
- [ ] Composite index on captures(profileId, status) for dashboard filtering
- [ ] Composite index on memories(profileId, category, importance DESC) for wake prompts
- [ ] Composite index on memories(profileId, importance) for cross-category sorting
- [ ] Composite index on memories(profileId, speakerConfidence) for review UI
- [ ] Composite index on memories(profileId, createdAt) for timeline view
- [ ] Partial index on captures WHERE status IN ('pending', 'processing')
- [ ] Partial index on memories WHERE speakerConfidence < 0.8
- [ ] All indexes created with CONCURRENTLY for zero-downtime deployment
- [ ] EXPLAIN ANALYZE confirms index usage on key queries
- [ ] Drizzle schema matches migration SQL
- [ ] Migration tested on empty and seeded database

## Work Log

### 2026-02-10
- **Review finding**: Performance sentinel identified indexing gaps
- **Severity**: Marked as P2 — no impact at MVP scale, significant at growth
- **Plan baseline**: 4 indexes defined (lines 358-364), adequate for basic operations
- **Key gap**: No index on captures.status (queue processing) or memories.importance (wake prompts)
- **Approach**: Add indexes in initial migration, not retroactively
- **Decision**: Defer GIN full-text search until search feature is scoped
- **Next step**: Add index definitions to Drizzle schema before Phase 1 deployment

## Resources

- [Plan document](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L358-L364) - Current index definitions
- [PostgreSQL Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- [Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [GIN Indexes](https://www.postgresql.org/docs/current/gin-intro.html)
- [Drizzle ORM Indexes](https://orm.drizzle.team/docs/indexes-constraints)
- [CREATE INDEX CONCURRENTLY](https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY)
