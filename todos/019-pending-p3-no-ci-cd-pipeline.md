---
status: pending
priority: p3
issue_id: "019"
tags: [code-review, operations, ci-cd, automation]
dependencies: []
---

# Problem Statement

**QUALITY GAP**: No GitHub Actions or deployment automation defined. No automated tests on PR, no lint checks, no type checking in CI. Developers can merge broken code directly to main. No staging environment defined for pre-production validation.

**Why This Matters**: Without CI/CD, every merge is a roll of the dice. A typo in a Drizzle schema migration, a broken import in a Server Action, or a type error in the extraction pipeline all make it to production undetected. At MVP stage this is survivable, but it creates a culture of "deploy and pray" that compounds as the team grows.

## Findings

**Source**: architecture-strategist

**Evidence**:
- No `.github/workflows/` directory or CI configuration in project structure
- No `test` script defined or testing framework referenced in plan
- No lint or type-check automation mentioned
- No staging/preview environment strategy
- Vercel deployment is mentioned (line 227) but no deployment pipeline details

**Impact Severity**: LOW - Quality risk, not a blocker

## Proposed Solutions

### Solution 1: GitHub Actions CI Pipeline (Recommended)

**Approach**: Run lint, typecheck, and tests on every PR

**Implementation**:
```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit

  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm test
    env:
      DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
      CLERK_SECRET_KEY: ${{ secrets.TEST_CLERK_SECRET_KEY }}

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
    env:
      DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.TEST_CLERK_PUB_KEY }}
      CLERK_SECRET_KEY: ${{ secrets.TEST_CLERK_SECRET_KEY }}
```

**Pros**:
- Catches type errors and lint violations before merge
- Build step validates Next.js compilation
- Parallel jobs for speed
- Free for public repos, generous free tier for private

**Cons**:
- Requires managing secrets for test environment
- Adds ~2-3 minutes to PR feedback loop

**Effort**: Medium (1 day)
**Risk**: Low - standard practice

### Solution 2: Vercel Preview Deployments

**Approach**: Leverage Vercel's automatic preview deployments for every PR

**Implementation**:
```json
// vercel.json
{
  "github": {
    "enabled": true,
    "autoAlias": true,
    "silent": false
  },
  "env": {
    "DATABASE_URL": "@neon-preview-database-url",
    "CLERK_SECRET_KEY": "@clerk-test-secret"
  }
}
```

```typescript
// scripts/seed-preview.ts
// Seed preview environment with test data
import { db } from '@/lib/db';
import { users, profiles, memories } from '@/lib/db/schema';

async function seedPreview() {
  const testUser = await db.insert(users).values({
    clerkId: 'test_user_001',
    email: 'test@ember.app',
    captureEmail: 'test@capture.ember.app',
  }).returning();

  const testProfile = await db.insert(profiles).values({
    userId: testUser[0].id,
    name: 'Test Profile',
    isDefault: true,
  }).returning();

  // Seed sample memories across categories
  const sampleMemories = [
    { category: 'work', factualContent: 'Building Ember with Next.js 16 and Drizzle ORM' },
    { category: 'emotional', factualContent: 'Felt accomplished shipping the first feature' },
    { category: 'preferences', factualContent: 'Prefers dark mode, dislikes verbose error messages' },
  ];

  for (const mem of sampleMemories) {
    await db.insert(memories).values({
      profileId: testProfile[0].id,
      category: mem.category,
      factualContent: mem.factualContent,
      verbatimText: mem.factualContent,
      importance: 3,
      verbatimTokens: 20,
      useVerbatim: false,
    });
  }
}
```

**Pros**:
- Zero configuration if already on Vercel
- Live preview URL for every PR
- Stakeholders can review visually

**Cons**:
- Requires separate Neon branch or test database per preview
- Preview environment secrets management
- Does not replace lint/typecheck CI

**Effort**: Low (half day)
**Risk**: Low

### Solution 3: Staging Environment with Seed Data

**Approach**: Dedicated staging environment on a separate Vercel project pointing to a Neon branch

**Implementation**:
```bash
# Create Neon branch for staging
neonctl branches create --project-id $NEON_PROJECT_ID --name staging

# Set up Vercel staging project
vercel link --project ember-staging
vercel env add DATABASE_URL staging
```

```typescript
// drizzle.config.staging.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.STAGING_DATABASE_URL!,
  },
});
```

**Pros**:
- Full production-like environment for testing
- Neon branches are cheap and fast to create
- Seed data makes manual testing consistent

**Cons**:
- Additional infrastructure to maintain
- Neon branch costs (minimal on free tier)
- Must keep staging in sync with production schema

**Effort**: Medium (1 day)
**Risk**: Low

## Recommended Action

**Choose Solution 1: GitHub Actions CI Pipeline**

Start with automated lint, typecheck, and build on every PR. This catches the most common issues with minimal setup. Add Vercel preview deployments as a bonus for visual review. Defer dedicated staging until the team grows beyond 1-2 developers.

## Technical Details

**Affected Components**:
- `.github/workflows/` (new directory)
- `package.json` (ensure `lint`, `typecheck`, `test`, `build` scripts exist)
- Vercel project settings (preview deployments)
- GitHub repository settings (branch protection rules)

**Database Changes**: None

**New Dependencies**:
```json
{
  "devDependencies": {
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0"
  }
}
```

## Acceptance Criteria

- [ ] GitHub Actions workflow runs on every PR to main
- [ ] Lint step catches ESLint violations and fails the build
- [ ] Type check step catches TypeScript errors and fails the build
- [ ] Test step runs unit tests (once tests exist)
- [ ] Build step validates Next.js compilation
- [ ] Branch protection requires CI to pass before merge
- [ ] Vercel preview deployments generate a live URL per PR

## Work Log

### 2026-02-10
- **Review finding**: Architecture strategist noted absence of CI/CD pipeline
- **Severity**: Marked as P3 - quality improvement, not a blocker for MVP
- **Current state**: Zero automation; all merges go directly to production
- **Next step**: Create GitHub Actions workflow after P1/P2 issues resolved

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L227) - Vercel deployment mention
- [GitHub Actions for Next.js](https://github.com/vercel/next.js/tree/canary/examples/with-github-actions)
- [Vercel Preview Deployments](https://vercel.com/docs/deployments/preview-deployments)
- [Neon Branching](https://neon.tech/docs/introduction/branching)
