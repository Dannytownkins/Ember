---
status: pending
priority: p3
issue_id: "023"
tags: [code-review, reliability, resilience, error-handling]
dependencies: []
---

# Problem Statement

**RESILIENCE GAP**: If Claude API is down, the entire capture flow stops working. No fallback behavior defined. Users see cryptic errors. No queue-and-retry for transient failures. No "degraded mode" where basic capture still works without AI extraction.

**Why This Matters**: Claude API outages happen (rate limits, maintenance, regional failures). During an outage, Ember becomes completely non-functional because every capture requires Claude for extraction. Users who screenshot a conversation and submit it get an error with no recourse. The conversation text is lost because the capture fails before persisting. A 30-minute Claude outage means 30 minutes of zero functionality and potential data loss.

## Findings

**Source**: architecture-strategist

**Evidence**:
- Capture pipeline has no error recovery path (lines 375-401)
- No retry logic for transient Claude API failures
- No fallback extraction when AI is unavailable
- `after()` processing failure leaves capture in "processing" state forever
- No health check endpoint for Claude API status
- No user-facing degradation notices
- Client polls `/api/captures/{id}/status` but "failed" state shows cryptic error

**Impact Severity**: LOW - Affects availability during outages only

## Proposed Solutions

### Solution 1: Queue Captures for Later Processing (Recommended)

**Approach**: Always persist the raw capture first, then process asynchronously with retry logic. If Claude is unavailable, queue for later processing.

**Implementation**:
```typescript
// lib/capture/resilient-pipeline.ts
import { db } from '@/lib/db';
import { captures } from '@/lib/db/schema';
import { extractMemories } from '@/lib/ai/extraction';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 30000, 120000]; // 5s, 30s, 2min

export async function processCaptureWithRetry(captureId: string) {
  const capture = await db.query.captures.findFirst({
    where: eq(captures.id, captureId),
  });

  if (!capture) return;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Update status to show progress
      await db.update(captures)
        .set({
          status: 'processing',
          errorMessage: attempt > 0
            ? `Retry attempt ${attempt + 1} of ${MAX_RETRIES}`
            : null,
        })
        .where(eq(captures.id, captureId));

      // Attempt Claude extraction
      const memories = await extractMemories(capture.rawText!);

      // Success - write memories
      await writeExtractedMemories(captureId, memories);

      await db.update(captures)
        .set({ status: 'completed', errorMessage: null })
        .where(eq(captures.id, captureId));

      return; // Success, exit retry loop

    } catch (error) {
      const isTransient = isTransientError(error);

      if (isTransient && attempt < MAX_RETRIES - 1) {
        // Wait before retrying
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAYS[attempt])
        );
        continue;
      }

      // Final failure - mark as queued for later processing
      await db.update(captures)
        .set({
          status: attempt >= MAX_RETRIES - 1 ? 'queued' : 'failed',
          errorMessage: isTransient
            ? 'AI service temporarily unavailable. Your capture is saved and will be processed automatically when service resumes.'
            : `Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
        .where(eq(captures.id, captureId));
    }
  }
}

function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('rate limit') ||
      msg.includes('overloaded') ||
      msg.includes('529') ||
      msg.includes('503') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused')
    );
  }
  return false;
}
```

```typescript
// lib/capture/queue-processor.ts
// Process queued captures when Claude comes back online

export async function processQueuedCaptures() {
  const queued = await db.select()
    .from(captures)
    .where(eq(captures.status, 'queued'))
    .orderBy(asc(captures.createdAt))
    .limit(10);

  for (const capture of queued) {
    try {
      await processCaptureWithRetry(capture.id);
    } catch {
      // Individual failure should not stop queue processing
      continue;
    }
  }
}

// Trigger via Vercel Cron or Inngest scheduled job
// runs every 5 minutes to check for queued captures
```

**Pros**:
- Raw capture always saved (no data loss)
- Automatic retry with exponential backoff
- Queued captures process when Claude recovers
- User sees clear status: "saved, processing when service resumes"

**Cons**:
- Requires a "queued" status in capture state machine
- Needs a cron job or scheduled function to drain the queue
- Users wait longer for extraction during outages

**Effort**: Medium (1-2 days)
**Risk**: Low

### Solution 2: Basic Text Extraction Fallback Without AI

**Approach**: When Claude is unavailable, fall back to regex-based extraction that captures basic facts without emotional analysis

**Implementation**:
```typescript
// lib/ai/fallback-extraction.ts

interface FallbackMemory {
  factualContent: string;
  emotionalSignificance: null; // Cannot extract without AI
  category: 'preferences'; // Default category for fallback
  importance: 3; // Default mid-level importance
  verbatimText: string;
  summaryText: null;
  useVerbatim: true;
  speakerConfidence: null;
}

export function fallbackExtraction(rawText: string): FallbackMemory[] {
  const memories: FallbackMemory[] = [];

  // Split by conversation turns (common patterns)
  const lines = rawText.split('\n').filter((l) => l.trim());

  // Extract user statements (skip AI responses)
  const userLines = lines.filter((line) => {
    const lower = line.toLowerCase();
    return (
      lower.startsWith('user:') ||
      lower.startsWith('me:') ||
      lower.startsWith('human:') ||
      (!lower.startsWith('ai:') &&
        !lower.startsWith('assistant:') &&
        !lower.startsWith('chatgpt:') &&
        !lower.startsWith('claude:'))
    );
  });

  // Group into chunks of ~2-3 sentences as individual memories
  let currentChunk: string[] = [];

  for (const line of userLines) {
    currentChunk.push(line.replace(/^(user|me|human):\s*/i, ''));

    if (currentChunk.length >= 3) {
      const content = currentChunk.join(' ').trim();
      if (content.length > 20) {
        memories.push({
          factualContent: content,
          emotionalSignificance: null,
          category: 'preferences',
          importance: 3,
          verbatimText: content,
          summaryText: null,
          useVerbatim: true,
          speakerConfidence: null,
        });
      }
      currentChunk = [];
    }
  }

  // Flush remaining
  if (currentChunk.length > 0) {
    const content = currentChunk.join(' ').trim();
    if (content.length > 20) {
      memories.push({
        factualContent: content,
        emotionalSignificance: null,
        category: 'preferences',
        importance: 3,
        verbatimText: content,
        summaryText: null,
        useVerbatim: true,
        speakerConfidence: null,
      });
    }
  }

  return memories;
}

// Usage in capture pipeline
export async function extractWithFallback(rawText: string) {
  try {
    return await extractMemories(rawText); // Full Claude extraction
  } catch (error) {
    if (isTransientError(error)) {
      // Use fallback and flag for re-extraction later
      const fallbackMemories = fallbackExtraction(rawText);
      return {
        memories: fallbackMemories,
        usedFallback: true,
        needsReExtraction: true,
      };
    }
    throw error;
  }
}
```

**Pros**:
- Users get immediate (basic) results even during outages
- No data loss
- Memories can be re-extracted with AI when Claude recovers

**Cons**:
- Fallback extraction is crude (no emotional significance, no categorization)
- Risk of confusing users with low-quality extractions
- Re-extraction flow adds complexity
- Speaker attribution impossible without AI

**Effort**: Medium (1 day)
**Risk**: MEDIUM - Low-quality fallback may disappoint users

### Solution 3: Status Page with Degradation Notices

**Approach**: Show service health status in the UI so users know what to expect

**Implementation**:
```typescript
// lib/health/claude-health.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

type ServiceStatus = 'operational' | 'degraded' | 'outage';

export async function checkClaudeHealth(): Promise<ServiceStatus> {
  // Check recent error rate from Redis counter
  const recentErrors = await redis.get<number>('claude:errors:5min') ?? 0;
  const recentCalls = await redis.get<number>('claude:calls:5min') ?? 1;
  const errorRate = recentErrors / recentCalls;

  if (errorRate > 0.5) return 'outage';
  if (errorRate > 0.1) return 'degraded';
  return 'operational';
}

// components/service-status.tsx
export async function ServiceStatus() {
  const status = await checkClaudeHealth();

  if (status === 'operational') return null;

  return (
    <div
      role="alert"
      className={`rounded-md px-4 py-3 text-sm ${
        status === 'outage'
          ? 'bg-red-900/20 text-red-300'
          : 'bg-yellow-900/20 text-yellow-300'
      }`}
    >
      {status === 'outage' ? (
        <>
          <strong>AI processing temporarily unavailable.</strong> Your captures
          are saved and will be processed automatically when service resumes.
        </>
      ) : (
        <>
          <strong>AI processing is slower than usual.</strong> Captures may take
          longer to process. Your data is safe.
        </>
      )}
    </div>
  );
}
```

**Pros**:
- Users understand what is happening (reduces support burden)
- Sets expectations during degraded periods
- Simple to implement

**Cons**:
- Does not fix the underlying problem
- Users still cannot capture during outages without Solution 1 or 2
- Requires error tracking infrastructure

**Effort**: Low (half day)
**Risk**: Low

## Recommended Action

**Choose Solution 1 + Solution 3: Queue-and-Retry + Status Notices**

Always persist the raw capture before attempting Claude extraction. Implement retry with exponential backoff for transient failures. Queue captures for later processing during extended outages. Show a service status banner in the UI when degradation is detected. This ensures zero data loss and clear communication with users during Claude API issues.

## Technical Details

**Affected Components**:
- `src/lib/capture/resilient-pipeline.ts` (new module)
- `src/lib/capture/queue-processor.ts` (new module)
- `src/lib/health/claude-health.ts` (new module)
- `src/components/service-status.tsx` (new component)
- `src/lib/db/schema.ts` (add "queued" to capture status CHECK)
- Vercel Cron or Inngest (for queue draining)

**Database Changes**:
```sql
-- Add 'queued' to capture status CHECK constraint
ALTER TABLE captures DROP CONSTRAINT IF EXISTS captures_status_check;
ALTER TABLE captures ADD CONSTRAINT captures_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'queued'));
```

## Acceptance Criteria

- [ ] Raw capture is always persisted before Claude extraction attempt
- [ ] Transient Claude API errors trigger automatic retry (3 attempts)
- [ ] Exponential backoff between retries (5s, 30s, 2min)
- [ ] Captures that exhaust retries are marked "queued"
- [ ] Queued captures are processed by scheduled job every 5 minutes
- [ ] User sees clear message: "Saved, will process when service resumes"
- [ ] Service status banner shows when Claude API is degraded/down
- [ ] No capture data is lost during Claude API outages

## Work Log

### 2026-02-10
- **Review finding**: Architecture strategist identified single point of failure in Claude API dependency
- **Severity**: Marked as P3 - resilience improvement, affects availability during outages
- **Current state**: Any Claude API failure causes complete capture failure with potential data loss
- **Next step**: Implement after background queue system (issue 005) since retry logic builds on it

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L375-L401) - Capture pipeline flow
- [Anthropic API Status](https://status.anthropic.com/)
- [Retry Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/retry)
- [Circuit Breaker Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
