---
title: "feat: Ember MVP — Implementation Plan"
type: feat
date: 2026-02-10
timeline: 9 days
status: approved
decisions:
  queue: inngest
  email_capture: deferred-phase-2
  soft_delete: deferred-phase-1.5
  screenshot_capture: deferred-phase-2
---

# Ember MVP — Implementation Plan

## Overview

Build the Ember MVP in 9 days: a secure, API-accessible AI memory platform where users capture conversations, extract dual-dimension memories (factual + emotional), browse by category, and generate wake prompts for any AI platform.

**What ships**: Paste capture, dual extraction, categorized memory browser, wake prompt generator, REST API for agents, Row-Level Security, rate limiting.

**What doesn't ship (yet)**: Screenshot capture (Phase 2), email capture (Phase 2), soft delete (Phase 1.5), Stripe/payments (Phase 3), browser extension (Phase 4), onboarding flow (Phase 4).

---

## Architecture Decisions (Locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Queue System | **Inngest** | 4 hours vs 2 days. Managed retries, observability, 5-min timeout. $20/mo. |
| Email Capture | **Phase 2** | Paste + screenshot enough to validate. Nobody's asked for it. |
| Soft Delete | **Phase 1.5** (2 weeks post-launch) | Strong confirmation dialogs. Low user count = low risk. |
| Timeline | **9 days** | Secure MVP without over-engineering. |
| Async Processing | **Inngest** (NOT `after()`) | `after()` has 15-second max execution. Inngest has 5-min timeout with step functions. All `after()` references in original plan are superseded. |
| Memory Categories | **5 categories from data model** | `emotional`, `work`, `hobbies`, `relationships`, `preferences`. The UI doc's alternate taxonomy (`fact`, `preference`, etc.) is incorrect — ignore it. |
| `captureEmail` field | **Nullable in Phase 1** | Email capture is Phase 2. Remove NOT NULL constraint. Add it back when email launches. |
| Token Budget | **8,000 tokens default** | Configurable per user in settings. Sensible default for ChatGPT/Claude context windows. |
| Pagination | **Cursor-based, 50 per page** | Infinite scroll on memories page. Cursor = `createdAt` of last item. |
| Clerk Webhook Fallback | **Just-in-time creation** | If `auth()` returns userId but no DB row exists, create user inline. Prevents broken state from delayed webhooks. |

---

## Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js | 16 | App Router, React 19, Server Components |
| Language | TypeScript | 5.x | Strict mode |
| Styling | Tailwind CSS | v4 | Dark mode first, amber accent |
| Database | Neon Postgres | Serverless | HTTP driver for queries, pooled for transactions |
| ORM | Drizzle ORM | Latest | Type-safe schema, `drizzle-kit` for migrations |
| Auth | Clerk | `@clerk/nextjs` | Middleware + webhook sync |
| AI | Anthropic Claude | `@anthropic-ai/sdk` | claude-sonnet-4-5-20250929 for extraction |
| Queue | Inngest | `inngest` v3 | Background capture processing |
| Rate Limiting | Upstash | `@upstash/ratelimit` + `@upstash/redis` | Sliding window |
| Validation | Zod | Latest | Server Actions, API routes, Claude responses |
| Animation | Motion | `motion` | Framer Motion successor |
| Deployment | Vercel | Node.js runtime | NOT Edge (needs transactions) |

---

## Data Model

### Schema (4 tables + 1 new table for API)

```
┌──────────────────────────┐
│         users            │
├──────────────────────────┤
│ id          uuid PK      │
│ clerkId     text UK, NN  │
│ email       text NN      │
│ captureEmail text UK     │  ← NULLABLE in Phase 1 (was NN)
│ tier        text NN      │  ← NEW: 'free' | 'pro' | 'founders'
│             CHECK(free,  │     default 'free'
│             pro,founders)│
│ onboardingCompleted bool │  ← NEW: default false
│ tokenBudget int NN       │  ← NEW: default 8000
│ createdAt   timestamptz  │
│ updatedAt   timestamptz  │
└──────────────────────────┘
         │
         ▼ ON DELETE: CASCADE
┌──────────────────────────┐
│        profiles          │
├──────────────────────────┤
│ id          uuid PK      │
│ userId      uuid FK, NN  │
│ name        text NN      │
│ platform    text         │
│ isDefault   bool NN, F   │
│ createdAt   timestamptz  │
│ updatedAt   timestamptz  │
└──────────────────────────┘
         │
         ▼ ON DELETE: CASCADE
┌──────────────────────────┐     ┌──────────────────────────┐
│       captures           │     │       memories           │
├──────────────────────────┤     ├──────────────────────────┤
│ id          uuid PK      │     │ id          uuid PK      │
│ profileId   uuid FK, NN  │     │ profileId   uuid FK, NN  │
│ method      text NN      │────<│ captureId   uuid FK      │
│   CHECK(paste,screenshot,│     │ category    text NN      │
│   email, api)            │     │   CHECK(emotional, work, │
│ status      text NN      │     │   hobbies, relationships,│
│   CHECK(queued,processing│     │   preferences)           │
│   completed, failed)     │     │ factualContent  text NN  │
│ errorMessage text        │     │ emotionalSignificance    │
│ rawText     text         │     │   text                   │
│ imageUrls   jsonb        │     │ verbatimText    text NN  │
│ platform    text         │     │ summaryText     text     │
│ createdAt   timestamptz  │     │ useVerbatim  bool NN, F  │
│ updatedAt   timestamptz  │     │ importance   int NN      │
└──────────────────────────┘     │   CHECK(1-5)             │
                                  │ verbatimTokens int NN    │
         ON DELETE: CASCADE       │ summaryTokens  int       │
                                  │ speakerConfidence real   │
                                  │   CHECK(0.0-1.0)         │
                                  │ createdAt   timestamptz  │
                                  │ updatedAt   timestamptz  │
                                  └──────────────────────────┘

                                    ON DELETE: CASCADE

┌──────────────────────────┐
│       api_tokens         │  ← NEW TABLE (P1 Priority #2)
├──────────────────────────┤
│ id          uuid PK      │
│ userId      uuid FK, NN  │
│ name        text NN      │  'My CLI Token', 'MCP Server'
│ tokenHash   text UK, NN  │  SHA-256 of Bearer token
│ lastUsedAt  timestamptz  │
│ expiresAt   timestamptz  │
│ scopes      text[] NN    │  ['read', 'write', 'wake']
│ createdAt   timestamptz  │
│ updatedAt   timestamptz  │
└──────────────────────────┘

  ON DELETE: CASCADE (from users)
```

### Schema Changes from Original Plan

| Change | Reason |
|--------|--------|
| `captureEmail` now NULLABLE | Email capture deferred to Phase 2 |
| `captures.status` adds `queued` | Inngest job status before processing starts |
| `captures.method` adds `api` | API-submitted captures |
| `users.tier` added | Rate limiting needs tier lookup |
| `users.onboardingCompleted` added | Track first-run state for future onboarding (Phase 4) |
| `users.tokenBudget` added | User-configurable wake prompt budget |
| `api_tokens` table added | API access for agents (P1 Priority #2) |

### Indexes

```sql
-- Primary lookups
CREATE UNIQUE INDEX idx_users_clerk_id ON users(clerk_id);
CREATE UNIQUE INDEX idx_users_capture_email ON users(capture_email) WHERE capture_email IS NOT NULL;
CREATE INDEX idx_profiles_user_id ON profiles(user_id);

-- Memory queries (most frequent)
CREATE INDEX idx_memories_profile_category ON memories(profile_id, category);
CREATE INDEX idx_memories_profile_created ON memories(profile_id, created_at DESC);
CREATE INDEX idx_memories_profile_importance ON memories(profile_id, importance DESC);
CREATE INDEX idx_memories_capture ON memories(capture_id);

-- Capture queue processing
CREATE INDEX idx_captures_status ON captures(status) WHERE status IN ('queued', 'processing');
CREATE INDEX idx_captures_profile ON captures(profile_id, created_at DESC);

-- API token lookup
CREATE UNIQUE INDEX idx_api_tokens_hash ON api_tokens(token_hash);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);
```

---

## Directory Structure

```
ember/
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   │   ├── page.tsx                  # Landing page
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                # Authenticated layout (sidebar + bottom tabs)
│   │   │   ├── memories/
│   │   │   │   └── page.tsx              # Memory browser with category filters
│   │   │   ├── capture/
│   │   │   │   └── page.tsx              # Paste capture interface
│   │   │   ├── wake/
│   │   │   │   └── page.tsx              # Wake prompt generator
│   │   │   ├── settings/
│   │   │   │   └── page.tsx              # Account, preferences, token budget
│   │   │   └── page.tsx                  # Dashboard home (redirects to /memories)
│   │   ├── api/
│   │   │   ├── inngest/
│   │   │   │   └── route.ts              # Inngest serve endpoint
│   │   │   ├── captures/
│   │   │   │   └── [id]/
│   │   │   │       └── status/
│   │   │   │           └── route.ts      # Polling endpoint for capture status
│   │   │   ├── v1/
│   │   │   │   ├── captures/
│   │   │   │   │   └── route.ts          # POST - create capture via API
│   │   │   │   ├── memories/
│   │   │   │   │   └── route.ts          # GET - query memories
│   │   │   │   ├── wake-prompts/
│   │   │   │   │   └── route.ts          # POST - generate wake prompt
│   │   │   │   └── tokens/
│   │   │   │       └── route.ts          # CRUD API tokens
│   │   │   └── webhooks/
│   │   │       └── clerk/
│   │   │           └── route.ts          # Clerk webhook handler
│   │   ├── sign-in/[[...sign-in]]/
│   │   │   └── page.tsx
│   │   ├── sign-up/[[...sign-up]]/
│   │   │   └── page.tsx
│   │   ├── layout.tsx                    # Root layout
│   │   └── globals.css                   # Tailwind + design tokens
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts                 # Drizzle schema (all 5 tables)
│   │   │   ├── queries.ts                # Reusable query functions
│   │   │   ├── index.ts                  # DB connection + client
│   │   │   └── tenant-context.ts         # RLS session variable management
│   │   ├── ai/
│   │   │   ├── extraction.ts             # Dual extraction prompt + Zod schema
│   │   │   ├── wake-prompt.ts            # Wake prompt template + generation
│   │   │   └── client.ts                 # Anthropic SDK client
│   │   ├── inngest/
│   │   │   ├── client.ts                 # Inngest client instance
│   │   │   └── functions/
│   │   │       └── process-capture.ts    # Capture processing function
│   │   ├── rate-limit/
│   │   │   └── index.ts                  # Upstash rate limiters by tier
│   │   ├── api/
│   │   │   ├── auth.ts                   # Bearer token validation middleware
│   │   │   └── response.ts              # Standardized API response helpers
│   │   ├── actions/
│   │   │   ├── captures.ts               # Server Actions for captures
│   │   │   ├── memories.ts               # Server Actions for memories
│   │   │   ├── profiles.ts               # Server Actions for profiles
│   │   │   └── wake-prompts.ts           # Server Actions for wake prompts
│   │   └── validators/
│   │       └── schemas.ts                # Zod schemas for all inputs
│   ├── components/
│   │   ├── ui/                           # Base UI components
│   │   ├── memory-card.tsx
│   │   ├── category-filter.tsx
│   │   ├── capture-form.tsx
│   │   ├── processing-indicator.tsx
│   │   ├── wake-prompt-preview.tsx
│   │   ├── token-budget-display.tsx
│   │   └── profile-selector.tsx
│   └── middleware.ts                     # Clerk auth middleware
├── drizzle/                              # Generated migrations
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── package.json
├── tsconfig.json
├── .env.example
└── vercel.json                           # Cron jobs config
```

---

## Implementation Phases (9 Days)

### Phase 1: Project Setup + Inngest Queue (Days 1-2)

**Goal**: Working Next.js app with database, auth, and background processing.

#### Day 1: Project Initialization

```
Tasks:
├── npx create-next-app@latest ember --typescript --tailwind --app --src-dir
├── Install dependencies:
│   ├── drizzle-orm @neondatabase/serverless
│   ├── drizzle-kit (dev)
│   ├── @clerk/nextjs
│   ├── @anthropic-ai/sdk
│   ├── inngest
│   ├── @upstash/ratelimit @upstash/redis
│   ├── zod
│   └── motion
├── Create .env.example with all required variables
├── Configure drizzle.config.ts → Neon connection
├── Write Drizzle schema (src/lib/db/schema.ts) — all 5 tables
├── Generate + run initial migration
├── Set up Clerk middleware (src/middleware.ts)
├── Create Clerk webhook handler (user.created, user.deleted)
│   └── Include just-in-time user creation fallback
├── Configure globals.css with design tokens (amber theme, dark mode)
└── Deploy empty shell to Vercel (verify infra works)
```

**Acceptance criteria**:
- [ ] `npm run dev` starts without errors
- [ ] Clerk sign-up creates user row in Neon
- [ ] `drizzle-kit push` applies schema without errors
- [ ] Vercel deployment succeeds

#### Day 2: Inngest Queue + Capture Pipeline

```
Tasks:
├── Set up Inngest client (src/lib/inngest/client.ts)
├── Create Inngest serve route (src/app/api/inngest/route.ts)
├── Write process-capture function with step functions:
│   ├── step.run('validate') — verify capture exists, status → processing
│   ├── step.run('extract') — call Claude with dual extraction prompt
│   ├── step.run('save') — write memories to DB, status → completed
│   └── Error handling: status → failed, errorMessage populated
├── Write dual extraction prompt (src/lib/ai/extraction.ts)
│   ├── Zod schema for Claude's structured response
│   ├── Category assignment
│   ├── Importance scoring (1-5)
│   └── Token counting per memory
├── Create paste capture Server Action (src/lib/actions/captures.ts)
│   ├── Zod validation (min 100 chars, max 100,000 chars)
│   ├── Create capture record (status: queued)
│   ├── Fire Inngest event: capture/created
│   └── Return captureId
├── Create polling endpoint (GET /api/captures/[id]/status)
│   └── Returns: { status, progress, memoryCount, errorMessage }
└── Test: paste text → capture created → Inngest processes → memories saved
```

**Acceptance criteria**:
- [ ] Inngest dev server connects and shows functions
- [ ] Paste capture creates queued capture record
- [ ] Inngest processes capture and creates memories
- [ ] Polling endpoint returns real-time status
- [ ] Failed captures show error message
- [ ] 3 automatic retries on transient failures

---

### Phase 2: API Layer for Agents (Days 3-5)

**Goal**: REST API with Bearer token auth so agents can access memories.

#### Day 3: API Token System + Auth Middleware

```
Tasks:
├── Build API token management:
│   ├── Server Action: createApiToken (generates token, stores hash)
│   ├── Server Action: revokeApiToken
│   ├── Server Action: listApiTokens
│   └── Token displayed ONCE on creation (never shown again)
├── Build Bearer token auth middleware (src/lib/api/auth.ts):
│   ├── Extract Bearer token from Authorization header
│   ├── SHA-256 hash → lookup in api_tokens table
│   ├── Verify not expired, update lastUsedAt
│   ├── Return userId + scopes
│   └── 401 for invalid/expired/missing tokens
├── Build standardized API response helpers:
│   ├── success(data, status) → { data, meta: { timestamp } }
│   ├── error(message, code, status) → { error: { message, code } }
│   └── paginated(data, cursor, hasMore)
└── Settings page: token management UI (create, list, revoke)
```

#### Day 4: Core API Endpoints

```
Tasks:
├── POST /api/v1/captures
│   ├── Auth: Bearer token with 'write' scope
│   ├── Body: { profileId, text, platform? }
│   ├── Validates with Zod
│   ├── Creates capture + fires Inngest event
│   └── Returns: { captureId, status: 'queued' }
├── GET /api/v1/captures/:id/status
│   ├── Auth: Bearer token with 'read' scope
│   └── Returns: { status, progress, memoryCount, errorMessage }
├── GET /api/v1/memories
│   ├── Auth: Bearer token with 'read' scope
│   ├── Query params: profileId, category?, cursor?, limit? (default 50)
│   ├── Cursor-based pagination
│   └── Returns: { data: Memory[], meta: { cursor, hasMore } }
├── GET /api/v1/memories/:id
│   ├── Auth: Bearer token with 'read' scope
│   └── Returns single memory with all fields
├── GET /api/v1/profiles
│   ├── Auth: Bearer token with 'read' scope
│   └── Returns: all profiles for authenticated user
└── Rate limit headers on all responses:
    ├── X-RateLimit-Limit
    ├── X-RateLimit-Remaining
    └── X-RateLimit-Reset
```

#### Day 5: Wake Prompt API + OpenAPI Spec

```
Tasks:
├── POST /api/v1/wake-prompts
│   ├── Auth: Bearer token with 'wake' scope
│   ├── Body: { profileId, categories: string[], budget?: number }
│   ├── Generates wake prompt from selected categories
│   ├── Free tier: truncation by importance
│   └── Returns: { prompt, tokenCount, memoryCount, categories }
├── Write wake prompt template (src/lib/ai/wake-prompt.ts)
│   └── See "Wake Prompt Template" section below
├── Generate OpenAPI spec from Zod schemas
│   └── Serve at GET /api/v1/openapi.json
└── Test with curl: full API flow end-to-end
    ├── Create token → create capture → poll status → get memories → generate wake prompt
    └── Verify rate limit headers present
```

**Acceptance criteria (full API layer)**:
- [ ] API tokens can be created, listed, revoked in settings UI
- [ ] Bearer token authentication works on all /api/v1/ endpoints
- [ ] POST /api/v1/captures creates capture + triggers Inngest
- [ ] GET /api/v1/memories returns paginated results
- [ ] POST /api/v1/wake-prompts generates and returns wake prompt
- [ ] Invalid/expired tokens return 401
- [ ] Missing scopes return 403
- [ ] Rate limit headers present on all responses
- [ ] OpenAPI spec accessible at /api/v1/openapi.json

---

### Phase 3: Row-Level Security (Days 6-7)

**Goal**: Database-level tenant isolation that cannot be bypassed.

#### Day 6: RLS Policies

```
Tasks:
├── Write RLS migration:
│   ├── ALTER TABLE profiles ENABLE ROW LEVEL SECURITY
│   ├── ALTER TABLE captures ENABLE ROW LEVEL SECURITY
│   ├── ALTER TABLE memories ENABLE ROW LEVEL SECURITY
│   ├── ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY
│   ├── CREATE POLICY on each table using current_setting('app.user_id')
│   └── FORCE ROW LEVEL SECURITY (even for table owner)
├── Build tenant context middleware (src/lib/db/tenant-context.ts):
│   ├── withTenant(userId, fn) — sets SET LOCAL app.user_id
│   ├── Uses Neon pooled connection (not HTTP) for RLS
│   └── AsyncLocalStorage for request-scoped context
├── Update DB connection to support both:
│   ├── HTTP driver for simple reads (no RLS needed for public pages)
│   └── Pooled connection for authenticated operations (RLS enforced)
└── Important: RLS on Neon serverless requires connection pooling mode
    └── Set pooling mode to "session" for SET LOCAL to work
```

#### Day 7: RLS Integration + Testing

```
Tasks:
├── Wrap all Server Actions with withTenant():
│   ├── captures.ts — all actions
│   ├── memories.ts — all actions
│   ├── profiles.ts — all actions
│   └── wake-prompts.ts — all actions
├── Wrap all API routes with tenant context from Bearer token
├── Test isolation:
│   ├── Create 2 test users
│   ├── User A creates memories
│   ├── User B queries — should see 0 results (RLS blocks)
│   ├── Direct SQL without context — should see 0 results
│   └── Admin bypass for migrations (superuser role)
└── Error logging for RLS violations
```

**Acceptance criteria**:
- [ ] RLS enabled on profiles, captures, memories, api_tokens
- [ ] All Server Actions wrapped with tenant context
- [ ] All API routes wrapped with tenant context
- [ ] User A cannot see User B's data (verified with test)
- [ ] Direct DB queries without context return empty results
- [ ] RLS policies work with Neon connection pooling

---

### Phase 4: Rate Limiting + UI (Days 8-9)

**Goal**: Tier-based rate limits enforced, core UI functional.

#### Day 8: Rate Limiting

```
Tasks:
├── Set up Upstash Redis connection
├── Create tier-based rate limiters (src/lib/rate-limit/index.ts):
│   ├── Capture limits: 5/day free, 50/day paid, 100/day founders
│   ├── API general: 100 req/min per user
│   └── Wake prompt: 50/hour per user
├── Apply rate limiting to:
│   ├── createCaptureAction (Server Action)
│   ├── All /api/v1/* routes
│   └── generateWakePromptAction
├── Return clear error with reset time when limit exceeded
├── Rate limit headers on all API responses
└── Capture page shows remaining captures: "3 of 5 captures remaining today"
```

#### Day 9: Core UI Polish + Deploy

```
Tasks:
├── Capture page (/capture):
│   ├── Profile selector dropdown
│   ├── Large textarea with character count
│   ├── Min 100 chars, max 100,000 chars validation
│   ├── Platform auto-detection (ChatGPT, Claude, Gemini patterns)
│   ├── "Extract Memories" button
│   ├── Processing indicator (3 stages with progress)
│   ├── When complete: show extracted memories inline
│   ├── "View all memories →" link to /memories
│   └── Remaining captures counter
├── Memories page (/memories):
│   ├── Category filter pills (emotional, work, hobbies, relationships, preferences)
│   ├── Memory cards with: category badge, importance dots, date, dual content
│   ├── Inline edit (verbatimText, category, useVerbatim toggle)
│   ├── Delete with confirmation dialog
│   ├── Cursor-based infinite scroll (50 per page)
│   └── Empty state: "No memories yet. Capture your first conversation →"
├── Wake prompt page (/wake):
│   ├── Category checkboxes with per-category token counts
│   ├── Total token budget display (used / budget)
│   ├── "Generate Wake Prompt" button
│   ├── Preview with copy button
│   ├── Token count + memory count in footer
│   └── Empty state: "Add some memories first"
├── Settings page (/settings):
│   ├── Account info (from Clerk)
│   ├── Token budget slider (4,000 - 16,000, default 8,000)
│   ├── API tokens management (create, list, revoke)
│   ├── Delete account with double confirmation:
│   │   ├── First: "Are you sure? This cannot be undone."
│   │   ├── Second: Type "DELETE" to confirm
│   │   └── Action: CASCADE delete + Clerk API delete
│   └── Data export (JSON download)
├── Dashboard layout:
│   ├── Desktop: sidebar navigation
│   ├── Mobile: bottom tab bar (Memories, Capture, Wake, Settings)
│   └── Responsive breakpoint at 768px
└── Final deployment to Vercel production
```

**Acceptance criteria (full MVP)**:
- [ ] User signs up → default profile created
- [ ] User pastes conversation → memories extracted with dual content
- [ ] Memories display with category filters, importance, inline edit
- [ ] Wake prompt generates from selected categories with token budget
- [ ] API endpoints work with Bearer token
- [ ] Rate limiting enforces tier caps
- [ ] RLS prevents cross-tenant access
- [ ] Delete account with double confirmation works
- [ ] Mobile-responsive with bottom tabs

---

## Wake Prompt Template

This is the primary output of the product. The template structures user memories into a system prompt for any AI platform.

```
You are starting a conversation with someone you know well. Here is what you remember about them:

## About {profileName}

{if emotional memories selected}
### Emotional Context
These are sensitive topics. Handle with care and awareness.

{for each emotional memory, sorted by importance DESC}
- {factualContent}
  → {emotionalSignificance}
{end for}
{end if}

{if work memories selected}
### Work & Projects
{for each work memory, sorted by importance DESC}
- {factualContent}
{if emotionalSignificance}  → {emotionalSignificance}{end if}
{end for}
{end if}

{if hobbies memories selected}
### Hobbies & Interests
{for each hobbies memory, sorted by importance DESC}
- {factualContent}
{end for}
{end if}

{if relationships memories selected}
### Relationships
{for each relationships memory, sorted by importance DESC}
- {factualContent}
{if emotionalSignificance}  → {emotionalSignificance}{end if}
{end for}
{end if}

{if preferences memories selected}
### Preferences
{for each preferences memory, sorted by importance DESC}
- {factualContent}
{end for}
{end if}

---
Use this context naturally. Don't list facts back. Don't say "I remember that..." — just know it. Reference memories when relevant, especially emotional ones. Be warm and aware.

Token count: {totalTokens} | Memories: {memoryCount} | Generated by Ember
```

**Free tier**: Pack memories by importance until budget is reached. Truncate the rest.

**Paid tier** (Phase 3): Claude compresses all selected memories into ~800 tokens of dense essence, preserving emotional nuance.

---

## Dual Extraction Prompt

```typescript
// src/lib/ai/extraction.ts
const EXTRACTION_PROMPT = `
You are analyzing a conversation to extract memories for a personal AI memory system.

For each distinct piece of memorable information, extract:

1. FACTUAL CONTENT: The concrete information (dates, names, facts, preferences, decisions).
   Be specific and complete.

2. EMOTIONAL SIGNIFICANCE: Why might someone want to remember this? What's the emotional weight?
   What would an AI need to understand to handle this topic with care?
   If there is no emotional significance, set to null.

3. CATEGORY: One of exactly these five:
   - "emotional" — feelings, difficult moments, vulnerable topics, mental health
   - "work" — career, projects, professional goals, skills
   - "hobbies" — interests, activities, entertainment, creative pursuits
   - "relationships" — family, friends, partners, social dynamics
   - "preferences" — likes, dislikes, communication style, pet peeves

4. IMPORTANCE: 1-5 scale
   - 5: Life-defining (birth of child, career change, loss)
   - 4: Significant (new relationship, major decision)
   - 3: Notable (strong preference, recurring theme)
   - 2: Useful (minor preference, one-time fact)
   - 1: Trivial (mentioned once, low weight)

Return a JSON array of memories. A single conversation typically yields 5-15 memories.
Do not extract small talk or filler. Focus on information that would help an AI know this person.

Respond ONLY with valid JSON matching this schema:
{
  "memories": [
    {
      "factualContent": "string",
      "emotionalSignificance": "string | null",
      "category": "emotional | work | hobbies | relationships | preferences",
      "importance": 1-5,
      "verbatimText": "string (the exact relevant excerpt from the conversation)"
    }
  ]
}
`;
```

### Extraction Response Zod Schema

```typescript
// src/lib/validators/schemas.ts
import { z } from 'zod';

const memoryCategory = z.enum([
  'emotional', 'work', 'hobbies', 'relationships', 'preferences'
]);

const extractedMemory = z.object({
  factualContent: z.string().min(1),
  emotionalSignificance: z.string().nullable(),
  category: memoryCategory,
  importance: z.number().int().min(1).max(5),
  verbatimText: z.string().min(1),
});

export const extractionResponse = z.object({
  memories: z.array(extractedMemory).min(1).max(50),
});

// Capture input validation
export const createCaptureSchema = z.object({
  profileId: z.string().uuid(),
  text: z.string().min(100, 'Minimum 100 characters').max(100_000, 'Maximum 100,000 characters'),
  platform: z.enum(['chatgpt', 'claude', 'gemini', 'other']).optional(),
});
```

---

## API Specification

### Authentication

All `/api/v1/*` endpoints require Bearer token authentication:

```
Authorization: Bearer emb_live_abc123...
```

Token format: `emb_live_` prefix + 32 random bytes (base64url encoded).
Server stores SHA-256 hash only. Token shown once on creation.

### Endpoints

| Method | Path | Scopes | Description |
|--------|------|--------|-------------|
| POST | /api/v1/captures | write | Create a new capture |
| GET | /api/v1/captures/:id/status | read | Poll capture processing status |
| GET | /api/v1/memories | read | List memories (paginated) |
| GET | /api/v1/memories/:id | read | Get single memory |
| PATCH | /api/v1/memories/:id | write | Update memory fields |
| DELETE | /api/v1/memories/:id | write | Delete a memory |
| GET | /api/v1/profiles | read | List profiles |
| POST | /api/v1/wake-prompts | wake | Generate wake prompt |
| GET | /api/v1/openapi.json | — | OpenAPI spec (no auth) |

### Error Response Format

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Daily capture limit reached. Resets at 2026-02-11T00:00:00Z",
    "details": {
      "limit": 5,
      "remaining": 0,
      "reset": "2026-02-11T00:00:00Z"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|------------|-------------|
| UNAUTHORIZED | 401 | Missing or invalid Bearer token |
| FORBIDDEN | 403 | Token lacks required scope |
| NOT_FOUND | 404 | Resource not found (or RLS blocked) |
| VALIDATION_ERROR | 422 | Request body failed Zod validation |
| RATE_LIMIT_EXCEEDED | 429 | Tier rate limit exceeded |
| CAPTURE_FAILED | 500 | Inngest processing failed |
| INTERNAL_ERROR | 500 | Unexpected server error |

---

## Rate Limiting Tiers

| Resource | Free | Pro | Founders |
|----------|------|-----|----------|
| Captures per day | 5 | 50 | 100 |
| API requests per minute | 30 | 100 | 200 |
| Wake prompts per hour | 10 | 50 | 100 |

Sliding window (24h for captures, 1m for API, 1h for wake prompts).

When limit exceeded:
- Server Actions: return `ActionState<T>` with error message + reset time
- API routes: return 429 with `Retry-After` header + error body

---

## Inngest Functions

### process-capture

```typescript
// src/lib/inngest/functions/process-capture.ts
export const processCapture = inngest.createFunction(
  {
    id: 'process-capture',
    retries: 3,
    concurrency: { limit: 5 },  // Max 5 concurrent to control Claude API costs
  },
  { event: 'capture/created' },
  async ({ event, step }) => {
    const { captureId } = event.data;

    // Step 1: Validate + mark processing
    const capture = await step.run('validate', async () => {
      const result = await db.update(captures)
        .set({ status: 'processing' })
        .where(eq(captures.id, captureId))
        .returning();
      if (!result.length) throw new Error('Capture not found');
      return result[0];
    });

    // Step 2: Extract memories via Claude
    const extracted = await step.run('extract', async () => {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        messages: [
          { role: 'user', content: `${EXTRACTION_PROMPT}\n\nConversation:\n${capture.rawText}` }
        ],
      });
      const parsed = extractionResponse.parse(JSON.parse(response.content[0].text));
      return parsed.memories;
    });

    // Step 3: Count tokens + save memories
    await step.run('save', async () => {
      const memoriesWithTokens = extracted.map(m => ({
        ...m,
        profileId: capture.profileId,
        captureId: capture.id,
        verbatimTokens: countTokens(m.verbatimText),
        summaryTokens: null,
        useVerbatim: true,
      }));

      await db.insert(memories).values(memoriesWithTokens);
      await db.update(captures)
        .set({ status: 'completed' })
        .where(eq(captures.id, captureId));
    });

    return { memoryCount: extracted.length };
  }
);
```

### Error Handling in Inngest

On failure after all retries:
```typescript
onFailure: async ({ error, event }) => {
  await db.update(captures)
    .set({
      status: 'failed',
      errorMessage: error.message.slice(0, 500),
    })
    .where(eq(captures.id, event.data.captureId));
}
```

---

## Clerk Webhook Handler

```typescript
// src/app/api/webhooks/clerk/route.ts
// Handles: user.created, user.deleted
// Includes:
// - Svix signature verification
// - Idempotency check (don't create duplicate users)
// - Just-in-time user creation fallback in auth middleware
// - Account deletion: CASCADE delete DB rows + Clerk cleanup
// - Strong confirmation required before deletion (handled in UI)

// Account deletion sequence:
// 1. User clicks "Delete Account" in Settings
// 2. First confirmation: "Are you sure? This cannot be undone."
// 3. Second confirmation: Type "DELETE" to confirm
// 4. Server Action: DELETE FROM users WHERE id = ? (CASCADE handles children)
// 5. Call Clerk API: clerkClient.users.deleteUser(clerkId)
// 6. Sign out + redirect to marketing page
```

---

## Environment Variables

```bash
# .env.example

# Neon Postgres
DATABASE_URL=postgresql://...@ep-xxx.us-east-2.aws.neon.tech/ember?sslmode=require
DATABASE_URL_POOLED=postgresql://...@ep-xxx.us-east-2.aws.neon.tech/ember?sslmode=require&pgbouncer=true

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Known Limitations (Documented, Not Solved)

These are intentionally deferred. Document in README and track in todos.

| Limitation | Mitigation | When to Fix |
|-----------|------------|-------------|
| No soft delete | Double confirmation dialog on all deletes | Phase 1.5 (2 weeks) |
| No email capture | Paste-only in MVP | Phase 2 |
| No screenshot capture | Paste-only in MVP | Phase 2 |
| No onboarding flow | Empty states serve as guidance | Phase 4 |
| No duplicate detection | Users can manually delete duplicates | Phase 2 (content hash) |
| No search | Browse by category, scroll | Phase 2 (full-text), Phase 3 (semantic) |
| No monitoring | Console logs only | Add Sentry in first week post-launch |
| Wake prompts not stored | Generated fresh each time | Add caching post-launch |
| Free tier truncation only | Paid compression in Phase 3 | Phase 3 |

---

## Acceptance Criteria (Full MVP)

### Functional
- [ ] User can sign up via Clerk and land on dashboard
- [ ] User can paste a conversation (100-100,000 chars) and extract memories
- [ ] Extraction produces memories with factual content + emotional significance
- [ ] Memories display in browser with category filters
- [ ] Memories support inline edit (text, category, useVerbatim)
- [ ] Memories support delete with double confirmation
- [ ] Wake prompt generates from selected categories within token budget
- [ ] Wake prompt copy-to-clipboard works
- [ ] API tokens can be created, listed, and revoked
- [ ] All API endpoints work with Bearer token auth
- [ ] API returns paginated results with cursor

### Security
- [ ] RLS prevents User A from seeing User B's data
- [ ] Rate limiting enforces 5/day free, 50/day paid, 100/day founders
- [ ] API tokens are hashed (never stored in plain text)
- [ ] Clerk webhook verifies Svix signature
- [ ] All inputs validated with Zod

### Performance
- [ ] Capture processing completes within 60 seconds via Inngest
- [ ] Memory page loads in < 2 seconds (50 memories)
- [ ] Wake prompt generates in < 5 seconds
- [ ] API response time < 500ms for read endpoints

### Deployment
- [ ] Vercel production deployment succeeds
- [ ] All environment variables configured
- [ ] Inngest functions registered and visible in dashboard
- [ ] Health check: sign up → capture → memories → wake prompt → API

---

## References

### Source Documents
- [Original plan](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md) — 88KB narrative plan (decisions superseded by this document)
- [UI/UX spec](docs/plans/ui-ux-recommendations.md) — Component designs, animations, design tokens
- [P1 prioritization](todos/000-pending-p1-PRIORITIZATION-PLAN.md) — Architecture decisions and timeline
- [All todos](todos/) — 26 review findings (P1/P2/P3)

### External Docs
- [Inngest Quick Start](https://www.inngest.com/docs/getting-started/nextjs-quick-start)
- [Drizzle + Neon](https://orm.drizzle.team/docs/get-started/neon-new)
- [Clerk Next.js](https://clerk.com/docs/quickstarts/nextjs)
- [Upstash Rate Limiting](https://upstash.com/docs/oss/sdks/ts/ratelimit/overview)
- [Neon RLS](https://neon.tech/docs/guides/row-level-security)

### Review Findings (Active P1s)
- `001` — API layer for agents → Addressed in Phase 2 (Days 3-5)
- `003` — Tenant isolation → Addressed in Phase 3 (Days 6-7)
- `005` — Async processing timeout → Addressed in Phase 1 (Days 1-2) with Inngest
- `006` — Rate limiting → Addressed in Phase 4 (Day 8)
