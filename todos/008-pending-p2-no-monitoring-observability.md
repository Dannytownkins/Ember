---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, operations, monitoring, observability]
dependencies: []
---

# Problem Statement

**OPERATIONS ISSUE**: No error tracking (Sentry), no structured logging, no metrics dashboard, no alerting. The plan document mentions monitoring nowhere — not in the tech stack table, not in the implementation phases, not in the architecture. When captures fail in production, there's no way to know until users complain. Claude API errors, Neon connection failures, and Clerk webhook drops will be invisible.

**Why This Matters**: The capture pipeline has multiple failure points: Claude API rate limits, vision processing errors, Neon connection timeouts, malformed extraction responses. Without monitoring, a broken extraction pipeline could silently fail for hours. Users submit captures, see "processing" forever, and churn. With `after()` async processing, errors happen AFTER the response is sent — the user never sees them, and without logging, neither do you.

## Findings

**Source**: architecture-strategist, operations-sentinel

**Evidence**:
- Zero mentions of monitoring, logging, metrics, or alerting in plan
- No error tracking service in tech stack table (line 217-228)
- `after()` errors are silent — no mechanism to surface them (lines 385-400)
- No structured logging format defined
- No health check endpoint
- No way to track Claude API usage or costs
- No way to know if Clerk webhooks are failing
- No dashboard for capture success/failure rates

**Blind Spots**:

**Blind Spot 1: Silent after() Failures**
```
1. User submits capture
2. Server Action returns captureId (success)
3. after() starts processing
4. Claude API returns 429 (rate limited)
5. Error thrown inside after()
6. Capture stuck in "processing" forever
7. User sees spinner indefinitely
8. No alert, no log, no notification
```

**Blind Spot 2: Gradual Degradation**
```
1. Neon Postgres starts timing out intermittently
2. 10% of memory writes fail silently
3. Users notice memories missing, file support tickets
4. Team has no metrics to correlate timing with outage
5. Investigation takes hours instead of minutes
```

**Blind Spot 3: Cost Blindness**
```
1. Claude API costs $50/day
2. No dashboard showing daily spend
3. Month-end bill is $1,500 (expected $300)
4. No way to identify which users/features drove costs
5. Retroactive analysis impossible without logging
```

**Impact Severity**: MEDIUM-HIGH - Operational blindness in production

## Proposed Solutions

### Solution 1: Sentry for Error Tracking + Vercel Analytics (Recommended)

**Approach**: Sentry for error tracking and alerting, Vercel Analytics for performance, custom instrumentation for business metrics

**Implementation**:
```typescript
// 1. Install Sentry
// npm install @sentry/nextjs

// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of transactions
  replaysSessionSampleRate: 0, // No session replay (privacy)
  replaysOnErrorSampleRate: 0.5, // 50% of error sessions

  beforeSend(event) {
    // Strip any memory content from error reports (privacy)
    if (event.extra) {
      delete event.extra.rawText;
      delete event.extra.factualContent;
      delete event.extra.emotionalSignificance;
    }
    return event;
  },
});
```

```typescript
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.2,

  beforeSend(event) {
    // Never send memory content to Sentry
    if (event.contexts?.capture) {
      delete event.contexts.capture.rawText;
    }
    return event;
  },
});
```

```typescript
// src/lib/capture/pipeline.ts — Instrumented capture pipeline
import * as Sentry from '@sentry/nextjs';

export async function processCaptureAsync(captureId: string) {
  const transaction = Sentry.startTransaction({
    name: 'capture.process',
    op: 'capture',
  });

  try {
    Sentry.setContext('capture', {
      captureId,
      // Do NOT include rawText — privacy
    });

    // Step 1: Vision extraction (if screenshot)
    const visionSpan = transaction.startChild({
      op: 'ai.vision',
      description: 'Claude vision extraction',
    });
    const text = await extractTextFromImages(captureId);
    visionSpan.setData('imageCount', text.imageCount);
    visionSpan.finish();

    // Step 2: Memory extraction
    const extractionSpan = transaction.startChild({
      op: 'ai.extraction',
      description: 'Claude memory extraction',
    });
    const memories = await extractMemories(text.content);
    extractionSpan.setData('memoryCount', memories.length);
    extractionSpan.finish();

    // Step 3: Database write
    const dbSpan = transaction.startChild({
      op: 'db.write',
      description: 'Write memories to Neon',
    });
    await writeMemoriesToDb(captureId, memories);
    dbSpan.finish();

    transaction.setStatus('ok');
  } catch (error) {
    transaction.setStatus('internal_error');
    Sentry.captureException(error, {
      tags: {
        pipeline: 'capture',
        captureId,
      },
    });

    // Mark capture as failed
    await db.update(captures)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(captures.id, captureId));

    throw error;
  } finally {
    transaction.finish();
  }
}
```

```typescript
// src/lib/monitoring/alerts.ts — Sentry alert rules (configured in Sentry UI)
// Document the alert rules to configure:

/*
Alert Rules to Configure in Sentry Dashboard:

1. Capture Pipeline Failure Rate
   - Trigger: >5% of capture.process transactions fail in 10 minutes
   - Action: Slack notification + PagerDuty
   - Severity: Critical

2. Claude API Errors
   - Trigger: Any error matching "anthropic" or "claude" in 5 minutes
   - Action: Slack notification
   - Severity: Warning

3. Database Connection Errors
   - Trigger: Any error matching "neon" or "connection" in 5 minutes
   - Action: Slack notification + PagerDuty
   - Severity: Critical

4. Clerk Webhook Failures
   - Trigger: Any error in webhook handler
   - Action: Slack notification
   - Severity: Warning
*/
```

**Pros**:
- Industry-standard error tracking with full stack traces
- Performance monitoring via Sentry transactions
- Alerting rules for critical failures
- Privacy-safe with beforeSend filtering
- Vercel Analytics for Web Vitals (free tier)
- Low setup cost (1-2 hours for basic integration)

**Cons**:
- Sentry free tier limited to 5K errors/month
- Need to carefully strip sensitive memory content
- Transaction sampling means some errors may be missed in traces
- Another third-party dependency

**Effort**: Medium (1-2 days)
**Risk**: Low - industry standard, well-documented Next.js integration

### Solution 2: Structured Logging with Axiom

**Approach**: Structured JSON logging with Axiom for search, dashboards, and alerting

**Implementation**:
```typescript
// src/lib/logging/logger.ts
import { Logger } from 'next-axiom';

// Create typed logger
const log = new Logger({
  source: 'ember',
});

// Structured log events for the capture pipeline
export function logCaptureStarted(captureId: string, method: string) {
  log.info('capture.started', {
    captureId,
    method,
    timestamp: new Date().toISOString(),
  });
}

export function logCaptureCompleted(
  captureId: string,
  metrics: {
    memoriesExtracted: number;
    processingTimeMs: number;
    claudeInputTokens: number;
    claudeOutputTokens: number;
    estimatedCost: number;
  }
) {
  log.info('capture.completed', {
    captureId,
    ...metrics,
    timestamp: new Date().toISOString(),
  });
}

export function logCaptureFailed(
  captureId: string,
  error: Error,
  stage: 'vision' | 'extraction' | 'db_write' | 'validation'
) {
  log.error('capture.failed', {
    captureId,
    stage,
    errorMessage: error.message,
    errorName: error.name,
    // Do NOT log rawText or memory content
    timestamp: new Date().toISOString(),
  });
}

export function logClaudeAPICall(metrics: {
  model: string;
  operation: 'vision' | 'extraction' | 'compression';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCost: number;
}) {
  log.info('claude.api_call', {
    ...metrics,
    timestamp: new Date().toISOString(),
  });
}

export function logWebhookReceived(
  source: 'clerk' | 'stripe' | 'sendgrid',
  eventType: string,
  success: boolean
) {
  log.info('webhook.received', {
    source,
    eventType,
    success,
    timestamp: new Date().toISOString(),
  });
}
```

```typescript
// next.config.ts — Axiom integration
import { withAxiom } from 'next-axiom';

export default withAxiom({
  // ... existing config
});
```

**Pros**:
- Purpose-built for Vercel (next-axiom integration)
- Structured logs enable powerful queries
- Dashboards for business metrics (captures/day, cost/day)
- Generous free tier (500MB/month)
- Fast search across all log events

**Cons**:
- Another SaaS dependency
- Requires discipline to log consistently
- No automatic error capture (must add log calls manually)
- Does not replace error tracking (no stack traces, no grouping)

**Effort**: Medium (1-2 days)
**Risk**: Low - straightforward integration

### Solution 3: Custom Metrics Dashboard with PostHog

**Approach**: PostHog for product analytics, feature flags, and custom dashboards with self-hostable option

**Implementation**:
```typescript
// src/lib/analytics/posthog.ts
import PostHog from 'posthog-node';

const posthog = new PostHog(process.env.POSTHOG_API_KEY!, {
  host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
});

// Track capture events for funnel analysis
export function trackCapture(userId: string, event: {
  captureId: string;
  method: 'paste' | 'screenshot' | 'email';
  status: 'started' | 'completed' | 'failed';
  memoriesExtracted?: number;
  processingTimeMs?: number;
}) {
  posthog.capture({
    distinctId: userId,
    event: `capture_${event.status}`,
    properties: {
      capture_id: event.captureId,
      method: event.method,
      memories_extracted: event.memoriesExtracted,
      processing_time_ms: event.processingTimeMs,
    },
  });
}

// Track wake prompt generation
export function trackWakePrompt(userId: string, event: {
  categories: string[];
  totalTokens: number;
  memoryCount: number;
  compressed: boolean;
}) {
  posthog.capture({
    distinctId: userId,
    event: 'wake_prompt_generated',
    properties: {
      categories: event.categories,
      total_tokens: event.totalTokens,
      memory_count: event.memoryCount,
      compressed: event.compressed,
    },
  });
}

// Health check endpoint
// src/app/api/health/route.ts
export async function GET() {
  const checks = {
    database: await checkNeonConnection(),
    claude: await checkClaudeAPIKey(),
    clerk: await checkClerkConfig(),
  };

  const healthy = Object.values(checks).every((c) => c.status === 'ok');

  return Response.json(
    { status: healthy ? 'healthy' : 'degraded', checks },
    { status: healthy ? 200 : 503 }
  );
}

async function checkNeonConnection(): Promise<{ status: string }> {
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok' };
  } catch {
    return { status: 'error' };
  }
}
```

**Pros**:
- Product analytics + technical metrics in one tool
- Feature flags for gradual rollout
- Self-hostable option for privacy
- Funnel analysis (capture started -> completed -> wake prompt generated)
- Session recording (optional, privacy consideration)

**Cons**:
- More product analytics than operations monitoring
- No error tracking or stack traces
- Self-hosting adds infrastructure complexity
- Heavier than needed for MVP

**Effort**: Medium (1-2 days)
**Risk**: Low - optional features can be enabled incrementally

## Recommended Action

**Implement Solution 1 (Sentry) + Solution 2 (Axiom) as a combined observability stack:**

- **Sentry**: Error tracking, alerting, performance monitoring. Catches what breaks.
- **Axiom**: Structured logging, business metrics dashboards. Shows how things are running.

Defer PostHog (Solution 3) until after launch when product analytics become more relevant.

**Immediate priorities:**
1. Sentry integration with privacy-safe `beforeSend` filters
2. Structured logging in capture pipeline (started/completed/failed)
3. Claude API cost logging per call
4. Health check endpoint for uptime monitoring
5. Alert rules for capture failure rate and API errors

## Technical Details

**Affected Components**:
- `sentry.client.config.ts` (new)
- `sentry.server.config.ts` (new)
- `next.config.ts` (Sentry + Axiom wrappers)
- `src/lib/capture/pipeline.ts` (instrumentation)
- `src/lib/ai/` (Claude API call logging)
- `src/app/api/webhooks/` (webhook logging)
- `src/app/api/health/route.ts` (new)
- `src/lib/logging/logger.ts` (new)
- `src/lib/monitoring/` (new module)

**Database Changes**:
```sql
-- No database changes required.
-- Monitoring is external to the application database.
```

**New Dependencies**:
```json
{
  "dependencies": {
    "@sentry/nextjs": "^8.0.0",
    "next-axiom": "^1.0.0"
  }
}
```

**Environment Variables**:
```
SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=sntrys_...
AXIOM_DATASET=ember-logs
AXIOM_TOKEN=xaat-...
```

## Acceptance Criteria

- [ ] Sentry integrated with error tracking for server and client
- [ ] Privacy-safe: no memory content (rawText, factual, emotional) sent to Sentry
- [ ] Capture pipeline instrumented with Sentry transactions
- [ ] Structured logging for capture lifecycle (started, completed, failed)
- [ ] Claude API calls logged with token counts and estimated cost
- [ ] Webhook events logged (Clerk, email inbound)
- [ ] Health check endpoint returns database + API status
- [ ] Alert rule configured for capture failure rate > 5%
- [ ] Alert rule configured for Claude API errors
- [ ] Dashboard shows daily capture volume, success rate, average processing time
- [ ] Dashboard shows daily Claude API cost
- [ ] after() errors are captured and surfaced (not silent)

## Work Log

### 2026-02-10
- **Review finding**: Operations sentinel identified complete monitoring gap
- **Severity**: Marked as P2 — not a launch blocker but critical for production operations
- **Plan gap**: Zero mentions of monitoring, logging, metrics, or alerting anywhere in plan
- **Key risk**: `after()` async errors are completely silent without instrumentation
- **Privacy concern**: Memory content must never reach monitoring services
- **Decision needed**: Sentry + Axiom vs alternatives
- **Next step**: Add Sentry integration to Phase 1 deployment checklist

## Resources

- [Plan document](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md) - No monitoring section exists
- [Sentry Next.js Integration](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [next-axiom](https://github.com/axiomhq/next-axiom)
- [Vercel Analytics](https://vercel.com/analytics)
- [PostHog](https://posthog.com/docs/libraries/next-js)
