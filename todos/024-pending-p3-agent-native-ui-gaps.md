---
status: pending
priority: p3
issue_id: "024"
tags: [code-review, architecture, agent-native, api]
dependencies: ["001"]
---

# Problem Statement

**AGENT PARITY GAP**: Several UI-only flows have no API/tool equivalents. Category picker, memory browser filtering, memory editing, and profile management are web-only. Agents cannot browse/filter memories by category, edit existing memories, or manage profiles programmatically.

**Why This Matters**: Ember's value proposition is cross-platform AI memory. If an agent in Claude Desktop can capture a memory via API (issue 001) but cannot browse existing memories by category, edit a misattributed memory, or switch between profiles, it has a crippled experience. Every UI capability needs an agent-accessible equivalent to fulfill the "agent-native" promise.

## Findings

**Source**: agent-native-reviewer

**Evidence**:
- 0/12 UI capabilities have agent equivalents (line 22 of issue 001)
- Issue 001 addresses core API endpoints but not the full feature surface
- Category filtering in memory browser has no query parameter design
- Memory editing (factual content, emotional significance, category, importance) is UI-only
- Profile switching (choosing which "identity" to capture to) has no API flow
- Wake prompt generation with category selection has no tool-use interface
- Verbatim/summary toggle per memory has no API endpoint

**Impact Severity**: LOW - Agents can function with basic API; full parity is quality-of-life

## Proposed Solutions

### Solution 1: Mirror Every UI Action as an API Endpoint (Recommended)

**Approach**: Extend the API layer from issue 001 to cover all UI actions

**Implementation**:
```typescript
// app/api/v1/memories/route.ts
// Extended memory query with full filtering

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { memories } from '@/lib/db/schema';
import { and, eq, inArray, gte, lte, desc, asc, sql } from 'drizzle-orm';
import { authenticateAPI } from '@/lib/auth/api-auth';

export async function GET(req: NextRequest) {
  const user = await authenticateAPI(req);
  const params = req.nextUrl.searchParams;

  // Build dynamic query from filters
  const conditions = [eq(memories.profileId, params.get('profileId')!)];

  // Category filter (comma-separated)
  const categories = params.get('categories')?.split(',');
  if (categories?.length) {
    conditions.push(inArray(memories.category, categories));
  }

  // Importance filter
  const minImportance = params.get('minImportance');
  if (minImportance) {
    conditions.push(gte(memories.importance, parseInt(minImportance)));
  }

  // Date range filter
  const since = params.get('since');
  if (since) {
    conditions.push(gte(memories.createdAt, new Date(since)));
  }

  // Search in factual content
  const search = params.get('search');
  if (search) {
    conditions.push(sql`${memories.factualContent} ILIKE ${'%' + search + '%'}`);
  }

  // Sorting
  const sortBy = params.get('sort') ?? 'importance';
  const sortDir = params.get('dir') ?? 'desc';
  const orderFn = sortDir === 'asc' ? asc : desc;
  const sortColumn = sortBy === 'createdAt' ? memories.createdAt : memories.importance;

  // Pagination
  const limit = Math.min(parseInt(params.get('limit') ?? '50'), 100);
  const offset = parseInt(params.get('offset') ?? '0');

  const results = await db.select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(orderFn(sortColumn))
    .limit(limit)
    .offset(offset);

  const total = await db.select({ count: sql<number>`count(*)` })
    .from(memories)
    .where(and(...conditions));

  return NextResponse.json({
    data: results,
    pagination: {
      total: total[0].count,
      limit,
      offset,
      hasMore: offset + limit < total[0].count,
    },
  });
}
```

```typescript
// app/api/v1/memories/[id]/route.ts
// Full CRUD for individual memories

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await authenticateAPI(req);
  const body = await req.json();

  // Validate update fields with Zod
  const updateSchema = z.object({
    factualContent: z.string().min(1).optional(),
    emotionalSignificance: z.string().nullable().optional(),
    category: z.enum(['emotional', 'work', 'hobbies', 'relationships', 'preferences']).optional(),
    importance: z.number().int().min(1).max(5).optional(),
    useVerbatim: z.boolean().optional(),
    summaryText: z.string().nullable().optional(),
  });

  const validated = updateSchema.parse(body);

  const updated = await db.update(memories)
    .set({ ...validated, updatedAt: new Date() })
    .where(eq(memories.id, params.id))
    .returning();

  if (!updated.length) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
  }

  return NextResponse.json({ data: updated[0] });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await authenticateAPI(req);

  const deleted = await db.delete(memories)
    .where(eq(memories.id, params.id))
    .returning();

  if (!deleted.length) {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
  }

  return NextResponse.json({ data: { deleted: true, id: params.id } });
}
```

```typescript
// app/api/v1/profiles/route.ts
// Profile management for agents

export async function GET(req: NextRequest) {
  const user = await authenticateAPI(req);

  const userProfiles = await db.select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .orderBy(desc(profiles.isDefault));

  return NextResponse.json({ data: userProfiles });
}

export async function POST(req: NextRequest) {
  const user = await authenticateAPI(req);
  const body = await req.json();

  const createSchema = z.object({
    name: z.string().min(1).max(100),
    platform: z.string().optional(),
    isDefault: z.boolean().default(false),
  });

  const validated = createSchema.parse(body);

  const profile = await db.insert(profiles)
    .values({ ...validated, userId: user.id })
    .returning();

  return NextResponse.json({ data: profile[0] }, { status: 201 });
}
```

**Pros**:
- Full feature parity between UI and API
- Agents can do everything a human can
- Rich filtering enables sophisticated agent workflows
- Pagination for large memory sets
- Consistent JSON responses

**Cons**:
- Significant API surface to build and maintain
- Every UI change needs a corresponding API update
- More endpoints = more security surface to protect

**Effort**: Medium (1-2 days, after API layer exists)
**Risk**: Low

### Solution 2: MCP Tool Definitions for Claude Desktop Integration

**Approach**: Define MCP (Model Context Protocol) tools that Claude Desktop can use directly

**Implementation**:
```typescript
// mcp/ember-tools.ts
// MCP tool definitions for Claude Desktop

export const emberTools = [
  {
    name: 'ember_browse_memories',
    description: 'Browse and filter the user\'s memories in Ember. Can filter by category, importance, date range, and search text.',
    input_schema: {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          items: { type: 'string', enum: ['emotional', 'work', 'hobbies', 'relationships', 'preferences'] },
          description: 'Filter by memory categories',
        },
        minImportance: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          description: 'Minimum importance level (1-5)',
        },
        search: {
          type: 'string',
          description: 'Search text to find in memory content',
        },
        limit: {
          type: 'integer',
          default: 20,
          description: 'Maximum number of memories to return',
        },
      },
    },
  },
  {
    name: 'ember_edit_memory',
    description: 'Edit an existing memory in Ember. Can update factual content, emotional significance, category, or importance.',
    input_schema: {
      type: 'object',
      properties: {
        memoryId: { type: 'string', description: 'ID of the memory to edit' },
        factualContent: { type: 'string', description: 'Updated factual content' },
        emotionalSignificance: { type: 'string', description: 'Updated emotional significance' },
        category: {
          type: 'string',
          enum: ['emotional', 'work', 'hobbies', 'relationships', 'preferences'],
        },
        importance: { type: 'integer', minimum: 1, maximum: 5 },
      },
      required: ['memoryId'],
    },
  },
  {
    name: 'ember_capture',
    description: 'Capture a new conversation into Ember for memory extraction.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Conversation text to capture' },
        profileName: { type: 'string', description: 'Profile to capture to (default if not specified)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'ember_generate_wake_prompt',
    description: 'Generate a wake prompt from selected memory categories.',
    input_schema: {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          items: { type: 'string', enum: ['emotional', 'work', 'hobbies', 'relationships', 'preferences'] },
          description: 'Categories to include in wake prompt',
        },
      },
      required: ['categories'],
    },
  },
];
```

**Pros**:
- Native integration with Claude Desktop
- Tool use is the natural agent interaction pattern
- Structured input/output with validation
- Discoverable via MCP protocol

**Cons**:
- MCP-specific (does not help non-Claude agents)
- Requires MCP server implementation
- Tight coupling to Anthropic's tool use format

**Effort**: Medium (1 day, after API layer exists)
**Risk**: Low

### Solution 3: GraphQL Subscriptions for Real-Time Memory Updates

**Approach**: GraphQL API with subscriptions so agents can watch for new memories in real-time

**Implementation**:
```typescript
// Conceptual - would require GraphQL server setup
const typeDefs = `
  type Query {
    memories(
      profileId: ID!
      categories: [String]
      minImportance: Int
      search: String
      limit: Int
      offset: Int
    ): MemoryConnection!
  }

  type Subscription {
    memoryAdded(profileId: ID!, categories: [String]): Memory!
    captureStatusChanged(captureId: ID!): Capture!
  }

  type Memory {
    id: ID!
    category: String!
    factualContent: String!
    emotionalSignificance: String
    importance: Int!
    verbatimTokens: Int!
  }
`;
```

**Pros**:
- Real-time updates for agents watching memory changes
- Flexible query structure
- Single endpoint for all operations

**Cons**:
- Significant infrastructure overhead (WebSocket support)
- Overkill for MVP
- Adds complexity to Vercel deployment (WebSocket limits)
- Most agents do not support GraphQL subscriptions

**Effort**: High (3-5 days)
**Risk**: HIGH - Over-engineering for MVP

## Recommended Action

**Choose Solution 1 + Solution 2: REST API parity + MCP tools**

Extend the API layer from issue 001 with full CRUD on memories, filtering/sorting/pagination, and profile management endpoints. Then define MCP tools that wrap these API endpoints for Claude Desktop integration. This gives both generic API access and a native Claude experience.

## Technical Details

**Affected Components**:
- `src/app/api/v1/memories/route.ts` (extend with filtering)
- `src/app/api/v1/memories/[id]/route.ts` (PATCH, DELETE)
- `src/app/api/v1/profiles/route.ts` (new)
- `src/app/api/v1/profiles/[id]/route.ts` (new)
- `mcp/ember-tools.ts` (new - MCP tool definitions)
- OpenAPI spec (update with new endpoints)

**Database Changes**: None

## Acceptance Criteria

- [ ] GET /api/v1/memories supports category, importance, date, and search filters
- [ ] GET /api/v1/memories supports sorting by importance or date
- [ ] GET /api/v1/memories supports pagination (limit + offset)
- [ ] PATCH /api/v1/memories/:id updates memory fields
- [ ] DELETE /api/v1/memories/:id deletes a memory
- [ ] GET /api/v1/profiles lists user's profiles
- [ ] POST /api/v1/profiles creates a new profile
- [ ] MCP tool definitions exist for browse, edit, capture, and wake prompt
- [ ] Every UI action has a documented API equivalent

## Work Log

### 2026-02-10
- **Review finding**: Agent-native reviewer identified 12 UI capabilities with no agent equivalents
- **Severity**: Marked as P3 - full agent parity is quality-of-life improvement
- **Dependency**: Requires API layer from issue 001 to exist first
- **Next step**: Extend API endpoints after issue 001 is implemented

## Resources

- [Issue 001](todos/001-pending-p1-no-api-layer-for-agents.md) - Dependency: core API layer
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L192-L210) - Architecture
- [MCP Specification](https://modelcontextprotocol.io/)
- [Drizzle Query Building](https://orm.drizzle.team/docs/select)
