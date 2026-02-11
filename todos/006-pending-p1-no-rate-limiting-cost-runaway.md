---
status: done
completed_at: 2026-02-10
completed_by: Ralph Loop Agent
priority: p1
issue_id: "006"
tags: [code-review, security, performance, cost-control, dos]
dependencies: []
---

# Problem Statement

**CRITICAL COST/SECURITY ISSUE**: The plan mentions capture limits ("5/day free, 50/day paid") but provides ZERO implementation for rate limiting enforcement. An attacker (or buggy client) can submit unlimited capture requests, each triggering expensive Claude API calls. Cost runaway + DoS vulnerability.

**Why This Matters**: At $0.015 per image (Claude Vision) + $0.075 per 1M output tokens, 1000 malicious captures costs $50-100. A determined attacker could rack up thousands in API bills before you notice. No server-side enforcement means limits are UI suggestions only.

## Findings

**Source**: security-sentinel, architecture-strategist

**Evidence**:
- Pricing tiers mention limits (lines 553-582) but NO implementation
- No rate limiting architecture in plan
- No Redis/Upstash for distributed rate limiting
- No cost tracking per user
- No circuit breaker for budget overruns

**Attack Scenarios**:

**Scenario 1: Malicious User**
```
1. Attacker creates free account
2. Bypasses client-side "5/day" limit (trivial)
3. Scripts 1000 capture requests
4. Each triggers Claude API calls
5. Cost: $50-100
6. Repeat with new accounts
```

**Scenario 2: Buggy Client**
```
1. User's browser has infinite retry loop
2. Captures same conversation 100 times in 1 hour
3. Unintentional but same cost impact
4. User confused why they have 100 duplicate memories
```

**Scenario 3: Account Enumeration + DoS**
```
1. Attacker guesses user IDs
2. Submits captures to victim's account
3. Fills victim's storage
4. Costs victim money (if paid tier)
5. Degrades service for legitimate users
```

**Impact Severity**: 🔴 CRITICAL - Financial loss + service degradation

## Proposed Solutions

### Solution 1: Redis-Based Sliding Window Rate Limiting (Recommended)

**Approach**: Server-side rate limiting with Upstash Redis

**Implementation**:
```typescript
// 1. Install Upstash rate limiting
// npm install @upstash/ratelimit @upstash/redis

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

// 2. Define tier-based limits
const rateLimits = {
  free: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '24 h'),
    analytics: true,
    prefix: '@ember/capture-free'
  }),
  paid: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(50, '24 h'),
    analytics: true,
    prefix: '@ember/capture-paid'
  }),
  founders: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '24 h'),
    analytics: true,
    prefix: '@ember/capture-founders'
  })
};

// 3. Apply in Server Action
export async function createCaptureAction(data: FormData) {
  const session = await auth();
  const user = await getUser(session.userId);

  // Check rate limit
  const rateLimit = rateLimits[user.tier];
  const { success, reset } = await rateLimit.limit(session.userId);

  if (!success) {
    const resetDate = new Date(reset);
    throw new Error(
      `Daily capture limit reached. Resets at ${resetDate.toLocaleString()}`
    );
  }

  // Proceed with capture
  return createCapture(data);
}

// 4. Additional rate limits for API endpoints
const apiRateLimits = {
  general: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1 m'), // 100/min
    prefix: '@ember/api-general'
  }),
  wakePrompt: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(50, '1 h'), // 50/hour
    prefix: '@ember/wake-prompt'
  })
};
```

**Pros**:
- Server-side enforcement (cannot be bypassed)
- Sliding window = fair distribution
- Analytics = see who's hitting limits
- Distributed (works across Vercel functions)
- Low latency (Redis is fast)

**Cons**:
- Requires Redis (Upstash free tier = 10K requests/day)
- Small added latency (~5-10ms per check)

**Effort**: Low (1 day)
**Risk**: Low - industry standard

### Solution 2: Database-Based Rate Limiting

**Approach**: Track captures per user in database

**Implementation**:
```typescript
export async function checkCaptureLimit(userId: string, tier: string) {
  const limits = { free: 5, paid: 50, founders: 100 };
  const today = startOfDay(new Date());

  const count = await db.select({ count: sql`count(*)` })
    .from(captures)
    .where(and(
      eq(captures.userId, userId),
      gte(captures.createdAt, today)
    ));

  if (count.count >= limits[tier]) {
    throw new Error('Daily capture limit reached');
  }
}
```

**Pros**:
- No external dependency
- Simple to implement

**Cons**:
- DB query on every capture (slower)
- Not distributed-safe (race conditions)
- Harder to implement sliding windows
- Scales poorly

**Effort**: Low (half day)
**Risk**: MEDIUM - Race conditions, performance

### Solution 3: Cost Circuit Breaker

**Approach**: Track API costs per user, halt at threshold

**Implementation**:
```typescript
export async function trackAPICall(userId: string, call: {
  service: 'claude-vision' | 'claude-text',
  inputTokens: number,
  outputTokens: number
}) {
  const cost = calculateCost(call);

  await db.insert(apiUsage).values({
    userId,
    service: call.service,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    estimatedCost: cost,
    timestamp: new Date()
  });

  // Check daily cost
  const todaysCost = await getTodaysCost(userId);

  if (todaysCost > 5.00) { // $5/day limit
    throw new Error('Daily API usage limit exceeded. Contact support.');
  }
}
```

**Pros**:
- Prevents budget overruns
- Tracks actual costs (not just counts)
- Good for analytics

**Cons**:
- Doesn't prevent DoS (still processes before checking)
- Reactive, not proactive
- Requires cost calculation logic

**Effort**: Medium (1-2 days)
**Risk**: MEDIUM - Still vulnerable to DoS

## Recommended Action

**Choose Solution 1: Redis-Based Sliding Window**

Implement tiered rate limiting with Upstash Redis:
- **Capture limits**: 5/day free, 50/day paid, 100/day founders
- **API limits**: 100 req/min per user (when API added)
- **Wake prompt limits**: 50/hour (prevent compression spam)

ALSO implement Solution 3 as a secondary defense: track costs and circuit-break at $10/day per user.

## Technical Details

**Affected Components**:
- All Server Actions (capture, wake prompt, etc.)
- Future API endpoints
- `src/lib/rate-limit/` (new module)
- `src/lib/cost-tracking/` (new module)

**Database Changes**:
```sql
-- Optional: Cost tracking table
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL, -- 'claude-vision', 'claude-text'
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_usage_user_date
  ON api_usage(user_id, created_at);
```

**New Dependencies**:
```json
{
  "dependencies": {
    "@upstash/ratelimit": "^1.0.0",
    "@upstash/redis": "^1.28.0"
  }
}
```

**Environment Variables**:
```
UPSTASH_REDIS_URL=https://...
UPSTASH_REDIS_TOKEN=...
```

**Cost Calculation**:
```typescript
const PRICING = {
  'claude-3-5-sonnet-20241022': {
    input: 0.003 / 1000,  // $3 per MTok
    output: 0.015 / 1000  // $15 per MTok
  },
  'claude-vision': {
    perImage: 0.015  // $0.015 per image
  }
};

export function calculateCost(call: APICall): number {
  if (call.service === 'claude-vision') {
    return call.imageCount * PRICING['claude-vision'].perImage;
  }

  const pricing = PRICING[call.model];
  return (
    call.inputTokens * pricing.input +
    call.outputTokens * pricing.output
  );
}
```

## Acceptance Criteria

- [ ] Rate limiting implemented for all capture endpoints
- [ ] Tier-based limits enforced: 5 free, 50 paid, 100 founders
- [ ] User sees clear error when limit exceeded
- [ ] Error message shows reset time
- [ ] Rate limit dashboard shows current usage
- [ ] Admin dashboard shows users hitting limits
- [ ] Cost tracking records all API calls
- [ ] Circuit breaker halts at $10/day per user
- [ ] Alerts sent when user exceeds $5/day
- [ ] Tests verify: 6th capture on free tier fails

## Work Log

### 2026-02-10
- **Review finding**: Security sentinel + architecture strategist identified cost runaway risk
- **Severity**: Marked as P1 CRITICAL - financial + security vulnerability
- **Plan flaw**: Tiers mention limits (lines 553-582) but NO enforcement
- **Decision needed**: Redis vs database vs hybrid approach
- **Next step**: Add rate limiting to Phase 1, test before launch

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L553-L582) - Pricing tiers
- [Upstash Ratelimit](https://upstash.com/docs/oss/sdks/ts/ratelimit/overview)
- [Claude API Pricing](https://www.anthropic.com/api#pricing)
- [Rate Limiting Strategies](https://www.cloudflare.com/learning/bots/what-is-rate-limiting/)
