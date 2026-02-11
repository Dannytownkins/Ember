---
status: pending
priority: p3
issue_id: "021"
tags: [code-review, testing, performance, load-testing]
dependencies: []
---

# Problem Statement

**TESTING GAP**: "100 concurrent captures" is mentioned in acceptance criteria (line 424) but no test plan exists. No k6, Artillery, or similar load testing tool is configured. Cannot validate the system handles real-world load before launch.

**Why This Matters**: The capture pipeline involves multiple expensive operations: Claude API calls, database writes, optional image uploads to R2. Without load testing, the first traffic spike (e.g., Product Hunt launch day) could cause cascading failures. Neon's serverless Postgres has connection limits, Vercel functions have concurrency caps, and Claude API has rate limits. None of these are tested under load.

## Findings

**Source**: architecture-strategist

**Evidence**:
- Rollout checklist mentions "100 concurrent captures succeed" (line 424) with no test plan
- No load testing tool referenced in project structure or dependencies
- Neon serverless Postgres connection pooling limits unknown
- Vercel function concurrency limits not documented
- Claude API rate limits not tested under concurrent load
- `after()` async processing behavior under concurrent load is untested

**Impact Severity**: LOW - Risk surfaces only at scale or during launch spikes

## Proposed Solutions

### Solution 1: k6 Load Test Scripts (Recommended)

**Approach**: Write k6 scripts targeting capture and memory query endpoints

**Implementation**:
```javascript
// load-tests/capture-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const captureLatency = new Trend('capture_latency');

export const options = {
  scenarios: {
    // Simulate Product Hunt launch spike
    launch_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },   // Ramp up
        { duration: '1m', target: 100 },    // Peak load
        { duration: '30s', target: 0 },     // Cool down
      ],
    },
    // Steady-state normal usage
    steady_state: {
      executor: 'constant-arrival-rate',
      rate: 10,            // 10 requests per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // 95% under 3s
    errors: ['rate<0.05'],               // Less than 5% errors
    capture_latency: ['p(99)<5000'],     // 99% captures under 5s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_TOKEN = __ENV.API_TOKEN;

export default function () {
  // Test paste capture endpoint
  const captureRes = http.post(
    `${BASE_URL}/api/v1/captures`,
    JSON.stringify({
      method: 'paste',
      rawText: `User: I've been working on a Next.js project called Ember.
AI: That sounds interesting! Tell me more about Ember.
User: It's a cross-platform AI memory system. I want my AI to remember me across platforms.
AI: That's a fascinating concept. How does it handle memory extraction?`,
      profileId: __ENV.TEST_PROFILE_ID,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
    }
  );

  captureLatency.add(captureRes.timings.duration);

  check(captureRes, {
    'capture returns 200 or 202': (r) => r.status === 200 || r.status === 202,
    'capture returns captureId': (r) => JSON.parse(r.body).id !== undefined,
  });

  errorRate.add(captureRes.status >= 400);

  sleep(1);
}

// load-tests/memory-query-load.js
export default function () {
  const memoriesRes = http.get(
    `${BASE_URL}/api/v1/memories?category=work&limit=50`,
    {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    }
  );

  check(memoriesRes, {
    'memories returns 200': (r) => r.status === 200,
    'memories returns array': (r) => Array.isArray(JSON.parse(r.body)),
    'response under 500ms': (r) => r.timings.duration < 500,
  });
}
```

```json
// package.json scripts
{
  "scripts": {
    "test:load": "k6 run load-tests/capture-load.js",
    "test:load:memories": "k6 run load-tests/memory-query-load.js",
    "test:load:staging": "BASE_URL=https://staging.ember.app k6 run load-tests/capture-load.js"
  }
}
```

**Pros**:
- Industry-standard load testing tool
- JavaScript-based (familiar to the team)
- Supports ramping, steady-state, and spike scenarios
- Built-in thresholds for pass/fail
- Can run in CI via GitHub Actions

**Cons**:
- Requires API endpoints to exist (depends on issue 001)
- k6 is a separate binary install
- Claude API calls during load tests cost real money

**Effort**: Low (half day)
**Risk**: Low

### Solution 2: Vercel Edge Functions Stress Testing

**Approach**: Test Vercel-specific concurrency and cold start behavior

**Implementation**:
```typescript
// load-tests/vercel-stress.ts
// Test cold start + warm function performance

import { chromium } from 'playwright';

async function stressTestCaptureUI(concurrency: number) {
  const browsers = await Promise.all(
    Array.from({ length: concurrency }, () => chromium.launch())
  );

  const results = await Promise.allSettled(
    browsers.map(async (browser, i) => {
      const page = await browser.newPage();
      const start = Date.now();

      await page.goto(`${process.env.BASE_URL}/capture`);
      await page.fill('textarea[name="rawText"]', `Test capture ${i}`);
      await page.click('button[type="submit"]');

      // Wait for processing to complete
      await page.waitForSelector('[data-status="completed"]', {
        timeout: 30000,
      });

      return {
        duration: Date.now() - start,
        index: i,
      };
    })
  );

  for (const browser of browsers) {
    await browser.close();
  }

  return results;
}
```

**Pros**:
- Tests actual UI flow end-to-end
- Validates Vercel function scaling behavior
- Catches cold start issues

**Cons**:
- Playwright is heavy for load testing
- Expensive to run many concurrent browsers
- Better suited for smoke testing than sustained load

**Effort**: Medium (1 day)
**Risk**: Low

### Solution 3: Gradual Rollout with Load Monitoring

**Approach**: Skip pre-launch load tests; instead monitor real traffic with alerts

**Implementation**:
```typescript
// lib/monitoring/performance.ts
import { headers } from 'next/headers';

export async function trackRequestPerformance(
  action: string,
  fn: () => Promise<unknown>
) {
  const start = performance.now();

  try {
    const result = await fn();
    const duration = performance.now() - start;

    // Log to Vercel Analytics or custom metrics
    console.log(JSON.stringify({
      type: 'performance',
      action,
      duration,
      status: 'success',
      timestamp: new Date().toISOString(),
    }));

    return result;
  } catch (error) {
    const duration = performance.now() - start;

    console.log(JSON.stringify({
      type: 'performance',
      action,
      duration,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown',
      timestamp: new Date().toISOString(),
    }));

    throw error;
  }
}
```

**Pros**:
- No upfront work required
- Real production data is more accurate than synthetic tests
- Can identify actual bottlenecks as they appear

**Cons**:
- Reactive, not proactive
- Launch day failures affect real users
- Harder to reproduce and fix issues under live pressure

**Effort**: Low (half day)
**Risk**: MEDIUM - Discovery happens in production

## Recommended Action

**Choose Solution 1: k6 Load Test Scripts**

Write k6 scripts for the capture endpoint and memory query endpoint. Run them against a staging environment before launch. Set thresholds at 95th percentile < 3s for captures and < 500ms for memory queries. This validates the system handles Product Hunt launch traffic without surprises.

## Technical Details

**Affected Components**:
- `load-tests/` (new directory)
- `package.json` (add test:load scripts)
- CI pipeline (optional k6 run on staging deploys)
- API endpoints (must exist first - see issue 001)

**Database Changes**: None

**New Dependencies**:
```
k6 (binary, not npm package)
```

## Acceptance Criteria

- [ ] k6 load test script for capture endpoint exists
- [ ] k6 load test script for memory query endpoint exists
- [ ] Thresholds defined: p95 < 3s capture, p95 < 500ms query
- [ ] 100 concurrent captures complete without errors
- [ ] Neon connection pool handles peak load without exhaustion
- [ ] Results documented with bottleneck analysis
- [ ] Load test can run against staging environment

## Work Log

### 2026-02-10
- **Review finding**: Architecture strategist noted "100 concurrent captures" acceptance criteria with no test plan
- **Severity**: Marked as P3 - important for launch confidence but not a functional blocker
- **Current state**: Zero load testing infrastructure
- **Next step**: Write k6 scripts after API endpoints exist (depends on issue 001)

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L424) - Load test acceptance criteria
- [k6 Documentation](https://k6.io/docs/)
- [Neon Connection Pooling](https://neon.tech/docs/connect/connection-pooling)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
