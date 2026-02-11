---
status: pending
priority: p3
issue_id: "026"
tags: [code-review, database, schema, data-integrity]
dependencies: []
---

# Problem Statement

**DATA INTEGRITY GAP**: Schema uses string types for fields that have fixed valid values (capture status, memory category, user tier). Text columns allow invalid data. No database-level enforcement of valid states. A typo like "procesing" instead of "processing" silently corrupts state.

**Why This Matters**: The plan explicitly chose `text + CHECK` over Postgres enums (line 640) for flexibility, but no CHECK constraints are actually defined in the schema. Without either enums OR constraints, the capture `status` field can contain any string. A bug that writes `status = 'comopleted'` instead of `status = 'completed'` creates a ghost record that the polling UI never resolves. The user's capture appears stuck in "processing" forever.

## Findings

**Source**: architecture-strategist

**Evidence**:
- Plan states "text + CHECK over Postgres enums" (line 640) but CHECK constraints not in schema
- Data model (lines 229-268) shows `method`, `status`, `category` as text with CHECK comments but no SQL
- Drizzle ORM schema has no `.check()` calls or enum definitions
- `captures.status` accepts any string (should be: pending, processing, completed, failed)
- `captures.method` accepts any string (should be: paste, screenshot, email)
- `memories.category` accepts any string (should be: emotional, work, hobbies, relationships, preferences)
- `memories.importance` has no range constraint (should be 1-5)

**Affected columns**:
```
captures.method:    paste | screenshot | email
captures.status:    pending | processing | completed | failed
memories.category:  emotional | work | hobbies | relationships | preferences
memories.importance: 1-5 (integer range)
```

**Impact Severity**: LOW - Data corruption risk, mitigated by application-level validation

## Proposed Solutions

### Solution 1: PostgreSQL CREATE TYPE Enums

**Approach**: Use native Postgres enum types for all fixed-value columns

**Implementation**:
```sql
-- migrations/00X-add-enum-types.sql

-- Create enum types
CREATE TYPE capture_method AS ENUM ('paste', 'screenshot', 'email');
CREATE TYPE capture_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE memory_category AS ENUM ('emotional', 'work', 'hobbies', 'relationships', 'preferences');

-- Alter existing columns (if tables already exist)
ALTER TABLE captures
  ALTER COLUMN method TYPE capture_method USING method::capture_method,
  ALTER COLUMN status TYPE capture_status USING status::capture_status;

ALTER TABLE memories
  ALTER COLUMN category TYPE memory_category USING category::memory_category;

-- Importance range constraint
ALTER TABLE memories
  ADD CONSTRAINT memories_importance_range CHECK (importance >= 1 AND importance <= 5);
```

```typescript
// src/lib/db/schema.ts (Drizzle ORM)
import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, jsonb, real } from 'drizzle-orm/pg-core';

// Define Postgres enums in Drizzle
export const captureMethodEnum = pgEnum('capture_method', [
  'paste',
  'screenshot',
  'email',
]);

export const captureStatusEnum = pgEnum('capture_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const memoryCategoryEnum = pgEnum('memory_category', [
  'emotional',
  'work',
  'hobbies',
  'relationships',
  'preferences',
]);

export const captures = pgTable('captures', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  method: captureMethodEnum('method').notNull(),
  status: captureStatusEnum('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  rawText: text('raw_text'),
  imageUrls: jsonb('image_urls').$type<string[]>(),
  platform: text('platform'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  captureId: uuid('capture_id').references(() => captures.id, { onDelete: 'cascade' }),
  category: memoryCategoryEnum('category').notNull(),
  factualContent: text('factual_content').notNull(),
  emotionalSignificance: text('emotional_significance'),
  verbatimText: text('verbatim_text').notNull(),
  summaryText: text('summary_text'),
  useVerbatim: boolean('use_verbatim').notNull().default(false),
  importance: integer('importance').notNull(),
  verbatimTokens: integer('verbatim_tokens').notNull(),
  summaryTokens: integer('summary_tokens'),
  speakerConfidence: real('speaker_confidence'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Pros**:
- Database rejects invalid values at the storage level
- Drizzle `pgEnum` generates TypeScript types automatically
- `INSERT INTO captures (status) VALUES ('typo')` fails immediately
- Storage-efficient (enum index instead of full string)
- Self-documenting (enum type lists valid values)

**Cons**:
- Adding new enum values requires `ALTER TYPE ... ADD VALUE` migration
- Cannot remove enum values (only add)
- Postgres enums are notoriously inflexible for changes
- Plan explicitly chose against this (line 640)

**Effort**: Low (half day)
**Risk**: MEDIUM - Enum migrations are tricky, conflicts with plan's stated preference

### Solution 2: Text + CHECK Constraints (Recommended)

**Approach**: Keep text columns but add the CHECK constraints the plan promised

**Implementation**:
```sql
-- migrations/00X-add-check-constraints.sql

-- Capture method constraint
ALTER TABLE captures
  ADD CONSTRAINT captures_method_check
  CHECK (method IN ('paste', 'screenshot', 'email'));

-- Capture status constraint
ALTER TABLE captures
  ADD CONSTRAINT captures_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

-- Memory category constraint
ALTER TABLE memories
  ADD CONSTRAINT memories_category_check
  CHECK (category IN ('emotional', 'work', 'hobbies', 'relationships', 'preferences'));

-- Importance range constraint
ALTER TABLE memories
  ADD CONSTRAINT memories_importance_range
  CHECK (importance >= 1 AND importance <= 5);

-- Speaker confidence range constraint
ALTER TABLE memories
  ADD CONSTRAINT memories_speaker_confidence_range
  CHECK (speaker_confidence IS NULL OR (speaker_confidence >= 0.0 AND speaker_confidence <= 1.0));
```

```typescript
// src/lib/db/schema.ts (Drizzle ORM with check constraints)
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, real, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const captures = pgTable('captures', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  method: text('method').notNull(),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  rawText: text('raw_text'),
  imageUrls: jsonb('image_urls').$type<string[]>(),
  platform: text('platform'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  methodCheck: check('captures_method_check',
    sql`${table.method} IN ('paste', 'screenshot', 'email')`
  ),
  statusCheck: check('captures_status_check',
    sql`${table.status} IN ('pending', 'processing', 'completed', 'failed')`
  ),
}));

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
  importance: integer('importance').notNull(),
  verbatimTokens: integer('verbatim_tokens').notNull(),
  summaryTokens: integer('summary_tokens'),
  speakerConfidence: real('speaker_confidence'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  categoryCheck: check('memories_category_check',
    sql`${table.category} IN ('emotional', 'work', 'hobbies', 'relationships', 'preferences')`
  ),
  importanceCheck: check('memories_importance_range',
    sql`${table.importance} >= 1 AND ${table.importance} <= 5`
  ),
  confidenceCheck: check('memories_speaker_confidence_range',
    sql`${table.speakerConfidence} IS NULL OR (${table.speakerConfidence} >= 0.0 AND ${table.speakerConfidence} <= 1.0)`
  ),
}));
```

**Pros**:
- Follows the plan's stated preference (text + CHECK over enums)
- Easy to modify: `ALTER TABLE ... DROP CONSTRAINT` then re-add
- Adding new valid values is a simple constraint swap
- Database-level enforcement without enum rigidity
- Works with Drizzle's `check()` helper

**Cons**:
- No automatic TypeScript type generation from CHECK constraints
- Constraint modification requires migration (but simpler than enum changes)
- Need TypeScript union types separately from DB constraints

**Effort**: Low (half day)
**Risk**: Low - aligns with plan's stated decision

### Solution 3: Drizzle pgEnum for Type-Safe Schema Definition

**Approach**: Use Drizzle's `pgEnum` for type safety at the ORM level while keeping flexibility

**Implementation**:
```typescript
// src/lib/db/schema.ts
// Drizzle pgEnum gives TypeScript types + DB enum in one definition

import { pgEnum } from 'drizzle-orm/pg-core';

export const captureMethodEnum = pgEnum('capture_method', [
  'paste',
  'screenshot',
  'email',
]);

export const captureStatusEnum = pgEnum('capture_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const memoryCategoryEnum = pgEnum('memory_category', [
  'emotional',
  'work',
  'hobbies',
  'relationships',
  'preferences',
]);

// TypeScript types auto-derived
type CaptureMethod = (typeof captureMethodEnum.enumValues)[number];
// => 'paste' | 'screenshot' | 'email'

type CaptureStatus = (typeof captureStatusEnum.enumValues)[number];
// => 'pending' | 'processing' | 'completed' | 'failed'

type MemoryCategory = (typeof memoryCategoryEnum.enumValues)[number];
// => 'emotional' | 'work' | 'hobbies' | 'relationships' | 'preferences'

// These types can be exported and used across the application
export type { CaptureMethod, CaptureStatus, MemoryCategory };
```

```typescript
// Usage in Server Actions - type-safe
import { CaptureStatus, MemoryCategory } from '@/lib/db/schema';

export async function updateCaptureStatus(
  captureId: string,
  status: CaptureStatus  // TypeScript enforces valid values
) {
  await db.update(captures)
    .set({ status, updatedAt: new Date() })
    .where(eq(captures.id, captureId));
}

// Compile-time error:
updateCaptureStatus('123', 'procesing');
// TS Error: '"procesing"' is not assignable to type 'CaptureStatus'
```

**Pros**:
- Single source of truth: DB enum + TypeScript type from one definition
- Compile-time safety prevents typos in application code
- Drizzle handles migration generation automatically
- Best developer experience (autocomplete for valid values)

**Cons**:
- Uses Postgres enums (harder to modify than CHECK constraints)
- Conflicts with plan's stated preference for text + CHECK
- Adding values requires `ALTER TYPE` which Drizzle handles but is still a migration

**Effort**: Low (half day)
**Risk**: Low - Drizzle abstracts the migration complexity

## Recommended Action

**Choose Solution 2: Text + CHECK Constraints**

This aligns with the plan's explicit decision (line 640) while actually implementing the constraint enforcement that is currently missing. Text + CHECK gives flexibility to add/modify values via simple constraint swaps, and database-level enforcement prevents invalid data. Supplement with TypeScript union types for compile-time safety.

```typescript
// Supplement CHECK constraints with TypeScript types
export const CAPTURE_METHODS = ['paste', 'screenshot', 'email'] as const;
export type CaptureMethod = (typeof CAPTURE_METHODS)[number];

export const CAPTURE_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

export const MEMORY_CATEGORIES = ['emotional', 'work', 'hobbies', 'relationships', 'preferences'] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
```

## Technical Details

**Affected Components**:
- `src/lib/db/schema.ts` (add CHECK constraints to table definitions)
- `drizzle/` migrations (new migration for constraints)
- `src/lib/types.ts` or `src/lib/db/enums.ts` (TypeScript type definitions)
- Zod validation schemas (use same constant arrays)

**Database Changes**:
```sql
-- 5 CHECK constraints added across 2 tables
ALTER TABLE captures ADD CONSTRAINT captures_method_check
  CHECK (method IN ('paste', 'screenshot', 'email'));
ALTER TABLE captures ADD CONSTRAINT captures_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));
ALTER TABLE memories ADD CONSTRAINT memories_category_check
  CHECK (category IN ('emotional', 'work', 'hobbies', 'relationships', 'preferences'));
ALTER TABLE memories ADD CONSTRAINT memories_importance_range
  CHECK (importance >= 1 AND importance <= 5);
ALTER TABLE memories ADD CONSTRAINT memories_speaker_confidence_range
  CHECK (speaker_confidence IS NULL OR (speaker_confidence >= 0.0 AND speaker_confidence <= 1.0));
```

## Acceptance Criteria

- [ ] CHECK constraints exist for `captures.method`, `captures.status`
- [ ] CHECK constraint exists for `memories.category`
- [ ] CHECK constraint exists for `memories.importance` (1-5 range)
- [ ] CHECK constraint exists for `memories.speakerConfidence` (0.0-1.0 or NULL)
- [ ] TypeScript union types defined for all constrained columns
- [ ] Zod schemas use the same constant arrays as DB constraints
- [ ] Invalid inserts are rejected at database level
- [ ] Migration tested: `INSERT INTO captures (status) VALUES ('typo')` fails

## Work Log

### 2026-02-10
- **Review finding**: Architecture strategist noted CHECK constraints mentioned but not implemented
- **Severity**: Marked as P3 - data integrity improvement, mitigated by Zod validation at app layer
- **Plan decision**: text + CHECK over enums (line 640) stated but not followed through
- **Next step**: Add CHECK constraints in initial schema migration

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L640) - "text + CHECK over Postgres enums"
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L229-L268) - Data model with CHECK comments
- [PostgreSQL CHECK Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)
- [Drizzle ORM Check Constraints](https://orm.drizzle.team/docs/indexes-constraints#check)
- [Drizzle pgEnum](https://orm.drizzle.team/docs/column-types/pg#enum)
