---
status: pending
priority: p1
issue_id: "000"
tags: [meta, prioritization, implementation-plan]
dependencies: []
---

# P1 Critical Issues - Prioritized Implementation Plan

## Overview

**Total P1 Issues**: 6 critical blocking issues (4 active, 2 deferred)
**Estimated Total Effort**: 9 days
**Chosen Approach**: 9-day plan with Inngest queue

## Decisions Made (2026-02-10)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Email Capture | **Phase 2** | Paste + screenshot enough to validate. Nobody's asked for it. |
| Soft Delete | **Phase 1.5** (2 weeks post-launch) | Strong confirmation dialogs for now. Low user count = low risk. |
| Queue System | **Inngest** | 4 hours vs 2 days. Managed retries + observability. $20/mo is nothing. |
| Timeline | **9 days** | Secure MVP without over-engineering. |

### Active P1 Work (9 days)
1. Background Queue — Inngest (Days 1-2)
2. API Layer for Agents (Days 3-5)
3. Row-Level Security (Days 6-7)
4. Rate Limiting — Upstash (Day 8-9)

### Deferred
- ~~Email Capture Security~~ → Phase 2
- ~~Soft Delete~~ → Phase 1.5 (confirmation dialogs as interim)

---

## Implementation Waves

### 🌊 Wave 1: Foundation (Days 1-5)
**Goal**: Fix blocking architecture issues that prevent MVP from working

### 🌊 Wave 2: Security Hardening (Days 6-10)
**Goal**: Lock down data access and prevent attacks

### 🌊 Wave 3: Operational Safety (Days 11-13)
**Goal**: Prevent cost overruns and data loss

---

## Wave 1: Foundation (IMPLEMENT FIRST)

### Priority #1: 🔴 Background Queue System
**Issue**: [`005-pending-p1-async-processing-timeout-risk.md`](todos/005-pending-p1-async-processing-timeout-risk.md)

**Why First**:
- **BLOCKS MVP**: Multi-screenshot captures will fail without this
- **Foundation for other features**: Wake prompt generation, compression, etc.
- **No workarounds**: `after()` fundamentally cannot handle the workload

**Implementation Order**:
```
Day 1-2: Choose & implement queue (recommend Inngest for speed)
Day 2-3: Migrate capture processing from after() to queue
Day 3: Test 10-screenshot capture end-to-end
```

**Quick Decision Matrix**:
| Solution | Setup Time | Complexity | Cost | Recommendation |
|----------|-----------|------------|------|----------------|
| Inngest | 4 hours | Low | $0-20/mo | ✅ **Best for speed** |
| BullMQ + Upstash | 1 day | Medium | $0/mo | ✅ **Best for control** |
| Vercel Cron | 4 hours | Low | $0/mo | ❌ Doesn't solve timeout |

**Recommended**: Inngest (fastest to ship, proven reliability)

**Output**: Capture processing survives 5+ minute executions, progress tracking works

---

### Priority #2: 🟠 API Layer for Agents
**Issue**: [`001-pending-p1-no-api-layer-for-agents.md`](todos/001-pending-p1-no-api-layer-for-agents.md)

**Why Second**:
- **CORE VALUE PROP**: Product is ABOUT AI memory but agents can't access it
- **Validates architecture**: If you can't API it, it's too UI-coupled
- **Early integration testing**: Need API to test with real agents

**Implementation Order**:
```
Day 3-4: Add api_tokens table to schema
Day 4: Create POST /api/v1/captures endpoint
Day 4: Create GET /api/v1/memories endpoint
Day 5: Create POST /api/v1/wake-prompts endpoint
Day 5: Add Bearer token authentication middleware
Day 5: Write OpenAPI spec (auto-generate from Zod schemas)
```

**Critical Path**:
1. Database schema → API routes → Auth middleware → Docs
2. Start with read-only endpoints (GET /memories) - safest
3. Add write endpoints after authentication works

**Output**: Agents can capture memories and generate wake prompts programmatically

**Quick Win**: Once this exists, you can build an MCP tool for Claude Code in ~2 hours

---

## Wave 2: Security Hardening (IMPLEMENT SECOND)

### Priority #3: 🔴 Row-Level Security (RLS)
**Issue**: [`003-pending-p1-tenant-isolation-insufficient.md`](todos/003-pending-p1-tenant-isolation-insufficient.md)

**Why Third**:
- **PREVENTS DATA BREACH**: One missing ownership check = full breach
- **Must be in place before API launch**: API increases attack surface
- **Cannot be added later**: Migrations are tricky once data exists

**Implementation Order**:
```
Day 6: Enable RLS on profiles, captures, memories tables
Day 6: Create RLS policies (profile_user_isolation, etc.)
Day 7: Add tenant context middleware (set app.user_id)
Day 7: Wrap all Server Actions with tenant context
Day 7-8: Test: User A cannot access User B's data
```

**Critical**: DO THIS BEFORE launching API endpoints publicly

**Testing Strategy**:
```typescript
// Test RLS enforcement
describe('Row Level Security', () => {
  it('prevents cross-tenant data access', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    const memoryA = await createMemory(userA.id);

    // Try to access as User B (should fail)
    await withTenant(userB.id, async () => {
      const result = await db.select()
        .from(memories)
        .where(eq(memories.id, memoryA.id));

      expect(result).toHaveLength(0); // RLS blocks it
    });
  });
});
```

**Output**: Database-level tenant isolation that cannot be bypassed

---

### Priority #4: 🟠 Rate Limiting
**Issue**: [`006-pending-p1-no-rate-limiting-cost-runaway.md`](todos/006-pending-p1-no-rate-limiting-cost-runaway.md)

**Why Fourth**:
- **PREVENTS COST RUNAWAY**: Unlimited API usage = bankruptcy
- **Quick to implement**: 1 day with Upstash
- **Should be in place before API launch**: Protect from day 1

**Implementation Order**:
```
Day 8: Set up Upstash Redis (10 min)
Day 8: Install @upstash/ratelimit (5 min)
Day 8: Create tier-based rate limiters (5 free, 50 paid, 100 founders)
Day 8: Apply to Server Actions and API routes
Day 8: Add rate limit headers (X-RateLimit-Remaining, etc.)
Day 8: Build rate limit dashboard for users
```

**Quick Win**: This is the FASTEST P1 fix (single day)

**Implementation**:
```typescript
// Apply rate limiting to all protected actions
export async function createCaptureAction(data: FormData) {
  const session = await auth();
  const user = await getUser(session.userId);

  // Check rate limit
  const { success, remaining, reset } = await checkRateLimit(
    session.userId,
    user.tier
  );

  if (!success) {
    return {
      status: 'error',
      error: `Daily limit reached. Resets at ${new Date(reset).toLocaleString()}`,
      remaining: 0,
      reset
    };
  }

  // Proceed...
}
```

**Output**: Tiered rate limiting prevents abuse and cost overruns

---

## Wave 3: Operational Safety (IMPLEMENT THIRD)

### Priority #5: 🟡 Email Capture Security
**Issue**: [`002-pending-p1-email-capture-spoofing.md`](todos/002-pending-p1-email-capture-spoofing.md)

**Why Fifth**:
- **Email capture is Phase 2**: Not needed for initial MVP
- **Can defer if shipping paste + screenshot only**: Reduces scope
- **Important but not blocking**: Users can still capture memories without email

**Implementation Order** (IF including email in MVP):
```
Day 9: Add verified_senders table to schema
Day 9: Implement DKIM/SPF validation in webhook
Day 10: Build email verification workflow
Day 10: Create verification email templates
Day 10: Add quarantine system for suspicious emails
```

**Alternative**: DEFER to Phase 2
- Ship MVP with paste + screenshot only
- Add email capture after validating core product
- Saves 2-3 days

**Decision Point**: Is email capture critical for MVP or can it wait?

**Output**: Email capture is secure against spoofing attacks

---

### Priority #6: 🟡 Soft Delete
**Issue**: [`004-pending-p1-soft-delete-missing-data-loss-risk.md`](todos/004-pending-p1-soft-delete-missing-data-loss-risk.md)

**Why Sixth (Last)**:
- **Important but not immediate**: Data loss risk is real but manageable pre-launch
- **Can be added without breaking changes**: Schema addition is safe
- **User education helps**: "Are you sure?" dialogs reduce accidental deletes

**Implementation Order**:
```
Day 11: Add deletedAt columns to all tables
Day 11-12: Update all queries to filter WHERE deletedAt IS NULL
Day 12: Implement soft delete helpers (softDelete, restore)
Day 12: Build account deletion workflow (export → soft delete)
Day 13: Create cron job for 30-day purge
Day 13: Test: Delete → restore → data intact
```

**Quick Win**: The schema change is trivial (4 ALTER TABLE statements)

**Critical**: Update Clerk webhook to soft delete, not hard delete

**Output**: 30-day recovery window for deleted accounts

---

## Dependency Graph

```
Priority 1 (Background Queue) ──┐
                                 ├──> Priority 3 (RLS) ──> Priority 4 (Rate Limit)
Priority 2 (API Layer) ──────────┘                               │
                                                                  ├──> Priority 5 (Email Security)
                                                                  │
                                                                  └──> Priority 6 (Soft Delete)
```

**Critical Path**: 1 → 2 → 3 → 4 (Days 1-8)
**Optional Additions**: 5 → 6 (Days 9-13)

---

## Recommended Implementation Schedule

### Week 1: Foundation + Security Core

**Monday-Tuesday (Days 1-2)**: Background Queue
- Morning: Choose queue system (recommend Inngest)
- Afternoon: Set up Inngest + create first job
- Next day: Migrate capture processing
- Test: 10-screenshot capture completes

**Wednesday-Friday (Days 3-5)**: API Layer
- Wed: Schema + auth middleware
- Thu: Core endpoints (captures, memories)
- Fri: Wake prompts + OpenAPI docs

**Weekend**: Rest or test agent integrations

### Week 2: Security Hardening

**Monday-Tuesday (Days 6-7)**: RLS
- Mon: Enable RLS + create policies
- Tue: Tenant context + testing

**Wednesday (Day 8)**: Rate Limiting
- Full day: Upstash setup + implementation
- Quick win!

**Thursday-Friday (Days 9-10)**: Email Security (OPTIONAL)
- Only if email capture is MVP-critical
- Otherwise: Ship without email, add in Phase 2

### Week 3: Operational Safety (OPTIONAL)

**Monday-Wednesday (Days 11-13)**: Soft Delete
- Can defer to post-launch
- Or implement if time allows

---

## Critical Success Factors

### ✅ Must Have (Blocks Launch)

1. ✅ Background queue working (capture processing survives 5+ minutes)
2. ✅ API endpoints exist (agents can access)
3. ✅ RLS enforced (tenant isolation at DB level)
4. ✅ Rate limiting active (cost protection)

**Launch Criteria**: All 4 must be complete and tested

### 🟡 Should Have (High Priority)

5. 🟡 Email security OR remove email capture from MVP
6. 🟡 Soft delete OR strong deletion confirmation flow

**Launch Decision**: Pick one approach for each

---

## Alternative Fast-Track Plan (7 Days)

If you need to ship faster, here's the minimal viable security:

**Days 1-2**: Background Queue (Inngest - fastest)
**Days 3-4**: API Layer (minimal - captures + memories only)
**Days 5-6**: RLS (database-level security)
**Day 7**: Rate Limiting (Upstash - fastest)

**Skip for now**:
- Email capture (defer to Phase 2)
- Soft delete (add in Phase 1.5 within 2 weeks of launch)

**Risk**: Moderate - email attacks unlikely at small scale, accidental deletes preventable with UI confirms

---

## Decision Points

### 1. Email Capture: Include in MVP or defer?

**Include if**:
- Mobile users are primary target
- Email is the "killer feature" differentiation
- You have 13 days for implementation

**Defer if**:
- Paste + screenshot are sufficient for validation
- Want to ship faster (save 2-3 days)
- Email is Phase 2 feature anyway

**Recommendation**: **DEFER** - Ship paste + screenshot MVP, add email in Phase 2 after validation

---

### 2. Soft Delete: Implement now or post-launch?

**Implement now if**:
- Paranoid about data loss (good instinct)
- Have 13 days for implementation
- Want zero risk pre-launch

**Defer if**:
- Need to ship in 7-8 days
- Will add strong UI confirmation dialogs
- Can implement in Phase 1.5 (within 2 weeks of launch)

**Recommendation**: **DEFER to Phase 1.5** - Add strong "Are you sure?" flows, implement soft delete 1-2 weeks post-launch

---

### 3. Background Queue: Inngest vs BullMQ?

**Choose Inngest if**:
- Want to ship fastest (4 hours to production-ready)
- Prefer managed service (less ops)
- Okay with $20/mo cost at scale

**Choose BullMQ if**:
- Want maximum control
- Already comfortable with Redis
- Prefer open source + self-hosted

**Recommendation**: **Inngest** for MVP speed, can migrate to BullMQ later if needed

---

## Testing Strategy

### After Each Wave

**Wave 1 Tests** (Foundation):
```bash
✓ 10-screenshot capture completes without timeout
✓ API endpoints return valid responses
✓ Bearer token authentication works
✓ OpenAPI spec validates
```

**Wave 2 Tests** (Security):
```bash
✓ RLS prevents cross-tenant access
✓ Rate limiting blocks after limit exceeded
✓ Rate limit resets at correct time
✓ API returns 429 with retry-after header
```

**Wave 3 Tests** (Operational):
```bash
✓ Email capture rejects unverified senders
✓ Soft delete marks records, doesn't remove
✓ Restore recovers soft-deleted data
✓ 30-day purge removes old soft-deleted records
```

---

## Rollout Checklist

Before considering P1 fixes "complete":

- [ ] All priority 1-4 implemented and tested (Days 1-8)
- [ ] End-to-end test: User signs up → captures memories → generates wake prompt → API works
- [ ] Security test: User A cannot access User B's data
- [ ] Load test: 100 concurrent captures succeed
- [ ] Cost test: Rate limiting prevents runaway costs
- [ ] Documentation: API docs published, MCP tool example provided
- [ ] Monitoring: Error tracking (Sentry), metrics dashboard
- [ ] Deployment: Staging environment smoke tested

**Only then**: Ship Phase 1 MVP

---

## Budget & Timeline Summary

### Minimum Viable Security (7 days)
- Background Queue: 2 days
- API Layer: 2 days
- RLS: 2 days
- Rate Limiting: 1 day
- **Total: 7 days**
- **Deferred**: Email security, soft delete

### Full P1 Coverage (10 days)
- Background Queue: 2 days
- API Layer: 2 days
- RLS: 2 days
- Rate Limiting: 1 day
- Email Security: 2 days
- **Total: 9 days**
- **Deferred**: Soft delete (Phase 1.5)

### Complete P1 Implementation (13 days)
- All 6 P1 issues addressed
- Zero deferred items
- **Total: 13 days**

**Recommendation**: **9-day plan** (defer soft delete to Phase 1.5, skip email in MVP)

---

## Next Actions

1. **Choose timeline**: 7-day / 9-day / 13-day plan
2. **Make deferral decisions**: Email? Soft delete?
3. **Set up infrastructure**: Inngest account, Upstash Redis
4. **Create implementation branch**: `git checkout -b feat/p1-fixes`
5. **Start with Priority #1**: Background queue (easiest to validate)
6. **Track progress**: Update todo files as you complete each fix

---

## Success Metrics

**You'll know P1 fixes are complete when**:

✅ 10-screenshot capture processes successfully in < 5 minutes
✅ Agent can capture memory via API without human intervention
✅ User A's data is invisible to User B (RLS enforced)
✅ 6th capture on free tier returns "limit exceeded" error
✅ No serverless timeouts in production logs
✅ API costs stay under $10/day total across all users

**Then**: You have a solid foundation for MVP launch 🚀

---

## Questions to Resolve

Before starting implementation, clarify:

1. **Email capture**: MVP feature or Phase 2?
2. **Soft delete**: Phase 1 or Phase 1.5?
3. **Queue choice**: Inngest (fast) or BullMQ (control)?
4. **Timeline target**: 7 / 9 / 13 days?
5. **Launch criteria**: What's the minimum for "safe to ship"?

**Recommendation**:
- Email → Phase 2
- Soft delete → Phase 1.5 (2 weeks post-launch)
- Queue → Inngest
- Timeline → 9 days
- Launch criteria → Priorities 1-4 complete + basic monitoring

This gives you a secure, functional MVP in under 2 weeks. ✨
