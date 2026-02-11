---
status: pending
priority: p2
issue_id: "016"
tags: [code-review, operations, deployment, reliability]
dependencies: []
---

# Problem Statement

**NO HEALTH OR READINESS ENDPOINTS**: The plan has zero mention of `/health`, `/ready`, or any deployment verification endpoints. Vercel deployments have no way to programmatically verify the app is fully functional after deploy. There is no database connectivity check, no Claude API reachability check, no Redis availability check. A failed deployment — database connection string misconfigured, Claude API key expired, environment variable missing — serves a broken app silently. Users discover the breakage, not the deployment pipeline.

**Why This Matters**: Ember's capture pipeline depends on three external services: Neon Postgres (data storage), Claude API (extraction + compression), and eventually Upstash Redis (rate limiting). Any one of these failing means partial or complete app breakage. Without health endpoints, there is no automated way to detect degraded state. A Neon outage means captures silently fail. An expired Claude API key means extraction returns errors. The user sees "processing..." forever with no explanation. Synthetic monitoring, uptime dashboards, and deployment gates all require a health endpoint to function.

## Findings

**Source**: code-review, operations review

**Evidence**:
- No `/health` or `/ready` endpoint in plan architecture (lines 186-211)
- No mention of health checks in deployment strategy
- Plan specifies Vercel deployment (line 227) but no deployment verification
- Neon, Claude API, and Redis (future) are all external dependencies with no connectivity checks
- `after()` async processing (lines 370-401) fails silently if Claude API is down
- No error reporting infrastructure mentioned (no Sentry, no error tracking)
- Capture status polling (`/api/captures/{id}/status` every 3 seconds, line 403) has no timeout or error explanation

**Failure Scenarios**:

**Scenario 1: Database Connection Failure**
```
1. Deploy new version with typo in DATABASE_URL env var
2. App starts, serves HTML/CSS (static parts work)
3. User logs in (Clerk works — separate service)
4. User tries to view memories → 500 error
5. User tries to capture → 500 error
6. No automated detection — broken until someone reports it
```

**Scenario 2: Claude API Key Expiration**
```
1. Claude API key expires or is rotated
2. App starts normally, DB works fine
3. User captures a conversation → status: "processing"
4. after() calls Claude API → 401 Unauthorized
5. Capture status stuck on "processing" forever
6. No alert, no retry, no user feedback
```

**Scenario 3: Partial Degradation**
```
1. Neon has elevated latency (not down, just slow)
2. All queries take 5-10 seconds instead of 50ms
3. App appears functional but unusable
4. No latency monitoring, no degradation alerts
5. Users think Ember is "slow" — churn risk
```

**Impact Severity**: 🟡 MODERATE - Silent deployment failures, no operational visibility

## Proposed Solutions

### Solution 1: Comprehensive /api/health Endpoint (Recommended)

**Approach**: Single health endpoint that checks all critical dependencies and returns structured status with latency metrics.

**Implementation**:
```typescript
// src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  message?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  uptime: number;
  checks: {
    database: HealthCheck;
    claude: HealthCheck;
    redis?: HealthCheck;
  };
}

const startTime = Date.now();

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkClaudeAPI(),
    checkRedis(),
  ]);

  const [dbCheck, claudeCheck, redisCheck] = checks;

  const database = dbCheck.status === 'fulfilled'
    ? dbCheck.value
    : { status: 'unhealthy' as const, latencyMs: 0, message: String(dbCheck.reason) };

  const claude = claudeCheck.status === 'fulfilled'
    ? claudeCheck.value
    : { status: 'unhealthy' as const, latencyMs: 0, message: String(claudeCheck.reason) };

  const redis = redisCheck.status === 'fulfilled'
    ? redisCheck.value
    : undefined; // Redis is optional for now

  // Overall status: unhealthy if any critical check fails
  const criticalChecks = [database, claude];
  const overallStatus = criticalChecks.some(c => c.status === 'unhealthy')
    ? 'unhealthy'
    : criticalChecks.some(c => c.status === 'degraded')
    ? 'degraded'
    : 'healthy';

  const response: HealthResponse = {
    status: overallStatus,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      database,
      claude,
      ...(redis && { redis }),
    },
  };

  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;

  return NextResponse.json(response, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();

  try {
    const result = await db.execute(sql`SELECT 1 as ok`);
    const latencyMs = Date.now() - start;

    if (latencyMs > 2000) {
      return {
        status: 'degraded',
        latencyMs,
        message: `Database responding but slow (${latencyMs}ms)`,
      };
    }

    return { status: 'healthy', latencyMs };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

async function checkClaudeAPI(): Promise<HealthCheck> {
  const start = Date.now();

  try {
    // Minimal API call to verify key validity and connectivity
    // Using messages.count_tokens is cheapest — no generation cost
    const anthropic = new Anthropic();
    await anthropic.messages.countTokens({
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'health check' }],
    });
    const latencyMs = Date.now() - start;

    if (latencyMs > 5000) {
      return {
        status: 'degraded',
        latencyMs,
        message: `Claude API responding but slow (${latencyMs}ms)`,
      };
    }

    return { status: 'healthy', latencyMs };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Claude API unreachable',
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const start = Date.now();

  try {
    if (!process.env.UPSTASH_REDIS_URL) {
      return { status: 'healthy', latencyMs: 0, message: 'Redis not configured (optional)' };
    }

    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL,
      token: process.env.UPSTASH_REDIS_TOKEN!,
    });

    await redis.ping();
    const latencyMs = Date.now() - start;

    return { status: 'healthy', latencyMs };
  } catch (error) {
    return {
      status: 'degraded', // Redis failure is non-critical for now
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Redis unreachable',
    };
  }
}
```

**Separate Readiness Probe**:
```typescript
// src/app/api/ready/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

/**
 * Lightweight readiness probe — only checks if the app can serve requests.
 * Used by load balancers and deployment gates.
 * Does NOT check external APIs (Claude, Redis) — those are checked by /health.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return new NextResponse('OK', { status: 200 });
  } catch {
    return new NextResponse('NOT READY', { status: 503 });
  }
}
```

**Pros**:
- Complete visibility into all dependency health
- Latency tracking catches degradation before outage
- Structured response enables automated monitoring
- Separate `/ready` for deployment gates vs `/health` for deep checks
- Version tracking ties health to specific deployments

**Cons**:
- Claude API health check has minimal cost (~0.001 cents per check)
- Health endpoint itself could be abused for DoS (add rate limiting)
- Must be excluded from authentication middleware

**Effort**: Low (half day)
**Risk**: Low - standard operational practice

### Solution 2: Vercel Deployment Protection with Health Check Integration

**Approach**: Use Vercel's deployment protection features combined with custom health checks to gate deployments.

**Implementation**:
```typescript
// vercel.json
{
  "checks": [
    {
      "name": "Health Check",
      "path": "/api/health",
      "frequency": 60000
    }
  ],
  "headers": [
    {
      "source": "/api/health",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache"
        }
      ]
    }
  ]
}
```

**Deployment Verification Script**:
```typescript
// scripts/verify-deployment.ts
/**
 * Run after Vercel deploy to verify the new deployment is healthy.
 * Usage: npx tsx scripts/verify-deployment.ts <deployment-url>
 */
async function verifyDeployment(url: string) {
  const maxRetries = 5;
  const retryDelay = 5000; // 5 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`);
      const health = await response.json();

      if (health.status === 'healthy') {
        console.log(`Deployment verified healthy (attempt ${attempt})`);
        console.log(`  Version: ${health.version}`);
        console.log(`  DB latency: ${health.checks.database.latencyMs}ms`);
        console.log(`  Claude latency: ${health.checks.claude.latencyMs}ms`);
        process.exit(0);
      }

      if (health.status === 'degraded') {
        console.warn(`Deployment degraded (attempt ${attempt}):`, health);
        // Continue retrying — may be warming up
      }

      if (health.status === 'unhealthy') {
        console.error(`Deployment unhealthy (attempt ${attempt}):`, health);
      }
    } catch (error) {
      console.error(`Health check failed (attempt ${attempt}):`, error);
    }

    if (attempt < maxRetries) {
      console.log(`Retrying in ${retryDelay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  console.error('Deployment verification failed after all retries');
  process.exit(1);
}

const deploymentUrl = process.argv[2];
if (!deploymentUrl) {
  console.error('Usage: npx tsx scripts/verify-deployment.ts <url>');
  process.exit(1);
}

verifyDeployment(deploymentUrl);
```

**Pros**:
- Catches broken deployments before they reach users
- Automated — no human intervention needed
- Retry logic handles cold start latency
- Can be integrated into CI/CD pipeline

**Cons**:
- Only catches issues at deploy time, not runtime degradation
- Vercel-specific configuration
- Doesn't replace ongoing monitoring

**Effort**: Low (half day including CI integration)
**Risk**: Low - additive improvement

### Solution 3: Synthetic Monitoring with Uptime Checks

**Approach**: External monitoring service that periodically hits the health endpoint and alerts on failures.

**Implementation**:
```typescript
// src/lib/monitoring/alerts.ts
/**
 * Health check response processor for external monitoring.
 * Integrates with monitoring webhooks for alerting.
 */
export async function processHealthAlert(health: HealthResponse) {
  if (health.status === 'unhealthy') {
    // Critical alert — page on-call
    await sendAlert({
      severity: 'critical',
      title: `Ember ${health.status.toUpperCase()}: Service unhealthy`,
      details: Object.entries(health.checks)
        .filter(([, check]) => check.status === 'unhealthy')
        .map(([name, check]) => `${name}: ${check.message}`)
        .join('\n'),
      channel: 'pagerduty', // or Discord, Slack, email
    });
  }

  if (health.status === 'degraded') {
    // Warning — notify but don't page
    await sendAlert({
      severity: 'warning',
      title: `Ember DEGRADED: Performance issues detected`,
      details: Object.entries(health.checks)
        .filter(([, check]) => check.status === 'degraded')
        .map(([name, check]) => `${name}: ${check.message} (${check.latencyMs}ms)`)
        .join('\n'),
      channel: 'discord',
    });
  }
}

async function sendAlert(alert: {
  severity: string;
  title: string;
  details: string;
  channel: string;
}) {
  // Discord webhook for MVP
  if (alert.channel === 'discord' && process.env.DISCORD_WEBHOOK_URL) {
    await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: alert.title,
          description: alert.details,
          color: alert.severity === 'critical' ? 0xff0000 : 0xffaa00,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  }
}
```

**Monitoring Configuration (e.g., Better Uptime / Checkly)**:
```yaml
# checkly.yml
checks:
  - name: "Ember Health Check"
    type: API
    url: "https://ember.app/api/health"
    frequency: 60 # seconds
    assertions:
      - source: STATUS_CODE
        comparison: EQUALS
        target: 200
      - source: JSON_BODY
        property: "$.status"
        comparison: EQUALS
        target: "healthy"
    alertChannels:
      - discord
      - email
    degradedThreshold: 3 # consecutive failures before alert
```

**Pros**:
- External monitoring catches issues invisible from inside the app
- Alerts enable proactive response before users report issues
- Latency tracking over time shows trends
- Multiple check locations verify global availability

**Cons**:
- Requires external monitoring service (free tiers available)
- Alert fatigue if thresholds are too sensitive
- Additional operational overhead to manage

**Effort**: Low (half day for setup)
**Risk**: Low - standard practice

## Recommended Action

**Choose Solution 1: Comprehensive /api/health Endpoint, then layer Solutions 2 and 3**

Implement the health endpoint first — it's the foundation everything else depends on. Add deployment verification (Solution 2) as a CI/CD step. Set up external monitoring (Solution 3) once the app is deployed to production. All three solutions are complementary and low-effort.

## Technical Details

**Affected Components**:
- `src/app/api/health/route.ts` — new health endpoint
- `src/app/api/ready/route.ts` — new readiness probe
- `src/middleware.ts` — exclude health endpoints from auth
- `vercel.json` — deployment check configuration
- `scripts/verify-deployment.ts` — deployment verification script

**Database Changes**:
None — health check uses `SELECT 1` which requires no schema changes.

## Acceptance Criteria

- [ ] `/api/health` endpoint returns structured JSON with all dependency statuses
- [ ] `/api/ready` endpoint returns 200 OK when database is connected
- [ ] Health endpoint checks: database connectivity, Claude API reachability
- [ ] Health endpoint returns 503 when any critical dependency is unhealthy
- [ ] Latency thresholds flag "degraded" state (DB >2s, Claude >5s)
- [ ] Health endpoints excluded from Clerk authentication middleware
- [ ] Health endpoints have no-cache headers
- [ ] Deployment verification script validates health after deploy
- [ ] Response includes deployment version (git SHA)
- [ ] Health endpoint rate-limited to prevent abuse (10 req/min per IP)

## Work Log

### 2026-02-10
- **Review finding**: Operations review identified missing health/readiness endpoints
- **Severity**: Marked as P2 MODERATE - silent deployment failures, no operational visibility
- **Plan gap**: No health checks, no deployment verification, no monitoring infrastructure
- **Key risk**: Neon/Claude/Redis failures go undetected until user reports
- **Next step**: Implement /api/health and /api/ready endpoints, add to auth middleware exclusion

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L186-L211) - Architecture structure
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L227) - Vercel deployment
- [Vercel Health Checks](https://vercel.com/docs/concepts/deployments/checks)
- [Anthropic API Status](https://status.anthropic.com/)
- [Neon Status](https://neonstatus.com/)
- [Checkly Monitoring](https://www.checklyhq.com/) - Synthetic monitoring for APIs
