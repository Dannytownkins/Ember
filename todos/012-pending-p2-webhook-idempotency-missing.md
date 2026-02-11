---
status: pending
priority: p2
issue_id: "012"
tags: [code-review, reliability, webhooks, data-integrity]
dependencies: []
---

# Problem Statement

**RELIABILITY ISSUE**: Clerk webhooks can fire multiple times for the same event. No deduplication handling exists in the plan. A `user.created` webhook firing twice creates duplicate profiles in the database. A `user.deleted` webhook firing twice could error on the second attempt or corrupt state if a new user has been created in between. The plan mentions Clerk webhooks (line 223, 451) but provides zero implementation for idempotent handling.

**Why This Matters**: Webhook double-delivery is not a theoretical risk — it's a documented behavior. Clerk uses Svix for webhook delivery, which retries on failure with exponential backoff. If the first delivery times out (Vercel cold start, slow DB write), Svix retries. Now the handler runs twice. Without idempotency, `user.created` inserts two users rows, two default profiles. Future Stripe webhooks (Phase 3) have the same risk — `checkout.session.completed` firing twice could credit a subscription twice. At MVP scale this causes data anomalies; at scale it causes billing errors.

## Findings

**Source**: reliability-sentinel, architecture-strategist

**Evidence**:
- Plan mentions Clerk webhooks (line 223) but no idempotency handling
- Plan mentions Stripe webhooks (line 635) — same vulnerability when added
- No `webhook_events` tracking table in schema (lines 229-281)
- No unique constraints that would prevent duplicate profile creation
- No event ID deduplication logic
- Default profile creation on `user.created` is not idempotent

**Duplicate Scenarios**:

**Scenario 1: Double user.created**
```
1. New user signs up via Clerk
2. Clerk sends user.created webhook (attempt 1)
3. Vercel cold start: handler takes 8 seconds
4. Svix timeout at 5 seconds, schedules retry
5. Attempt 1 completes: user + default profile created
6. Attempt 2 arrives: user.created webhook (retry)
7. Handler creates SECOND user row + SECOND default profile
8. User has duplicate data, app may show wrong profile
```

**Scenario 2: Double user.deleted**
```
1. User deletes their Clerk account
2. Clerk sends user.deleted webhook (attempt 1)
3. Handler deletes user row (CASCADE deletes profiles, memories)
4. Attempt 2 arrives: user.deleted webhook (retry)
5. Handler tries to delete non-existent user
6. Possible: silent no-op, error thrown, or worse — if a new
   user got the same clerkId (reuse), wrong user deleted
```

**Scenario 3: Out-of-Order Delivery**
```
1. User creates account → user.created sent
2. User updates email → user.updated sent
3. Network delay: user.updated arrives FIRST
4. Handler tries to update non-existent user → error
5. user.created arrives SECOND → creates user with OLD email
6. Database now has stale email
```

**Impact Severity**: MEDIUM - Data integrity + potential duplicate records

## Proposed Solutions

### Solution 1: Idempotency Key Tracking with webhook_events Table (Recommended)

**Approach**: Track every processed webhook event by ID. Skip duplicates. Store events for audit trail.

**Implementation**:
```typescript
// drizzle/schema.ts — Add webhook_events table
import {
  pgTable, uuid, text, timestamp, jsonb, uniqueIndex,
} from 'drizzle-orm/pg-core';

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: text('event_id').notNull(), // Svix/Clerk event ID
  source: text('source').notNull(),     // 'clerk', 'stripe', 'sendgrid'
  eventType: text('event_type').notNull(), // 'user.created', 'user.deleted'
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb('payload'),             // Store payload for debugging (stripped of PII)
  status: text('status').notNull().default('processed'), // 'processed', 'failed', 'skipped'
  errorMessage: text('error_message'),
}, (table) => [
  // Prevent processing same event twice
  uniqueIndex('webhook_events_source_event_id_idx')
    .on(table.source, table.eventId),
]);
```

```typescript
// src/lib/webhooks/idempotency.ts
import { db } from '@/lib/db';
import { webhookEvents } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function ensureIdempotent(
  source: 'clerk' | 'stripe' | 'sendgrid',
  eventId: string,
  eventType: string,
  handler: () => Promise<void>
): Promise<{ processed: boolean; skipped: boolean }> {
  // Try to insert the event record (unique constraint prevents duplicates)
  try {
    await db.insert(webhookEvents).values({
      eventId,
      source,
      eventType,
      status: 'processing',
    });
  } catch (error) {
    // Unique constraint violation = already processed
    if (isUniqueViolation(error)) {
      console.log(`[WEBHOOK] Skipping duplicate: ${source}/${eventId}`);
      return { processed: false, skipped: true };
    }
    throw error;
  }

  // Process the event
  try {
    await handler();

    await db.update(webhookEvents)
      .set({ status: 'processed' })
      .where(and(
        eq(webhookEvents.source, source),
        eq(webhookEvents.eventId, eventId)
      ));

    return { processed: true, skipped: false };
  } catch (error) {
    await db.update(webhookEvents)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(and(
        eq(webhookEvents.source, source),
        eq(webhookEvents.eventId, eventId)
      ));

    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code: string }).code === '23505' // Postgres unique violation
  );
}
```

```typescript
// src/app/api/webhooks/clerk/route.ts — Idempotent webhook handler
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { ensureIdempotent } from '@/lib/webhooks/idempotency';
import { db } from '@/lib/db';
import { users, profiles } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  // 1. Verify webhook signature (Svix)
  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 });
  }

  const body = await request.text();
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);

  let event: WebhookEvent;
  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response('Invalid signature', { status: 401 });
  }

  // 2. Process with idempotency guard
  const { processed, skipped } = await ensureIdempotent(
    'clerk',
    svixId, // Use Svix event ID as idempotency key
    event.type,
    async () => {
      switch (event.type) {
        case 'user.created':
          await handleUserCreated(event.data);
          break;
        case 'user.updated':
          await handleUserUpdated(event.data);
          break;
        case 'user.deleted':
          await handleUserDeleted(event.data);
          break;
        default:
          console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
      }
    }
  );

  if (skipped) {
    return new Response('Duplicate event skipped', { status: 200 });
  }

  return new Response('Webhook processed', { status: 200 });
}

// Idempotent handler: uses upsert instead of insert
async function handleUserCreated(data: UserWebhookData) {
  const captureEmail = generateCaptureEmail(data.id);

  // Upsert user — safe if called twice
  await db.insert(users)
    .values({
      clerkId: data.id,
      email: data.email_addresses[0]?.email_address ?? '',
      captureEmail,
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        email: data.email_addresses[0]?.email_address ?? '',
        updatedAt: new Date(),
      },
    });

  // Get the user (whether just created or already existed)
  const user = await db.select()
    .from(users)
    .where(eq(users.clerkId, data.id))
    .limit(1);

  if (!user[0]) return;

  // Create default profile only if none exists
  const existingProfiles = await db.select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, user[0].id))
    .limit(1);

  if (existingProfiles.length === 0) {
    await db.insert(profiles).values({
      userId: user[0].id,
      name: 'Default',
      isDefault: true,
    });
  }
}

async function handleUserDeleted(data: { id: string }) {
  // Delete is naturally idempotent — deleting non-existent row is a no-op
  await db.delete(users)
    .where(eq(users.clerkId, data.id));
  // CASCADE handles profiles, captures, memories
}

async function handleUserUpdated(data: UserWebhookData) {
  // Update is naturally idempotent — same data written twice is fine
  await db.update(users)
    .set({
      email: data.email_addresses[0]?.email_address ?? '',
      updatedAt: new Date(),
    })
    .where(eq(users.clerkId, data.id));
}
```

**Pros**:
- Bulletproof duplicate prevention via database unique constraint
- Audit trail of all webhook events (debugging, compliance)
- Works for Clerk, Stripe, SendGrid — any webhook source
- Failed events tracked for retry/investigation
- Handler-level idempotency (upsert) as secondary defense

**Cons**:
- Additional database table and queries per webhook
- Webhook events table grows over time (needs cleanup job)
- Slightly more latency per webhook (extra INSERT)
- Must remember to use `ensureIdempotent` wrapper for every handler

**Effort**: Low (half day)
**Risk**: Low - standard pattern, database-backed guarantees

### Solution 2: Database Unique Constraints to Prevent Duplicates

**Approach**: Rely on database constraints (unique indexes, upsert) to make handlers naturally idempotent without a separate tracking table

**Implementation**:
```typescript
// drizzle/schema.ts — Add unique constraint on users.clerkId (already exists)
// The key insight: use UPSERT for all webhook handlers

// src/lib/webhooks/handlers.ts
import { db } from '@/lib/db';
import { users, profiles } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// Idempotent: upsert user, conditionally create profile
export async function handleUserCreated(clerkUser: ClerkUserData) {
  await db.transaction(async (tx) => {
    // Upsert user — insert or update if exists
    const [user] = await tx.insert(users)
      .values({
        clerkId: clerkUser.id,
        email: clerkUser.primaryEmail,
        captureEmail: generateCaptureEmail(clerkUser.id),
      })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: {
          email: clerkUser.primaryEmail,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Only create profile if user has zero profiles
    const profileCount = await tx.select({ count: sql`count(*)` })
      .from(profiles)
      .where(eq(profiles.userId, user.id));

    if (Number(profileCount[0].count) === 0) {
      await tx.insert(profiles).values({
        userId: user.id,
        name: 'Default',
        isDefault: true,
      });
    }
  });
}

// Idempotent: delete is a no-op if already deleted
export async function handleUserDeleted(clerkId: string) {
  const result = await db.delete(users)
    .where(eq(users.clerkId, clerkId))
    .returning();

  if (result.length === 0) {
    console.log(`[WEBHOOK] user.deleted: no user found for ${clerkId} (already deleted)`);
  }
}

// Idempotent: update with same data is a no-op
export async function handleUserUpdated(clerkUser: ClerkUserData) {
  await db.update(users)
    .set({
      email: clerkUser.primaryEmail,
      updatedAt: new Date(),
    })
    .where(eq(users.clerkId, clerkUser.id));
}
```

```typescript
// Future-proofing for Stripe webhooks (Phase 3)
export async function handleCheckoutCompleted(session: StripeSession) {
  // Upsert subscription — safe if webhook fires twice
  await db.insert(subscriptions)
    .values({
      userId: session.metadata.userId,
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      plan: session.metadata.plan,
      status: 'active',
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        status: 'active',
        updatedAt: new Date(),
      },
    });
}
```

**Pros**:
- No additional table or infrastructure
- Leverages existing database constraints
- Simpler code — upsert is a single operation
- Transaction ensures atomicity of user + profile creation
- Works without any wrapper function

**Cons**:
- No audit trail of webhook events
- Cannot detect or log duplicate deliveries
- No visibility into webhook reliability
- Does not handle out-of-order delivery
- Each handler must be individually designed for idempotency

**Effort**: Low (half day)
**Risk**: Low - relies on proven database guarantees

### Solution 3: Svix Webhook Verification + Event Deduplication

**Approach**: Use Svix's built-in features for verification and deduplication, plus application-level ordering

**Implementation**:
```typescript
// src/lib/webhooks/svix.ts
import { Webhook } from 'svix';

const WEBHOOK_TOLERANCE_SECONDS = 300; // 5 minute tolerance for clock skew

export function verifySvixWebhook(
  body: string,
  headers: {
    svixId: string;
    svixTimestamp: string;
    svixSignature: string;
  }
): { verified: boolean; eventId: string; timestamp: Date } {
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);

  try {
    wh.verify(body, {
      'svix-id': headers.svixId,
      'svix-timestamp': headers.svixTimestamp,
      'svix-signature': headers.svixSignature,
    });

    return {
      verified: true,
      eventId: headers.svixId,
      timestamp: new Date(parseInt(headers.svixTimestamp) * 1000),
    };
  } catch {
    return {
      verified: false,
      eventId: headers.svixId,
      timestamp: new Date(),
    };
  }
}

// Timestamp-based ordering: reject stale events
export function isStaleEvent(
  eventTimestamp: Date,
  lastProcessedTimestamp: Date | null
): boolean {
  if (!lastProcessedTimestamp) return false;
  return eventTimestamp < lastProcessedTimestamp;
}
```

```typescript
// src/app/api/webhooks/clerk/route.ts — Full implementation
import { verifySvixWebhook, isStaleEvent } from '@/lib/webhooks/svix';
import { ensureIdempotent } from '@/lib/webhooks/idempotency';

export async function POST(request: Request) {
  const headerPayload = await headers();
  const body = await request.text();

  // Step 1: Verify signature
  const { verified, eventId, timestamp } = verifySvixWebhook(body, {
    svixId: headerPayload.get('svix-id')!,
    svixTimestamp: headerPayload.get('svix-timestamp')!,
    svixSignature: headerPayload.get('svix-signature')!,
  });

  if (!verified) {
    return new Response('Invalid webhook signature', { status: 401 });
  }

  const event = JSON.parse(body) as WebhookEvent;

  // Step 2: Check for stale events (out-of-order delivery)
  const lastEvent = await getLastProcessedEvent('clerk', event.data.id);
  if (lastEvent && isStaleEvent(timestamp, lastEvent.processedAt)) {
    console.log(`[WEBHOOK] Rejecting stale event: ${eventId} (older than ${lastEvent.eventId})`);
    return new Response('Stale event rejected', { status: 200 });
  }

  // Step 3: Process with idempotency
  await ensureIdempotent('clerk', eventId, event.type, async () => {
    await processClerkEvent(event);
  });

  return new Response('OK', { status: 200 });
}
```

**Pros**:
- Svix signature verification prevents forged webhooks
- Timestamp ordering rejects out-of-order events
- Combined with Solution 1, provides triple protection
- Audit trail + ordering + verification = production-grade
- Works with any Svix-based webhook provider

**Cons**:
- Most complex implementation (three layers)
- Timestamp ordering can reject legitimate late events
- Svix dependency (though Clerk already uses it)
- Over-engineered for MVP — Solution 1 alone is sufficient

**Effort**: Medium (1 day)
**Risk**: Low - but adds unnecessary complexity for MVP

## Recommended Action

**Implement Solution 1 (webhook_events table) + Solution 2 (upsert handlers) as belt-and-suspenders:**

1. **Solution 1**: `webhook_events` table with unique constraint on (source, eventId). Prevents any duplicate processing and provides an audit trail.
2. **Solution 2**: Make every handler naturally idempotent with upserts and conditional inserts. Even without the tracking table, handlers are safe.

Defer Solution 3 (Svix ordering) — out-of-order delivery is edge-case rare and the simpler solutions handle the common failure modes.

**Implementation order:**
1. Add `webhook_events` table to Drizzle schema
2. Implement `ensureIdempotent` wrapper
3. Refactor `handleUserCreated` to use upsert + conditional profile creation
4. Verify `handleUserDeleted` is naturally idempotent (DELETE is a no-op)
5. Add `ensureIdempotent` to the Clerk webhook route
6. Write tests: fire same webhook twice, verify single user + single profile

## Technical Details

**Affected Components**:
- `drizzle/schema.ts` (add webhook_events table)
- `drizzle/migrations/` (new migration)
- `src/lib/webhooks/idempotency.ts` (new)
- `src/app/api/webhooks/clerk/route.ts` (refactor with idempotency)
- `src/app/api/webhooks/stripe/route.ts` (future — same pattern)
- `src/app/api/capture/route.ts` (email webhook — same pattern)

**Database Changes**:
```sql
-- New table for webhook event tracking
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  source TEXT NOT NULL,        -- 'clerk', 'stripe', 'sendgrid'
  event_type TEXT NOT NULL,    -- 'user.created', 'user.deleted', etc.
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB,               -- Stripped of PII, for debugging
  status TEXT NOT NULL DEFAULT 'processed',
  error_message TEXT
);

-- Unique constraint prevents duplicate processing
CREATE UNIQUE INDEX webhook_events_source_event_id_idx
  ON webhook_events(source, event_id);

-- Find failed events for retry
CREATE INDEX webhook_events_status_idx
  ON webhook_events(status)
  WHERE status = 'failed';

-- Cleanup: find old events for deletion
CREATE INDEX webhook_events_processed_at_idx
  ON webhook_events(processed_at);
```

**New Dependencies**:
```json
{
  "dependencies": {
    "svix": "^1.15.0"
  }
}
```

Note: Svix is the webhook verification library used by Clerk. It may already be included transitively via `@clerk/nextjs`.

**Cleanup Job** (add to Phase 2):
```typescript
// Clean up webhook events older than 30 days
export async function cleanupWebhookEvents() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await db.delete(webhookEvents)
    .where(lt(webhookEvents.processedAt, thirtyDaysAgo));
}
```

## Acceptance Criteria

- [ ] `webhook_events` table created with unique constraint on (source, event_id)
- [ ] `ensureIdempotent` wrapper implemented and tested
- [ ] Clerk `user.created` handler uses upsert (not raw insert)
- [ ] Default profile creation is conditional (only if none exist)
- [ ] Clerk `user.deleted` handler is idempotent (no error on missing user)
- [ ] Clerk `user.updated` handler is idempotent (update is naturally safe)
- [ ] Duplicate webhook delivery results in single database record
- [ ] Skipped duplicates logged for monitoring
- [ ] Failed webhook events recorded with error message
- [ ] Tests verify: two identical `user.created` webhooks produce one user + one profile
- [ ] Tests verify: two identical `user.deleted` webhooks succeed without error
- [ ] Webhook event cleanup documented for production maintenance

## Work Log

### 2026-02-10
- **Review finding**: Reliability sentinel identified webhook idempotency gap
- **Severity**: Marked as P2 — data integrity risk, not security
- **Plan gap**: Clerk webhooks mentioned but no idempotency handling defined
- **Key risk**: `user.created` double-delivery creates duplicate profiles
- **Future risk**: Stripe webhooks (Phase 3) need same pattern
- **Design pattern**: Event tracking table + idempotent handlers (belt-and-suspenders)
- **Next step**: Add webhook_events table to Drizzle schema, implement before Clerk integration

## Resources

- [Plan document](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L451) - Clerk webhook sync
- [Clerk Webhooks](https://clerk.com/docs/integrations/webhooks)
- [Svix Webhook Verification](https://docs.svix.com/receiving/verifying-payloads/how)
- [Idempotency Patterns](https://brandur.org/idempotency-keys)
- [Stripe Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [Drizzle ORM onConflictDoUpdate](https://orm.drizzle.team/docs/insert#on-conflict-do-update)
