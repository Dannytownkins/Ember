---
status: pending
priority: p2
issue_id: "009"
tags: [code-review, architecture, error-handling, reliability]
dependencies: []
---

# Problem Statement

**ARCHITECTURE ISSUE**: No consistent error boundary strategy for Server Actions or API routes. The plan defines `ActionState<T>` (line 648) as a discriminated union but provides no implementation for error classification, recovery, or fallback behavior. No typed error responses. No distinction between user errors ("content too short") and system errors ("Claude API down"). Failed Claude API calls have no fallback behavior — a 503 from Anthropic results in a capture stuck in "processing" forever.

**Why This Matters**: Every layer of the Ember stack can fail differently: Clerk auth errors, Neon connection timeouts, Claude API rate limits, Zod validation failures, and business logic violations. Without a consistent error handling pattern, each Server Action will handle errors ad hoc — some will throw, some will return strings, some will swallow errors. Users will see cryptic messages or infinite spinners. Debugging becomes impossible without error classification.

## Findings

**Source**: architecture-strategist, reliability-sentinel

**Evidence**:
- `ActionState<T>` defined (line 648) but never implemented with error classification
- No error codes or error categories defined
- No React Error Boundaries mentioned for component-level recovery
- `after()` pipeline has no try/catch or retry logic (lines 385-400)
- No fallback behavior when Claude API is unavailable
- No timeout handling for long-running extraction
- No way to distinguish transient errors (retry-safe) from permanent errors (don't retry)

**Failure Modes**:

**Failure Mode 1: Claude API Unavailable**
```
1. User submits capture
2. after() calls Claude API for extraction
3. Claude returns 503 Service Unavailable
4. Error thrown, unhandled in after()
5. Capture status remains "processing"
6. User polls /api/captures/{id}/status forever
7. No retry, no timeout, no fallback
```

**Failure Mode 2: Neon Connection Timeout**
```
1. Extraction succeeds, 8 memories ready to write
2. Neon Postgres times out during batch insert
3. Partial write: 3 of 8 memories saved
4. Capture marked "completed" (it shouldn't be)
5. User sees partial results, confused
6. No transaction rollback, data inconsistent
```

**Failure Mode 3: Mixed Error Types in UI**
```
1. User submits empty paste → validation error
2. UI shows: "Error: Content too short"
3. User retries, Claude API down → system error
4. UI shows: "Error: fetch failed"
5. Both shown the same way — user can't tell
   if it's their fault or a system issue
```

**Impact Severity**: MEDIUM-HIGH - User experience degradation + data inconsistency risk

## Proposed Solutions

### Solution 1: Result Type Pattern with Typed Error Codes (Recommended)

**Approach**: Extend `ActionState<T>` with error classification and implement consistently across all Server Actions

**Implementation**:
```typescript
// src/lib/types/errors.ts

// Error categories — determines UI treatment and retry behavior
export type ErrorCategory = 'validation' | 'auth' | 'not_found' | 'rate_limit' | 'ai_service' | 'database' | 'unknown';

// Specific error codes for programmatic handling
export const ERROR_CODES = {
  // Validation errors (user can fix)
  CONTENT_TOO_SHORT: 'CONTENT_TOO_SHORT',
  CONTENT_TOO_LONG: 'CONTENT_TOO_LONG',
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  INVALID_PROFILE_ID: 'INVALID_PROFILE_ID',

  // Auth errors (redirect to sign-in)
  UNAUTHORIZED: 'UNAUTHORIZED',
  PROFILE_NOT_OWNED: 'PROFILE_NOT_OWNED',

  // Rate limit errors (wait and retry)
  CAPTURE_LIMIT_EXCEEDED: 'CAPTURE_LIMIT_EXCEEDED',
  API_RATE_LIMITED: 'API_RATE_LIMITED',

  // AI service errors (retry or fallback)
  CLAUDE_UNAVAILABLE: 'CLAUDE_UNAVAILABLE',
  CLAUDE_RATE_LIMITED: 'CLAUDE_RATE_LIMITED',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  EXTRACTION_TIMEOUT: 'EXTRACTION_TIMEOUT',

  // Database errors (retry)
  DB_CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  DB_WRITE_FAILED: 'DB_WRITE_FAILED',
  DB_TRANSACTION_FAILED: 'DB_TRANSACTION_FAILED',

  // Generic
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// Enhanced ActionState with error classification
export type ActionState<T> =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; data: T }
  | {
      status: 'error';
      code: ErrorCode;
      category: ErrorCategory;
      message: string; // User-friendly message
      detail?: string; // Developer-facing detail (never shown to user)
      fieldErrors?: Record<string, string[]>;
      retryable: boolean;
      retryAfterMs?: number;
    };

// Helper to create error results
export function actionError(
  code: ErrorCode,
  message: string,
  options?: {
    detail?: string;
    fieldErrors?: Record<string, string[]>;
    retryAfterMs?: number;
  }
): ActionState<never> {
  const category = categorizeError(code);
  return {
    status: 'error',
    code,
    category,
    message,
    detail: options?.detail,
    fieldErrors: options?.fieldErrors,
    retryable: isRetryable(category),
    retryAfterMs: options?.retryAfterMs,
  };
}

function categorizeError(code: ErrorCode): ErrorCategory {
  if (code.startsWith('CONTENT_') || code.startsWith('INVALID_')) return 'validation';
  if (code === 'UNAUTHORIZED' || code === 'PROFILE_NOT_OWNED') return 'auth';
  if (code.endsWith('_LIMIT_EXCEEDED') || code.endsWith('_RATE_LIMITED')) return 'rate_limit';
  if (code.startsWith('CLAUDE_') || code.startsWith('EXTRACTION_')) return 'ai_service';
  if (code.startsWith('DB_')) return 'database';
  return 'unknown';
}

function isRetryable(category: ErrorCategory): boolean {
  return ['rate_limit', 'ai_service', 'database'].includes(category);
}
```

```typescript
// src/lib/actions/capture.ts — Using typed errors
'use server';

import { auth } from '@clerk/nextjs/server';
import { actionError, ERROR_CODES, type ActionState } from '@/lib/types/errors';
import { createCaptureSchema } from '@/lib/validations/capture';

export async function createCaptureAction(
  formData: FormData
): Promise<ActionState<{ captureId: string }>> {
  // Auth check
  const session = await auth();
  if (!session.userId) {
    return actionError(ERROR_CODES.UNAUTHORIZED, 'Please sign in to capture memories.');
  }

  // Validation
  const parsed = createCaptureSchema.safeParse({
    profileId: formData.get('profileId'),
    method: formData.get('method'),
    content: formData.get('content'),
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return actionError(
      ERROR_CODES.CONTENT_TOO_SHORT,
      'Please check your input and try again.',
      { fieldErrors }
    );
  }

  // Profile ownership
  const profile = await verifyProfileOwnership(parsed.data.profileId, session.userId);
  if (!profile) {
    return actionError(ERROR_CODES.PROFILE_NOT_OWNED, 'Profile not found.');
  }

  // Create capture
  try {
    const capture = await db.insert(captures).values({
      profileId: parsed.data.profileId,
      method: parsed.data.method,
      rawText: parsed.data.content,
      status: 'pending',
    }).returning();

    return { status: 'success', data: { captureId: capture[0].id } };
  } catch (error) {
    return actionError(
      ERROR_CODES.DB_WRITE_FAILED,
      'Something went wrong saving your capture. Please try again.',
      { detail: error instanceof Error ? error.message : 'Unknown DB error' }
    );
  }
}
```

```typescript
// src/components/capture/capture-form.tsx — Client-side error handling
'use client';

import { useActionState } from 'react';
import { createCaptureAction } from '@/lib/actions/capture';
import type { ActionState } from '@/lib/types/errors';

function CaptureForm() {
  const [state, formAction, isPending] = useActionState(createCaptureAction, { status: 'idle' });

  return (
    <form action={formAction}>
      {/* ... form fields ... */}

      {state.status === 'error' && (
        <ErrorDisplay
          category={state.category}
          message={state.message}
          retryable={state.retryable}
          fieldErrors={state.fieldErrors}
        />
      )}
    </form>
  );
}

function ErrorDisplay({ category, message, retryable, fieldErrors }: {
  category: string;
  message: string;
  retryable: boolean;
  fieldErrors?: Record<string, string[]>;
}) {
  const styles = {
    validation: 'bg-amber-900/20 border-amber-500/50 text-amber-200',
    auth: 'bg-red-900/20 border-red-500/50 text-red-200',
    rate_limit: 'bg-orange-900/20 border-orange-500/50 text-orange-200',
    ai_service: 'bg-purple-900/20 border-purple-500/50 text-purple-200',
    database: 'bg-red-900/20 border-red-500/50 text-red-200',
    unknown: 'bg-zinc-900/20 border-zinc-500/50 text-zinc-200',
  };

  return (
    <div className={`rounded-lg border p-4 ${styles[category] || styles.unknown}`}>
      <p className="font-medium">{message}</p>
      {fieldErrors && (
        <ul className="mt-2 text-sm">
          {Object.entries(fieldErrors).map(([field, errors]) =>
            errors.map((err) => <li key={`${field}-${err}`}>{err}</li>)
          )}
        </ul>
      )}
      {retryable && (
        <p className="mt-2 text-sm opacity-75">This may be temporary. Please try again.</p>
      )}
    </div>
  );
}
```

**Pros**:
- Type-safe error handling across the entire app
- Clear user messaging (validation vs system errors)
- Retryable flag enables smart client-side retry logic
- Error codes enable programmatic handling
- Consistent pattern for every Server Action

**Cons**:
- More boilerplate per Server Action
- Error code maintenance as features grow
- Team must be disciplined to use the pattern consistently

**Effort**: Medium (1-2 days)
**Risk**: Low - well-established pattern (Rust Result, Go errors)

### Solution 2: React Error Boundaries for Component-Level Recovery

**Approach**: Wrap major UI sections with Error Boundaries that provide graceful degradation

**Implementation**:
```typescript
// src/components/error-boundary.tsx
'use client';

import { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class EmberErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    Sentry.captureException(error, {
      tags: { boundary: 'component' },
    });
    this.props.onError?.(error);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return fallback(this.state.error, this.reset);
      }
      return fallback;
    }
    return this.props.children;
  }
}
```

```typescript
// src/app/(dashboard)/memories/page.tsx — Usage
import { EmberErrorBoundary } from '@/components/error-boundary';
import { MemoryBrowser } from '@/components/memories/memory-browser';

export default function MemoriesPage() {
  return (
    <EmberErrorBoundary
      fallback={(error, reset) => (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <h2 className="text-xl font-semibold text-zinc-200">
            Something went wrong loading your memories
          </h2>
          <p className="mt-2 text-zinc-400">
            {error.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={reset}
            className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-500"
          >
            Try again
          </button>
        </div>
      )}
    >
      <MemoryBrowser />
    </EmberErrorBoundary>
  );
}
```

```typescript
// src/app/(dashboard)/layout.tsx — Top-level boundary
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <EmberErrorBoundary
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-zinc-200">Something went wrong</h1>
            <p className="mt-2 text-zinc-400">Please refresh the page or contact support.</p>
            <a
              href="/dashboard"
              className="mt-4 inline-block rounded-lg bg-amber-600 px-4 py-2 text-white"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      }
    >
      <Sidebar />
      <main>{children}</main>
    </EmberErrorBoundary>
  );
}
```

**Pros**:
- Prevents full-page crashes from component errors
- User sees helpful recovery UI instead of white screen
- Integrates with Sentry for error reporting
- React 19 compatible with `use` hook error handling
- Granular: different boundaries for different sections

**Cons**:
- Only catches render-time errors (not async/event handlers)
- Class components in a hooks-first codebase
- Does not address Server Action errors
- Must be combined with Solution 1 for complete coverage

**Effort**: Low (half day)
**Risk**: Low - React built-in pattern

### Solution 3: Circuit Breaker for Claude API Calls

**Approach**: Implement a circuit breaker that stops calling Claude after repeated failures, preventing cascading timeouts and wasted spend

**Implementation**:
```typescript
// src/lib/ai/circuit-breaker.ts

type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerConfig {
  failureThreshold: number; // Open circuit after N failures
  resetTimeoutMs: number;   // Try again after this many ms
  halfOpenMaxAttempts: number; // Allow N test requests when half-open
}

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if enough time has passed to try again
      if (Date.now() - this.lastFailureTime > this.config.resetTimeoutMs) {
        this.state = 'half_open';
        this.halfOpenAttempts = 0;
      } else {
        throw new CircuitOpenError(
          'Claude API circuit breaker is open. Service may be unavailable.',
          this.lastFailureTime + this.config.resetTimeoutMs
        );
      }
    }

    if (this.state === 'half_open' && this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
      throw new CircuitOpenError(
        'Claude API circuit breaker is half-open, max test attempts reached.',
        this.lastFailureTime + this.config.resetTimeoutMs
      );
    }

    try {
      const result = await fn();

      // Success: reset circuit
      if (this.state === 'half_open') {
        this.state = 'closed';
      }
      this.failureCount = 0;
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.state === 'half_open') {
        this.halfOpenAttempts++;
      }

      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'open';
      }

      throw error;
    }
  }

  getState(): { state: CircuitState; failureCount: number } {
    return { state: this.state, failureCount: this.failureCount };
  }
}

class CircuitOpenError extends Error {
  constructor(message: string, public retryAfter: number) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// Singleton for Claude API calls
export const claudeCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,       // Open after 5 consecutive failures
  resetTimeoutMs: 60_000,    // Wait 1 minute before retrying
  halfOpenMaxAttempts: 2,    // Allow 2 test requests
});
```

```typescript
// src/lib/ai/claude.ts — Usage with circuit breaker
import Anthropic from '@anthropic-ai/sdk';
import { claudeCircuitBreaker } from './circuit-breaker';

const anthropic = new Anthropic();

export async function extractMemories(content: string) {
  return claudeCircuitBreaker.execute(async () => {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildExtractionPrompt(content) }],
    });

    return parseExtractionResponse(response);
  });
}

// Fallback when circuit is open
export async function extractMemoriesWithFallback(content: string) {
  try {
    return await extractMemories(content);
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      // Queue for retry instead of failing immediately
      await queueForRetry(content, error.retryAfter);
      return {
        status: 'queued',
        message: 'Extraction service is temporarily unavailable. Your capture has been queued.',
        retryAt: new Date(error.retryAfter),
      };
    }
    throw error;
  }
}
```

**Pros**:
- Prevents cascading failures when Claude is down
- Fast failure instead of waiting for timeouts
- Automatic recovery when service returns
- User gets immediate feedback instead of hanging
- Protects against unnecessary API costs during outages

**Cons**:
- In-memory state lost on serverless cold starts (Vercel)
- Needs Redis-backed state for distributed circuit breaker
- Additional complexity in the AI call path
- Must be tuned (thresholds, timeouts) for real usage patterns

**Effort**: Medium (1-2 days)
**Risk**: Medium - serverless cold starts reset circuit state

## Recommended Action

**Implement all three solutions as complementary layers:**

1. **Solution 1 (Result types)** — First priority. Foundation for all error handling. Every Server Action returns typed `ActionState<T>` with error codes.
2. **Solution 2 (Error Boundaries)** — Second priority. Wrap dashboard layout and key pages. Prevents white screens.
3. **Solution 3 (Circuit breaker)** — Third priority. Protect the capture pipeline from Claude API failures. Consider Redis-backed state for production.

Order of implementation:
1. Define error types and `actionError` helper
2. Refactor `createCaptureAction` as the reference implementation
3. Add Error Boundaries to dashboard layout
4. Add circuit breaker to Claude API calls
5. Update capture pipeline to handle circuit-open state

## Technical Details

**Affected Components**:
- `src/lib/types/errors.ts` (new)
- `src/lib/actions/capture.ts` (refactor)
- `src/lib/actions/wake-prompt.ts` (refactor)
- `src/lib/actions/memory.ts` (refactor)
- `src/lib/ai/circuit-breaker.ts` (new)
- `src/lib/ai/claude.ts` (wrap with circuit breaker)
- `src/components/error-boundary.tsx` (new)
- `src/app/(dashboard)/layout.tsx` (add boundary)
- All UI components consuming Server Actions (update error display)

**Database Changes**:
```sql
-- No schema changes required.
-- Error handling is application-layer only.
```

**New Dependencies**:
```json
{
  "dependencies": {}
}
```
No new dependencies. All implementations use built-in TypeScript/React patterns.

## Acceptance Criteria

- [ ] `ActionState<T>` type includes error code, category, message, retryable flag
- [ ] `actionError()` helper used consistently in all Server Actions
- [ ] Validation errors show field-level feedback in UI
- [ ] System errors show user-friendly message (not stack trace)
- [ ] Retryable errors show "try again" affordance in UI
- [ ] Error Boundary wraps dashboard layout with recovery UI
- [ ] Error Boundary wraps memory browser with granular fallback
- [ ] Circuit breaker protects Claude API extraction calls
- [ ] Circuit open state surfaces "queued for retry" to user
- [ ] Capture pipeline handles partial failures (transaction rollback)
- [ ] Tests verify: Claude 503 results in capture status "failed" (not "processing")
- [ ] Tests verify: validation error returns correct field-level errors

## Work Log

### 2026-02-10
- **Review finding**: Architecture strategist + reliability sentinel identified error handling gap
- **Severity**: Marked as P2 — affects UX and data consistency but not security
- **Plan gap**: `ActionState<T>` defined but never extended with error classification
- **Key risk**: `after()` failures leave captures in "processing" state forever
- **Pattern chosen**: Result type (inspired by Rust/Go) over try/catch spaghetti
- **Decision needed**: Redis-backed vs in-memory circuit breaker for serverless
- **Next step**: Define error types, refactor createCaptureAction as reference

## Resources

- [Plan document](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L648) - ActionState<T> definition
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Circuit Breaker Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
- [TypeScript Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [Next.js Error Handling](https://nextjs.org/docs/app/building-your-application/routing/error-handling)
