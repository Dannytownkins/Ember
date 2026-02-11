---
status: pending
priority: p2
issue_id: "015"
tags: [code-review, architecture, api, versioning]
dependencies: []
---

# Problem Statement

**NO API VERSIONING STRATEGY**: The plan references `/api/v1/` in the architecture (line 199) and mentions "API access (when available)" as a paid tier feature (line 572), but defines zero strategy for breaking changes, deprecation timelines, version sunset, or backward compatibility. Once third-party agents and browser extensions depend on the Ember API, any schema change — renaming a field, changing a response structure, modifying authentication — could silently break integrations with no warning. There is no contract testing, no changelog, no deprecation policy.

**Why This Matters**: Ember's roadmap includes a browser extension (Phase 4), ChatGPT Plugin integration, and API access for paid users. These are all external consumers that cannot be updated atomically with the server. A single breaking change to the memories endpoint response shape could break every active browser extension installation simultaneously. Without versioning, the only options are "never change the API" or "break all clients."

## Findings

**Source**: architecture-strategist, code-review

**Evidence**:
- Plan line 199 shows `api/` directory in structure but no versioning subdirectories
- "API access (when available)" listed as paid feature (line 572) with no design
- No mention of API contracts, OpenAPI spec, or schema versioning
- No changelog or migration guide mentioned
- Browser extension (Phase 4) will be an API consumer — no compatibility strategy
- ChatGPT Plugin integration (future roadmap, line 602) requires stable API surface
- Server Actions used for web mutations (line 645) — different contract than REST API

**Risk Timeline**:
```
Phase 1: No API → No risk (Server Actions only)
Phase 2: Still no API → Low risk
Phase 3: API access for paid users → RISK STARTS
Phase 4: Browser extension → RISK MULTIPLIES
Future: ChatGPT Plugin → RISK CRITICAL
```

**Impact Severity**: 🟡 MODERATE - No immediate risk, but costly to retrofit later

## Proposed Solutions

### Solution 1: URL-Based Versioning with Deprecation Policy (Recommended)

**Approach**: Version the API via URL path (`/api/v1/`, `/api/v2/`) with a documented deprecation window and sunset headers.

**Implementation**:
```typescript
// src/app/api/v1/memories/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { memories } from '@/lib/db/schema';
import { withApiVersion } from '@/lib/api/versioning';

// V1 response shape — this is the contract
interface V1MemoryResponse {
  id: string;
  category: string;
  factualContent: string;
  emotionalSignificance: string | null;
  importance: number;
  createdAt: string;
}

export const GET = withApiVersion('v1', async (req: NextRequest) => {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await getDefaultProfile(session.userId);
  const userMemories = await db
    .select()
    .from(memories)
    .where(eq(memories.profileId, profile.id));

  // Transform to V1 contract shape
  const response: V1MemoryResponse[] = userMemories.map(m => ({
    id: m.id,
    category: m.category,
    factualContent: m.factualContent,
    emotionalSignificance: m.emotionalSignificance,
    importance: m.importance,
    createdAt: m.createdAt.toISOString(),
  }));

  return NextResponse.json({ data: response, version: 'v1' });
});
```

**Versioning Middleware**:
```typescript
// src/lib/api/versioning.ts
import { NextRequest, NextResponse } from 'next/server';

interface VersionConfig {
  version: string;
  status: 'active' | 'deprecated' | 'sunset';
  sunsetDate?: string; // ISO date
  successor?: string;  // e.g., 'v2'
}

const VERSION_REGISTRY: Record<string, VersionConfig> = {
  v1: { version: 'v1', status: 'active' },
  // Future:
  // v2: { version: 'v2', status: 'active' },
  // v1: { version: 'v1', status: 'deprecated', sunsetDate: '2027-06-01', successor: 'v2' },
};

/**
 * Wraps an API route handler with version-aware headers.
 * Adds deprecation warnings, sunset dates, and version metadata.
 */
export function withApiVersion(
  version: string,
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const config = VERSION_REGISTRY[version];

    if (!config) {
      return NextResponse.json(
        { error: `API version '${version}' does not exist` },
        { status: 404 }
      );
    }

    if (config.status === 'sunset') {
      return NextResponse.json(
        {
          error: `API version '${version}' has been sunset. Use '${config.successor}'.`,
          migration: `https://docs.ember.app/api/migration/${version}-to-${config.successor}`,
        },
        { status: 410 } // Gone
      );
    }

    const response = await handler(req);

    // Add version headers
    response.headers.set('X-API-Version', version);

    if (config.status === 'deprecated') {
      response.headers.set('Deprecation', 'true');
      response.headers.set(
        'Sunset',
        new Date(config.sunsetDate!).toUTCString()
      );
      response.headers.set(
        'Link',
        `<https://docs.ember.app/api/migration/${version}-to-${config.successor}>; rel="successor-version"`
      );
    }

    return response;
  };
}
```

**Deprecation Policy Document**:
```markdown
## Ember API Deprecation Policy

1. **Active**: Fully supported, receiving new features.
2. **Deprecated**: Still functional, but no new features.
   - Minimum 6-month deprecation window.
   - `Deprecation: true` header on all responses.
   - `Sunset` header with exact sunset date.
   - Migration guide published.
3. **Sunset**: Returns 410 Gone with migration URL.
   - All requests fail with clear error message.
   - Data accessible via newer API version.
```

**Pros**:
- Simple, widely understood pattern
- Easy to implement in Next.js App Router (directory-based routing)
- Clear migration path for consumers
- Sunset headers follow HTTP standards (RFC 8594)
- No client-side complexity — just change the URL

**Cons**:
- URL pollution over time (/v1/, /v2/, /v3/...)
- Must maintain multiple route directories simultaneously
- Cross-version code duplication if not carefully abstracted

**Effort**: Low (half day for initial structure, ongoing maintenance per version)
**Risk**: Low - industry standard, well-understood tradeoffs

### Solution 2: Header-Based Versioning

**Approach**: Version via `Accept` header (`Accept: application/vnd.ember.v1+json`), keeping URLs clean.

**Implementation**:
```typescript
// src/app/api/memories/route.ts
import { NextRequest, NextResponse } from 'next/server';

const VERSION_HANDLERS: Record<string, (req: NextRequest) => Promise<NextResponse>> = {
  v1: handleV1Memories,
  v2: handleV2Memories,
};

export async function GET(req: NextRequest) {
  const accept = req.headers.get('accept') ?? '';
  const versionMatch = accept.match(/application\/vnd\.ember\.(v\d+)\+json/);
  const version = versionMatch?.[1] ?? 'v1'; // Default to v1

  const handler = VERSION_HANDLERS[version];
  if (!handler) {
    return NextResponse.json(
      { error: `Unsupported API version: ${version}` },
      { status: 406 }
    );
  }

  return handler(req);
}

async function handleV1Memories(req: NextRequest): Promise<NextResponse> {
  // V1 response shape
  // ...
  return NextResponse.json({ data: memories, version: 'v1' });
}

async function handleV2Memories(req: NextRequest): Promise<NextResponse> {
  // V2 response shape (e.g., added fields, restructured)
  // ...
  return NextResponse.json({ data: memories, version: 'v2' });
}
```

**Pros**:
- Clean URLs (no /v1/, /v2/ clutter)
- More RESTful (content negotiation)
- Single route file per resource

**Cons**:
- Less discoverable — version is hidden in headers
- Harder to test in browser (need tools like curl or Postman)
- Proxy/CDN caching complications (must vary on Accept header)
- More complex client implementation

**Effort**: Low (half day)
**Risk**: Low-Medium - less conventional, may confuse extension developers

### Solution 3: GraphQL with Field-Level Deprecation

**Approach**: Replace REST endpoints with GraphQL, enabling clients to request exactly the fields they need. Deprecated fields are annotated, not removed.

**Implementation**:
```typescript
// src/app/api/graphql/route.ts
import { createYoga, createSchema } from 'graphql-yoga';

const schema = createSchema({
  typeDefs: `
    type Memory {
      id: ID!
      category: String!
      factualContent: String!
      emotionalSignificance: String

      # V1 field — use 'importance' instead
      importanceScore: Int @deprecated(reason: "Use 'importance' field instead")

      importance: Int!
      createdAt: String!

      # V2 additions
      emotionalWeight: Float
      contentHash: String
    }

    type Query {
      memories(
        profileId: ID!
        category: String
        limit: Int = 50
      ): [Memory!]!

      # Deprecated query — use 'memories' with category filter
      memoriesByCategory(
        profileId: ID!
        category: String!
      ): [Memory!]! @deprecated(reason: "Use 'memories' with category parameter")
    }

    type Mutation {
      createCapture(input: CreateCaptureInput!): Capture!
      mergeMemories(keepId: ID!, mergeIds: [ID!]!): Memory!
    }

    input CreateCaptureInput {
      method: CaptureMethod!
      rawText: String
      imageUrls: [String!]
    }

    enum CaptureMethod {
      PASTE
      SCREENSHOT
      EMAIL
    }
  `,
  resolvers: {
    Query: {
      memories: async (_, args, context) => {
        const session = await auth();
        // Resolve memories with optional category filter
      },
    },
  },
});

const { handleRequest } = createYoga({
  schema,
  graphqlEndpoint: '/api/graphql',
  fetchAPI: { Response },
});

export { handleRequest as GET, handleRequest as POST };
```

**Pros**:
- Clients request only needed fields — no over-fetching
- Field-level deprecation — old fields coexist with new ones
- Single endpoint — no URL versioning needed
- Introspection gives clients self-documenting API
- Natural fit for browser extension (complex queries)

**Cons**:
- Significant architectural shift from REST
- Learning curve for extension developers
- Overkill for MVP
- Caching more complex (POST-based queries)
- Additional dependency (graphql-yoga or Apollo)

**Effort**: Medium (2-3 days for initial setup)
**Risk**: Medium - architectural shift, may be premature for MVP

## Recommended Action

**Choose Solution 1: URL-Based Versioning with Deprecation Policy**

URL-based versioning is the simplest, most widely understood approach. It maps naturally to Next.js App Router's file-based routing (`/api/v1/memories/route.ts`). Start with a clear versioning structure now — even if v1 is the only version for months — so the pattern is established before external consumers exist. Write the deprecation policy document alongside the first API endpoint. This costs almost nothing today and prevents expensive retrofitting when the browser extension ships.

## Technical Details

**Affected Components**:
- `src/app/api/` — restructure to `src/app/api/v1/`
- `src/lib/api/versioning.ts` — new version middleware
- `src/lib/api/contracts/` — new directory for response type definitions
- Future: `src/app/api/v2/` when breaking changes needed

**Database Changes**:
None — versioning is an API layer concern.

## Acceptance Criteria

- [ ] API routes structured under `/api/v1/` path
- [ ] Version middleware adds `X-API-Version` header to all responses
- [ ] Deprecation headers (`Deprecation`, `Sunset`, `Link`) implemented for future use
- [ ] Sunset version returns 410 Gone with migration URL
- [ ] Response types defined as explicit contracts (TypeScript interfaces)
- [ ] API deprecation policy document written
- [ ] Version registry configuration centralized (easy to add v2)
- [ ] Integration tests verify version headers present on all API responses
- [ ] OpenAPI/Swagger spec generated for v1 (stretch goal)

## Work Log

### 2026-02-10
- **Review finding**: Architecture review identified missing API versioning strategy
- **Severity**: Marked as P2 MODERATE - no immediate risk, expensive to retrofit later
- **Plan gap**: `/api/v1/` referenced (line 199) but no versioning design or deprecation policy
- **Timeline risk**: Browser extension (Phase 4) and ChatGPT Plugin (future) will be first external consumers
- **Next step**: Restructure API routes under /api/v1/ and establish deprecation policy before any external consumers exist

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L199) - API directory structure
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L572) - API access as paid feature
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L602) - ChatGPT Plugin future
- [RFC 8594 - Sunset Header](https://datatracker.ietf.org/doc/html/rfc8594)
- [Stripe API Versioning](https://stripe.com/docs/api/versioning) - Gold standard example
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
