---
status: deferred
priority: p1
issue_id: "004"
tags: [code-review, database, data-integrity, data-loss, gdpr, deferred-phase-1.5]
dependencies: []
deferred_to: "Phase 1.5 (within 2 weeks post-launch)"
deferred_reason: "Low user count at launch = low risk. Strong confirmation dialogs for now. Implement soft delete within 2 weeks of launch."
deferred_date: "2026-02-10"
---

# Problem Statement

**CRITICAL DATA LOSS RISK**: The schema uses `ON DELETE CASCADE` without soft delete columns. One accidental `DELETE FROM users` and the user loses ALL profiles, captures, and memories permanently with NO recovery path. The plan explicitly states (line 282): "Add soft delete when users ask" — this is WRONG. Soft delete is not a feature request, it's a data safety requirement.

**Why This Matters**: Users are entrusting Ember with irreplaceable memories — intimate conversations, emotional significance, relationships. Permanent deletion from a misclicked button, support script typo, or Clerk webhook race condition is unacceptable.

## Findings

**Source**: data-integrity-guardian, security-sentinel

**Evidence**:
- `ON DELETE CASCADE` on all FK relationships (lines 243, 265, 271)
- No `deletedAt` columns in schema
- No soft delete mention until line 282 as "later when users ask"
- Clerk webhook deletion triggers immediate CASCADE (no undo)
- GDPR right to erasure conflicts (must allow export before delete)

**Failure Scenarios**:

**Scenario 1: Clerk Webhook Race**
```
1. User clicks "Delete Account" in Clerk
2. Clerk sends webhook: DELETE FROM users WHERE clerkId = ?
3. CASCADE deletes all profiles → captures → memories
4. User: "Wait, I wanted to export first!"
5. No recovery. Data gone permanently.
```

**Scenario 2: Support Error**
```
1. Support script: DELETE FROM users WHERE email = 'user@example.com'
2. Typo in email address
3. Wrong user's entire memory bank deleted
4. Unrecoverable
```

**Impact Severity**: 🔴 CRITICAL - Permanent data loss of irreplaceable user data

## Proposed Solutions

### Solution 1: Soft Delete with 30-Day Grace Period (Recommended)

**Approach**: Add `deletedAt` to all tables, mark deleted instead of removing

**Implementation**:
```sql
-- 1. Add soft delete columns
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE captures ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE memories ADD COLUMN deleted_at TIMESTAMPTZ;

-- 2. Update all queries to filter soft-deleted
-- Drizzle helper:
export function notDeleted() {
  return isNull(deletedAt);
}

// Usage:
await db.select()
  .from(memories)
  .where(and(
    eq(memories.profileId, profileId),
    notDeleted()
  ));

-- 3. Account deletion workflow
export async function deleteUserAccount(userId: string) {
  // Step 1: Offer data export
  const exportUrl = await generateDataExport(userId);
  await sendEmail(user.email, {
    subject: 'Your Ember data export',
    body: `Download your data: ${exportUrl}

    Your account will be permanently deleted in 30 days.
    To cancel deletion, log in within 30 days.`
  });

  // Step 2: Soft delete (mark deleted)
  await db.update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, userId));

  // Step 3: Schedule permanent purge (30 days)
  // Cron job: DELETE WHERE deletedAt < NOW() - INTERVAL '30 days'
}

-- 4. Recovery workflow
export async function restoreAccount(userId: string) {
  await db.update(users)
    .set({ deletedAt: null })
    .where(eq(users.id, userId));

  // Cascade restore
  await db.update(profiles)
    .set({ deletedAt: null })
    .where(eq(profiles.userId, userId));

  // (captures and memories cascade from profiles)
}
```

**Pros**:
- 30-day recovery window (undo accidental deletes)
- GDPR compliant (export before final purge)
- Industry standard pattern
- Protects against human error

**Cons**:
- Adds `deletedAt` to all queries
- Storage costs for deleted data (30 days)
- Cron job for permanent purge

**Effort**: Medium (2 days for implementation + testing)
**Risk**: Low - standard practice

### Solution 2: Confirmation + Export Before Delete

**Approach**: Require confirmation and force export, but still hard delete

**Implementation**:
```typescript
export async function deleteUserAccount(userId: string) {
  // Step 1: Generate export FIRST
  const exportData = await generateFullExport(userId);
  const exportUrl = await uploadExport(exportData);

  // Step 2: Email user with export
  await sendEmail(user.email, {
    subject: 'Your Ember data export (Required before deletion)',
    body: `Download: ${exportUrl}

    Click here to confirm deletion: ${confirmUrl}`
  });

  // Step 3: User must click confirmation link
  // ONLY THEN: hard delete
  await confirmAndDelete(userId, token);
}
```

**Pros**:
- Forces data export before deletion
- No storage overhead
- Simpler than soft delete

**Cons**:
- NO recovery window (deletion is permanent)
- User must manually save export file
- Still vulnerable to webhook race conditions
- Support errors still catastrophic

**Effort**: Low (1 day)
**Risk**: MEDIUM - No recovery from mistakes

### Solution 3: Archive to Separate Storage

**Approach**: Move deleted data to archive storage instead of deleting

**Implementation**:
```typescript
export async function archiveUser(userId: string) {
  // Export to JSON
  const archive = await generateFullExport(userId);

  // Store in S3 with 7-year retention
  await s3.putObject({
    Bucket: 'ember-deleted-accounts',
    Key: `${userId}-${Date.now()}.json.gz`,
    Body: gzipSync(JSON.stringify(archive)),
    StorageClass: 'GLACIER_IR' // Cheap long-term storage
  });

  // Delete from prod DB
  await hardDelete(userId);
}
```

**Pros**:
- Legal compliance (GDPR allows archiving)
- Recovery possible (request archive restoration)
- Lower storage costs (Glacier)

**Cons**:
- Complex restoration process
- Requires S3/Glacier setup
- User cannot self-restore

**Effort**: Medium (2 days)
**Risk**: MEDIUM - Restoration complexity

## Recommended Action

**Choose Solution 1: Soft Delete with 30-Day Grace Period**

This is the industry standard for a reason. Implement:
1. Add `deletedAt` columns to all tables
2. Update all queries to filter `WHERE deletedAt IS NULL`
3. Account deletion marks as deleted, schedules purge in 30 days
4. User can restore within 30 days by logging in
5. Cron job purges permanently after 30 days
6. Export generated before soft delete (GDPR compliance)

## Technical Details

**Affected Components**:
- All database queries (add `deletedAt IS NULL` filter)
- `src/lib/db/schema.ts` (add columns)
- Account deletion workflow
- Clerk webhook handler (soft delete instead of hard delete)
- Cron job for permanent purge

**Database Changes**:
```sql
-- migrations/00X-add-soft-delete.sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE captures ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE memories ADD COLUMN deleted_at TIMESTAMPTZ;

-- Indexes for soft delete queries
CREATE INDEX idx_users_deleted ON users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_profiles_deleted ON profiles(deleted_at) WHERE deleted_at IS NOT NULL;

-- Partial index for active records (most common query)
CREATE INDEX idx_memories_active ON memories(profile_id, created_at)
  WHERE deleted_at IS NULL;
```

**New Code Patterns**:
```typescript
// lib/db/helpers.ts
export function notDeleted<T extends { deletedAt: any }>(table: T) {
  return isNull(table.deletedAt);
}

// Usage in queries:
const activeMemories = await db.select()
  .from(memories)
  .where(and(
    eq(memories.profileId, profileId),
    notDeleted(memories)
  ));

// Soft delete helper
export async function softDelete<T extends Table>(
  table: T,
  condition: SQLWrapper
) {
  return db.update(table)
    .set({ deletedAt: new Date() })
    .where(condition);
}

// Recovery helper
export async function restore<T extends Table>(
  table: T,
  condition: SQLWrapper
) {
  return db.update(table)
    .set({ deletedAt: null })
    .where(condition);
}
```

**Cron Job for Permanent Purge**:
```typescript
// app/api/cron/purge-deleted/route.ts
export async function GET() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Hard delete users marked deleted > 30 days ago
  const purged = await db.delete(users)
    .where(lt(users.deletedAt, thirtyDaysAgo))
    .returning({ id: users.id });

  console.log(`Purged ${purged.length} users permanently`);
  return Response.json({ purged: purged.length });
}

// Vercel cron config (vercel.json):
{
  "crons": [{
    "path": "/api/cron/purge-deleted",
    "schedule": "0 2 * * *"  // 2am daily
  }]
}
```

## Acceptance Criteria

- [ ] `deletedAt` columns added to users, profiles, captures, memories
- [ ] All SELECT queries filter `WHERE deletedAt IS NULL`
- [ ] Account deletion soft-deletes instead of hard-deletes
- [ ] Data export generated before soft delete
- [ ] User receives email with export link + 30-day notice
- [ ] Restore workflow allows account recovery within 30 days
- [ ] Cron job purges deleted accounts after 30 days
- [ ] Clerk webhook updated to soft delete
- [ ] Tests verify: delete → restore → data intact
- [ ] Tests verify: 30-day purge removes data permanently

## Work Log

### 2026-02-10
- **Review finding**: Data integrity guardian identified CASCADE delete risk
- **Severity**: Marked as P1 CRITICAL - permanent data loss without recovery
- **Plan flaw**: Line 282 treats soft delete as "later feature" instead of requirement
- **Next step**: Add soft delete to Phase 1 schema before implementing any deletion

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L243-L271) - CASCADE delete definitions
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L282) - "Add soft delete when users ask" (WRONG)
- [GDPR Right to Erasure](https://gdpr-info.eu/art-17-gdpr/) - Must allow export before deletion
- [Paranoid Delete Pattern](https://sequelize.org/docs/v6/core-concepts/paranoid/) - Industry standard soft delete
