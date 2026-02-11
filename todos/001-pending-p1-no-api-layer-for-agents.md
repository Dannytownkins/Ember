---
status: done
completed_at: 2026-02-10
completed_by: Ralph Loop Agent
priority: p1
issue_id: "001"
tags: [code-review, architecture, agent-native, api, blocking]
dependencies: []
---

# Problem Statement

**CRITICAL BLOCKING ISSUE**: The Ember MVP plan has zero API layer for agent access. Despite being a product ABOUT AI memory, AI agents cannot programmatically access Ember. This creates a fundamental contradiction: users' memories are locked in a web UI, inaccessible to the AI platforms the product is designed to work with.

**Why This Matters**: The core value proposition is "cross-platform AI memory" but without an API, agents on ChatGPT, Claude Desktop, Gemini, or any other platform cannot capture memories, query existing memories, or generate wake prompts. Every action requires manual human intervention through the web dashboard.

## Findings

**Source**: agent-native-reviewer, architecture-strategist

**Evidence**:
- 0/12 UI capabilities have agent-accessible equivalents
- No API endpoints defined in the plan
- API access explicitly deferred to "Phase 3+" as a paid feature (line 572)
- No `api_tokens` table in schema
- No authentication/authorization system for agents
- No OpenAPI documentation
- No MCP tool compatibility

**Impact Severity**: 🔴 BLOCKING - Product cannot fulfill its core value proposition

## Proposed Solutions

### Solution 1: API-First Architecture (Recommended)

**Approach**: Build API endpoints alongside every Server Action in Phase 1

**Implementation**:
```typescript
// 1. Add api_tokens table to schema
CREATE TABLE api_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

// 2. Create API endpoints mirroring UI actions
POST /api/v1/captures          # Submit conversation text
GET  /api/v1/memories          # Query memories (filter by category)
POST /api/v1/wake-prompts      # Generate wake prompt
GET  /api/v1/token-budget      # Check token costs
PUT  /api/v1/memories/:id      # Edit memory
DELETE /api/v1/memories/:id    # Delete memory

// 3. Token-based authentication
Authorization: Bearer <token>
```

**Pros**:
- Enables agent access from day one
- Validates architecture (if you can't API it, it's too UI-coupled)
- Opens MCP tool / ChatGPT action integration
- Free tier feature with rate limits (100 calls/day)

**Cons**:
- Adds ~2-3 days to Phase 1 timeline
- Requires OpenAPI spec generation
- Need rate limiting infrastructure

**Effort**: Medium (2-3 days)
**Risk**: Low - clarifies architecture

### Solution 2: Defer API, Ship Web-Only MVP

**Approach**: Ship Phase 1 with zero API, add in Phase 3

**Pros**:
- Faster to ship Phase 1
- Simpler initial architecture

**Cons**:
- Product cannot fulfill core value prop
- Agents cannot access memories = poor user experience
- Rewriting UI actions as APIs later = rework
- Competitive disadvantage vs platform memory

**Effort**: Zero (current plan)
**Risk**: HIGH - May invalidate product thesis

### Solution 3: Email-Only Agent Interface

**Approach**: Use email capture as the sole agent interface

**Pros**:
- Already in plan (Phase 2)
- Works without authentication

**Cons**:
- Read-only for agents (can capture, can't query)
- High latency (email routing delays)
- No wake prompt generation for agents
- Poor developer experience

**Effort**: Low (already planned)
**Risk**: MEDIUM - Insufficient for real agent workflows

## Recommended Action

**Choose Solution 1: API-First Architecture**

Move API access from Phase 3 to Phase 1 as a free tier feature. Build endpoints alongside Server Actions using shared business logic. This enables:
- Claude Code MCP tool integration
- ChatGPT custom actions
- Agent-driven memory capture
- Programmatic wake prompt generation

## Technical Details

**Affected Components**:
- `src/app/api/v1/` (new directory)
- `src/lib/db/schema.ts` (add api_tokens table)
- `src/lib/auth/` (token validation middleware)
- `src/lib/rate-limit/` (API rate limiting)

**Database Changes**:
- Add `api_tokens` table
- Add indexes: `idx_api_tokens_user`, `idx_api_tokens_hash`

**New Dependencies**:
- `jose` or `jsonwebtoken` for token signing
- `@upstash/ratelimit` for API rate limiting
- OpenAPI code generation (swagger or similar)

## Acceptance Criteria

- [ ] `api_tokens` table exists in schema with proper constraints
- [ ] Users can generate/revoke API tokens in settings UI
- [ ] POST /api/v1/captures works with Bearer token auth
- [ ] GET /api/v1/memories returns memories filtered by category
- [ ] POST /api/v1/wake-prompts generates wake prompt for selected categories
- [ ] Rate limiting enforced: 100 calls/day free, 1000/day paid
- [ ] OpenAPI 3.1 spec generated and published
- [ ] MCP tool example provided in docs
- [ ] All API endpoints return consistent error format

## Work Log

### 2026-02-10
- **Review finding**: Agent-native reviewer identified complete lack of API layer
- **Severity**: Marked as P1 BLOCKING - product cannot fulfill value prop without this
- **Next step**: Discuss with product owner whether to add API in Phase 1 or ship web-only

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L198-L210) - Architecture
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L572) - API access mentioned as Phase 3+
- Agent-native reviewer full report (in review output)
- Similar API-first examples: Stripe, GitHub, Linear
