---
status: pending
priority: p1
issue_id: "005"
tags: [code-review, architecture, performance, serverless, timeout]
dependencies: []
---

# Problem Statement

**CRITICAL BLOCKING ISSUE**: The plan uses Next.js 16 `after()` for async processing (lines 368-403) with NO awareness that `after()` runs within serverless function timeout limits. Vision processing for 10 screenshots can take 30-50 seconds, exceeding Vercel's 60-second Pro limit (and definitely exceeding 10-second Hobby limit). Captures will timeout, leaving records stuck in "processing" state forever with no recovery mechanism.

**Why This Matters**: The MVP WILL fail on multi-screenshot captures. Users upload 10 images, wait 60+ seconds, see "processing..." forever, and cannot retry. Product appears broken.

## Findings

**Source**: architecture-strategist, performance-oracle

**Evidence**:
- Vision processing: 3-5s per screenshot × 10 = 30-50s total (sequential)
- Vercel limits: 10s (Hobby), 60s (Pro)
- `after()` docs: "Maximum execution time of 15 seconds"
- Plan assumes `after()` bypasses timeout — IT DOES NOT
- No timeout handling, no retry mechanism, no progress checkpointing

**Failure Timeline**:
```
0s: User uploads 10 screenshots
1s: Server Action creates capture (status: pending)
1s: Returns immediately (good UX)
1s: after() block starts processing
5s: Vision processes image 1 (success)
10s: Vision processes image 2 (success)
15s: TIMEOUT (Vercel Hobby kills function)
     OR
30s: Vision finishes all 10 images (good)
45s: Extraction starts
60s: TIMEOUT (Vercel Pro kills function)

Result: Capture stuck in "processing" forever
User polls /api/captures/{id}/status → "processing"
No way to retry, no error message
```

**Impact Severity**: 🔴 CRITICAL BLOCKING - MVP will fail on primary use case

## Proposed Solutions

### Solution 1: Background Queue (BullMQ + Upstash Redis) (Recommended)

**Approach**: Replace `after()` with proper job queue

**Implementation**:
```typescript
// 1. Install BullMQ + Upstash Redis
// npm install bullmq @upstash/redis

// 2. Create queue
import { Queue, Worker } from 'bullmq';
import { Redis } from '@upstash/redis';

const connection = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
});

export const captureQueue = new Queue('captures', { connection });

// 3. Replace after() with queue.add()
export async function createCaptureAction(data: FormData) {
  const capture = await db.insert(captures).values({
    status: 'queued',
    ...
  }).returning();

  // Add to queue instead of after()
  await captureQueue.add('process-capture', {
    captureId: capture.id
  }, {
    attempts: 3, // Retry on failure
    backoff: { type: 'exponential', delay: 2000 }
  });

  return capture;
}

// 4. Worker processes jobs (separate from web requests)
const worker = new Worker('captures', async (job) => {
  const { captureId } = job.data;

  // Update progress
  await job.updateProgress(10);

  // Vision processing
  const visionResults = await processVision(capture.imageUrls);
  await job.updateProgress(50);

  // Extraction
  const memories = await extractMemories(visionResults.text);
  await job.updateProgress(90);

  // Save
  await saveMemories(captureId, memories);
  await job.updateProgress(100);

}, { connection });

// 5. Client polls job status
GET /api/captures/${id}/status → returns job progress (0-100%)
```

**Pros**:
- No timeout limits (jobs can run for minutes)
- Automatic retries with exponential backoff
- Progress tracking (0-100%)
- Can handle any volume
- Observability built-in

**Cons**:
- Requires Redis (Upstash serverless = $0/mo free tier)
- More complex architecture
- Need to run worker (Vercel background function)

**Effort**: Medium (2-3 days)
**Risk**: Low - industry standard

### Solution 2: Inngest (Managed Background Jobs)

**Approach**: Use Inngest for serverless background jobs

**Implementation**:
```typescript
import { inngest } from '@/lib/inngest';

export const processCaptureJob = inngest.createFunction(
  {
    id: 'process-capture',
    retries: 3,
    timeout: '5m' // Can exceed Vercel limits!
  },
  { event: 'capture/created' },
  async ({ event, step }) => {
    const { captureId } = event.data;

    // Step 1: Vision (with separate timeout)
    const visionResults = await step.run('vision', async () => {
      return await processVisionWithProgress(captureId);
    });

    // Step 2: Extraction
    const memories = await step.run('extract', async () => {
      return await extractMemories(visionResults.text);
    });

    // Step 3: Save
    await step.run('save', async () => {
      await saveMemories(captureId, memories);
    });
  }
);

// Trigger from Server Action:
export async function createCaptureAction(data: FormData) {
  const capture = await createCapture(data);

  await inngest.send({
    name: 'capture/created',
    data: { captureId: capture.id }
  });

  return capture;
}
```

**Pros**:
- 5-minute timeout (50x Vercel limit)
- Step functions = partial progress on failure
- Automatic retries
- Excellent observability dashboard
- No infrastructure to manage

**Cons**:
- External service dependency
- Costs scale with usage ($0 free tier, then $20/mo)
- Vendor lock-in

**Effort**: Low (1 day with their templates)
**Risk**: Low - managed service

### Solution 3: Vercel Cron + Database Queue

**Approach**: Store captures in DB as queue, process via cron

**Implementation**:
```typescript
// 1. Capture submit adds to DB queue
await db.insert(captures).values({
  status: 'queued',
  ...
});

// 2. Cron job (every 1 minute) processes pending
// app/api/cron/process-captures/route.ts
export async function GET() {
  const pending = await db.select()
    .from(captures)
    .where(eq(captures.status, 'queued'))
    .orderBy(captures.createdAt)
    .limit(10); // Batch size

  for (const capture of pending) {
    await db.update(captures)
      .set({ status: 'processing' })
      .where(eq(captures.id, capture.id));

    try {
      await processCaptureWithTimeout(capture, 50000); // 50s max
      await db.update(captures)
        .set({ status: 'completed' })
        .where(eq(captures.id, capture.id));
    } catch (error) {
      await db.update(captures)
        .set({ status: 'failed', errorMessage: error.message })
        .where(eq(captures.id, capture.id));
    }
  }
}

// vercel.json
{
  "crons": [{
    "path": "/api/cron/process-captures",
    "schedule": "* * * * *" // Every minute
  }]
}
```

**Pros**:
- Simple (no external services)
- Free (built into Vercel)
- No Redis needed

**Cons**:
- Still subject to serverless timeout (60s max)
- No automatic retries
- Cron latency (up to 1 minute delay)
- Poor progress tracking

**Effort**: Low (1 day)
**Risk**: MEDIUM - Doesn't solve timeout for 10-screenshot captures

## Recommended Action

**Choose Solution 1 or 2 depending on preference:**

**If you want maximum control**: BullMQ + Upstash Redis (Solution 1)
**If you want simplicity**: Inngest (Solution 2)

Both solutions solve the timeout problem. Inngest is faster to implement, BullMQ is more customizable.

**DO NOT ship with `after()` for production.** It WILL fail on multi-screenshot captures.

## Technical Details

**Affected Components**:
- `app/actions/captures.ts` (Server Actions)
- `src/lib/queue/` (new - queue setup)
- `app/api/cron/worker.ts` OR `app/api/inngest/route.ts` (job processor)

**New Dependencies**:

**Option 1 (BullMQ)**:
```json
{
  "dependencies": {
    "bullmq": "^5.1.0",
    "@upstash/redis": "^1.28.0"
  }
}
```

**Option 2 (Inngest)**:
```json
{
  "dependencies": {
    "inngest": "^3.15.0"
  }
}
```

**Environment Variables**:
```
# Upstash Redis (for BullMQ)
UPSTASH_REDIS_URL=https://...
UPSTASH_REDIS_TOKEN=...

# OR Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
```

## Acceptance Criteria

- [ ] `after()` removed from capture processing
- [ ] Background queue implemented (BullMQ or Inngest)
- [ ] 10-screenshot capture completes successfully (no timeout)
- [ ] Timeout tested: processing survives beyond 60 seconds
- [ ] Retry logic tested: failed jobs retry automatically
- [ ] Progress tracking: user sees 0-100% progress
- [ ] Client polls job status (not capture status)
- [ ] Error handling: failed jobs update capture.errorMessage
- [ ] Monitoring: job queue metrics visible (length, processing time)

## Work Log

### 2026-02-10
- **Review finding**: Architecture strategist + performance oracle identified timeout risk
- **Severity**: Marked as P1 BLOCKING - MVP will fail on multi-screenshot captures
- **Plan flaw**: Lines 368-403 assume `after()` has no timeout
- **Decision needed**: BullMQ vs Inngest vs Vercel Cron
- **Next step**: Choose queue implementation, add to Phase 1 before capture feature

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L368-L403) - `after()` usage
- [Next.js after() Limits](https://nextjs.org/docs/app/api-reference/functions/after#duration-limits)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Inngest Documentation](https://www.inngest.com/docs)
- [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted) - Serverless Redis
