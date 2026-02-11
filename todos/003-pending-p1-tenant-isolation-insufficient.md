---
status: pending
priority: p1
issue_id: "003"
tags: [code-review, security, database, tenant-isolation, data-breach]
dependencies: []
---

# Problem Statement

**CRITICAL SECURITY VULNERABILITY**: The database schema shows direct `profileId` foreign keys without enforced ownership checks. The plan states "Every query filters by userId through profile ownership" (line 629) but provides NO database-level or application-level enforcement. A single missing ownership check in any query exposes all user data.

**Why This Matters**: If any developer writes `SELECT * FROM memories WHERE id = ?` without checking profile ownership, an attacker who enumerates UUIDs can access any user's intimate memories, emotional context, and private conversations.

## Findings

**Source**: security-sentinel, architecture-strategist

**Evidence**:
- Schema shows `memories.profileId` FK but no Row-Level Security
- No application-level tenant context enforcement
- No code examples showing ownership validation
- Plan assumes developers will "remember" to check ownership
- Human error inevitable at scale

**Attack Vector**:
```
1. Attacker creates account, gets profileId: abc-123
2. Attacker enumerates UUIDs: abc-124, abc-125, abc-126...
3. Attacker finds victim's profileId: def-456
4. Attacker crafts API request (when API added):
   GET /api/v1/memories/def-456-memory-uuid
5. If ownership check missing → attacker sees victim's memories
6. Complete privacy breach
```

**Impact Severity**: 🔴 CRITICAL - Complete data breach via single bug

## Proposed Solutions

### Solution 1: PostgreSQL Row-Level Security (RLS) (Recommended)

**Approach**: Database-level tenant isolation that cannot be bypassed

**Implementation**:
```sql
-- 1. Enable RLS on all user-owned tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- 2. Create RLS policies using session variable
CREATE POLICY profile_isolation ON profiles
  USING (user_id = current_setting('app.user_id')::uuid);

CREATE POLICY capture_isolation ON captures
  USING (profile_id IN (
    SELECT id FROM profiles WHERE user_id = current_setting('app.user_id')::uuid
  ));

CREATE POLICY memory_isolation ON memories
  USING (profile_id IN (
    SELECT id FROM profiles WHERE user_id = current_setting('app.user_id')::uuid
  ));

-- 3. Application sets user context for every request
// Middleware:
export async function withTenantContext<T>(
  userId: string,
  fn: (db: Database) => Promise<T>
): Promise<T> {
  await db.execute(sql`SET LOCAL app.user_id = ${userId}`);
  return fn(db);
}

// Usage in Server Actions:
export async function getMemories(profileId: string) {
  const session = await auth();

  return withTenantContext(session.userId, async (db) => {
    // RLS automatically enforces ownership
    return db.select().from(memories).where(eq(memories.profileId, profileId));
  });
}
```

**Pros**:
- Cannot be bypassed by application bugs
- Automatic enforcement on ALL queries
- PostgreSQL native feature
- Zero trust - verified at DB level

**Cons**:
- Requires session variable management
- Slightly more complex connection handling
- Testing must set user context

**Effort**: Medium (2 days to implement + test)
**Risk**: Low - industry standard practice

### Solution 2: Application-Layer Ownership Checks

**Approach**: Enforce ownership in every query via helper functions

**Implementation**:
```typescript
// Tenant-aware query wrapper
export async function queryWithOwnership<T>(
  userId: string,
  profileId: string,
  query: (db: Database) => Promise<T>
): Promise<T> {
  // Verify user owns profile
  const profile = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      eq(profiles.userId, userId)
    )
  });

  if (!profile) {
    throw new Error('Profile not found or access denied');
  }

  return query(db);
}

// All queries MUST use this wrapper
export async function getMemories(userId: string, profileId: string) {
  return queryWithOwnership(userId, profileId, async (db) => {
    return db.select().from(memories).where(eq(memories.profileId, profileId));
  });
}

// Linter rule to enforce wrapper usage
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.object.name='db'][callee.property.name=/^(select|update|delete)$/]:not(CallExpression[callee.name='queryWithOwnership'] *)",
        "message": "Direct db queries forbidden. Use queryWithOwnership() to enforce tenant isolation."
      }
    ]
  }
}
```

**Pros**:
- Explicit in application code
- Easier to understand/debug
- No session variable complexity

**Cons**:
- Can be bypassed if developer forgets
- Relies on code review catching mistakes
- ESLint rules can be disabled
- Higher risk of bugs

**Effort**: Low (1 day)
**Risk**: MEDIUM - Human error likely

### Solution 3: Both RLS + Application Checks (Defense in Depth)

**Approach**: Implement both Solution 1 and Solution 2

**Pros**:
- Maximum security
- RLS catches application bugs
- Application checks provide clear errors

**Cons**:
- Double verification overhead
- Most complex implementation

**Effort**: Medium (3 days)
**Risk**: Low - best security posture

## Recommended Action

**Choose Solution 1: PostgreSQL RLS**

Database-level enforcement prevents entire classes of bugs. RLS is automatic, cannot be bypassed, and provides zero-trust security. Add application-level checks later if needed for better error messages.

## Technical Details

**Affected Components**:
- All database queries in `src/lib/db/`
- Drizzle schema: `src/lib/db/schema.ts`
- Database migration for RLS policies
- Middleware for setting user context

**Database Changes**:
```sql
-- migrations/00X-add-row-level-security.sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_user_isolation ON profiles
  FOR ALL
  USING (user_id = current_setting('app.user_id')::uuid);

CREATE POLICY capture_user_isolation ON captures
  FOR ALL
  USING (profile_id IN (
    SELECT id FROM profiles WHERE user_id = current_setting('app.user_id')::uuid
  ));

CREATE POLICY memory_user_isolation ON memories
  FOR ALL
  USING (profile_id IN (
    SELECT id FROM profiles WHERE user_id = current_setting('app.user_id')::uuid
  ));

-- Allow superuser bypass for migrations
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE captures FORCE ROW LEVEL SECURITY;
ALTER TABLE memories FORCE ROW LEVEL SECURITY;
```

**New Code Patterns**:
```typescript
// lib/db/tenant-context.ts
import { AsyncLocalStorage } from 'async_hooks';

const tenantContext = new AsyncLocalStorage<{ userId: string }>();

export function withTenant<T>(userId: string, fn: () => T): T {
  return tenantContext.run({ userId }, fn);
}

export function getTenantUserId(): string {
  const context = tenantContext.getStore();
  if (!context) {
    throw new Error('No tenant context - this is a bug');
  }
  return context.userId;
}

// Wrap all Server Actions
export async function getMemoriesAction(profileId: string) {
  const session = await auth();
  return withTenant(session.userId, async () => {
    // Set DB session variable
    await db.execute(sql`SET LOCAL app.user_id = ${session.userId}`);
    // Query automatically filtered by RLS
    return db.select().from(memories).where(eq(memories.profileId, profileId));
  });
}
```

## Acceptance Criteria

- [ ] RLS enabled on profiles, captures, memories tables
- [ ] RLS policies created for user isolation
- [ ] Migration tested: user A cannot access user B's data
- [ ] All Server Actions wrapped with tenant context
- [ ] Session variable `app.user_id` set on every request
- [ ] Tests verify RLS enforcement
- [ ] Error logs capture RLS violations
- [ ] Documentation added: "Tenant Isolation Architecture"

## Work Log

### 2026-02-10
- **Review finding**: Security sentinel identified missing tenant isolation
- **Severity**: Marked as P1 CRITICAL - data breach risk
- **Decision needed**: RLS vs application-layer vs both
- **Next step**: Implement RLS policies and test enforcement

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L629) - Tenant isolation mention (insufficient)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security) - Excellent examples
- [Neon + RLS](https://neon.tech/docs/guides/row-level-security) - Serverless Postgres RLS
