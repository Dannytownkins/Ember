---
status: pending
priority: p2
issue_id: "014"
tags: [code-review, data-integrity, deduplication, quality]
dependencies: []
---

# Problem Statement

**NO DEDUPLICATION STRATEGY**: The same conversation captured twice creates duplicate memories with no detection, merge, or prevention mechanism. Users who screenshot the same chat, capture overlapping conversation segments, or accidentally paste the same text get duplicate memories polluting their memory bank. The plan explicitly defers this: "contentHash dedup — accept duplicates for now. Users can delete." (line 281). This creates compounding problems: duplicate memories waste token budget in wake prompts, degrade compression quality, and erode user trust when they see the same memory repeated.

**Why This Matters**: Screenshot capture is the MVP's primary mobile flow. Users will naturally take overlapping screenshots of the same conversation. If a user captures 5 screenshots with 60% overlap, the extraction pipeline runs independently on each, producing near-identical memories. Over time, a user's memory bank fills with duplicates that consume token budget, making wake prompts less useful. The "users can delete" strategy fails because users won't manually scan hundreds of memories for duplicates.

## Findings

**Source**: code-review, architecture-strategist

**Evidence**:
- Plan line 281 explicitly defers dedup: "contentHash dedup — accept duplicates for now"
- Multi-screenshot handling (plan lines 57-60) mentions dedup "between screenshots" in a single capture, but NOT across separate captures
- No `contentHash` column in schema despite being mentioned as future work
- No similarity detection infrastructure
- No merge workflow in any UI spec
- Wake prompt generator packs by importance — duplicates with same importance both included, wasting budget
- Extraction pipeline runs independently per capture — no cross-capture awareness

**Duplication Scenarios**:

**Scenario 1: Overlapping Screenshots**
```
Capture 1: Screenshots of messages 1-15
Capture 2: Screenshots of messages 10-20 (overlapping messages 10-15)

Result: Messages 10-15 extracted twice
  → 2x memories for same content
  → 2x token cost in wake prompt
  → User confused by repeated memories
```

**Scenario 2: Accidental Re-capture**
```
User pastes same conversation text twice (forgot they already captured it)
Extraction runs independently both times
Result: Exact duplicate memories with different UUIDs
```

**Scenario 3: Cross-Platform Duplication**
```
User captures same conversation via screenshot on phone
Later captures same conversation via paste on desktop
Different capture methods → different raw text → slightly different extraction
Result: Near-duplicate memories that are not byte-identical
```

**Impact Severity**: 🟡 MODERATE - Data quality degradation, wasted token budget, poor user experience

## Proposed Solutions

### Solution 1: Content Hash on Capture for Exact Duplicate Detection (Recommended)

**Approach**: Hash the extracted content at capture time. Reject exact duplicates, flag near-duplicates for user review.

**Implementation**:
```typescript
// src/lib/capture/dedup.ts
import { createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { memories } from '@/lib/db/schema';

/**
 * Generate a normalized content hash for deduplication.
 * Normalizes whitespace, case, and punctuation before hashing
 * to catch copies with minor formatting differences.
 */
export function generateContentHash(content: string): string {
  const normalized = content
    .toLowerCase()
    .replace(/\s+/g, ' ')       // Collapse whitespace
    .replace(/[^\w\s]/g, '')     // Remove punctuation
    .trim();

  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Check for duplicate memories before insertion.
 * Returns existing memory if exact duplicate found.
 */
export async function checkForDuplicates(
  db: Database,
  profileId: string,
  factualContent: string,
  category: string
): Promise<{
  isDuplicate: boolean;
  existingMemory?: typeof memories.$inferSelect;
  similarity?: number;
}> {
  const hash = generateContentHash(factualContent);

  // Check for exact hash match
  const existing = await db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.profileId, profileId),
        eq(memories.contentHash, hash)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return { isDuplicate: true, existingMemory: existing[0], similarity: 1.0 };
  }

  return { isDuplicate: false };
}

/**
 * Wraps the extraction pipeline to skip duplicates
 * and merge metadata from new captures into existing memories.
 */
export async function insertMemoryWithDedup(
  db: Database,
  profileId: string,
  newMemory: NewMemory
): Promise<{ action: 'inserted' | 'skipped' | 'merged'; memoryId: string }> {
  const { isDuplicate, existingMemory } = await checkForDuplicates(
    db,
    profileId,
    newMemory.factualContent,
    newMemory.category
  );

  if (isDuplicate && existingMemory) {
    // Merge: keep higher importance, update if new capture has better data
    if (newMemory.importance > existingMemory.importance) {
      await db
        .update(memories)
        .set({
          importance: newMemory.importance,
          emotionalSignificance:
            newMemory.emotionalSignificance ?? existingMemory.emotionalSignificance,
          updatedAt: new Date(),
        })
        .where(eq(memories.id, existingMemory.id));

      return { action: 'merged', memoryId: existingMemory.id };
    }

    return { action: 'skipped', memoryId: existingMemory.id };
  }

  // No duplicate — insert normally
  const hash = generateContentHash(newMemory.factualContent);
  const [inserted] = await db
    .insert(memories)
    .values({ ...newMemory, contentHash: hash })
    .returning({ id: memories.id });

  return { action: 'inserted', memoryId: inserted.id };
}
```

**Schema Migration**:
```typescript
// drizzle/migrations/00X-add-content-hash.ts
import { sql } from 'drizzle-orm';

export async function up(db: Database) {
  await db.execute(sql`
    ALTER TABLE memories ADD COLUMN content_hash TEXT;

    -- Backfill existing memories
    -- (run as a separate script for large datasets)

    CREATE INDEX idx_memories_profile_hash
      ON memories(profile_id, content_hash);
  `);
}
```

**Pros**:
- Fast — hash comparison is O(1)
- Catches exact duplicates reliably
- Minimal overhead per capture
- Merge strategy preserves best metadata
- Backfill-compatible for existing data

**Cons**:
- Only catches exact duplicates (after normalization)
- Near-duplicates (different wording, same meaning) slip through
- Hash collision theoretically possible (SHA-256 = negligible risk)

**Effort**: Medium (1 day)
**Risk**: Low - additive change, no breaking modifications

### Solution 2: Embedding-Based Similarity Detection for Near-Duplicates

**Approach**: Generate text embeddings for each memory and use cosine similarity to detect near-duplicates across captures.

**Implementation**:
```typescript
// src/lib/capture/similarity.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

/**
 * Generate embedding for memory content.
 * Uses a lightweight model for cost efficiency.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Note: Using a dedicated embedding model (e.g., voyage-3)
  // Claude doesn't have a native embedding endpoint, so use Voyage AI
  // or compute similarity via Claude prompt
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'voyage-3-lite',
      input: text,
      input_type: 'document',
    }),
  });

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Find near-duplicate memories using cosine similarity.
 * Returns memories with similarity above threshold.
 */
export async function findNearDuplicates(
  db: Database,
  profileId: string,
  newContent: string,
  threshold: number = 0.92
): Promise<{
  duplicates: Array<{
    memory: typeof memories.$inferSelect;
    similarity: number;
  }>;
}> {
  const newEmbedding = await generateEmbedding(newContent);

  // Fetch recent memories for comparison (limit scope for performance)
  const recentMemories = await db
    .select()
    .from(memories)
    .where(eq(memories.profileId, profileId))
    .orderBy(desc(memories.createdAt))
    .limit(200); // Compare against last 200 memories

  const duplicates = [];

  for (const memory of recentMemories) {
    if (!memory.embedding) continue;

    const similarity = cosineSimilarity(
      newEmbedding,
      JSON.parse(memory.embedding)
    );

    if (similarity >= threshold) {
      duplicates.push({ memory, similarity });
    }
  }

  return {
    duplicates: duplicates.sort((a, b) => b.similarity - a.similarity),
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**Pros**:
- Catches semantic duplicates (different wording, same meaning)
- Cross-capture awareness (screenshot + paste of same conversation)
- Foundation for future semantic search features
- Handles paraphrased content

**Cons**:
- Requires embedding model (additional API cost ~$0.0001/memory)
- Adds latency to capture pipeline (~200ms per embedding)
- New dependency (Voyage AI or similar)
- Embedding storage increases DB size
- Pairwise comparison doesn't scale beyond ~1000 memories without pgvector

**Effort**: Medium (2 days)
**Risk**: Medium - new dependency, additional API cost, scaling concerns

### Solution 3: User-Facing "Merge Memories" UI with Suggested Duplicates

**Approach**: Run periodic duplicate detection and present users with a review interface to merge, keep, or dismiss suggested duplicates.

**Implementation**:
```tsx
// src/app/(dashboard)/memories/duplicates/page.tsx
import { findDuplicateGroups } from '@/lib/capture/dedup';
import { DuplicateReviewCard } from '@/components/memories/duplicate-review-card';

export default async function DuplicatesPage() {
  const session = await auth();
  const profile = await getDefaultProfile(session.userId);
  const duplicateGroups = await findDuplicateGroups(db, profile.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Review Duplicates</h1>
        <p className="text-zinc-400 mt-1">
          We found {duplicateGroups.length} groups of similar memories.
          Choose which to keep, merge, or dismiss.
        </p>
      </div>

      {duplicateGroups.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          No duplicates found. Your memory bank is clean.
        </div>
      ) : (
        duplicateGroups.map(group => (
          <DuplicateReviewCard key={group.id} group={group} />
        ))
      )}
    </div>
  );
}
```

**Merge Action**:
```typescript
// src/lib/actions/merge-memories.ts
'use server';

import { auth } from '@clerk/nextjs/server';
import { eq, inArray } from 'drizzle-orm';
import { memories } from '@/lib/db/schema';
import { revalidatePath } from 'next/cache';

export async function mergeMemoriesAction(
  keepId: string,
  mergeIds: string[]
): Promise<ActionState<{ mergedCount: number }>> {
  const session = await auth();
  if (!session?.userId) {
    return { status: 'error', error: 'Unauthorized' };
  }

  // Verify ownership of all memories
  const allIds = [keepId, ...mergeIds];
  const ownedMemories = await db
    .select()
    .from(memories)
    .where(inArray(memories.id, allIds));

  if (ownedMemories.length !== allIds.length) {
    return { status: 'error', error: 'Memory not found' };
  }

  const keepMemory = ownedMemories.find(m => m.id === keepId);
  if (!keepMemory) {
    return { status: 'error', error: 'Keep target not found' };
  }

  // Merge: take highest importance, combine emotional significance
  const maxImportance = Math.max(
    ...ownedMemories.map(m => m.importance)
  );

  const combinedEmotional = ownedMemories
    .map(m => m.emotionalSignificance)
    .filter(Boolean)
    .join(' ');

  await db.transaction(async (tx) => {
    // Update the kept memory with merged data
    await tx
      .update(memories)
      .set({
        importance: maxImportance,
        emotionalSignificance: combinedEmotional || keepMemory.emotionalSignificance,
        updatedAt: new Date(),
      })
      .where(eq(memories.id, keepId));

    // Delete the merged duplicates
    await tx
      .delete(memories)
      .where(inArray(memories.id, mergeIds));
  });

  revalidatePath('/memories');

  return {
    status: 'success',
    data: { mergedCount: mergeIds.length },
  };
}
```

**Pros**:
- User stays in control of merge decisions
- No accidental data loss from aggressive auto-dedup
- Can handle nuanced cases (same event, different perspectives)
- Educational — users learn how capture overlap works

**Cons**:
- Requires user action (won't self-clean)
- Additional UI complexity
- Detection still needs hash or embedding to find candidates
- Users may ignore the review queue

**Effort**: Medium (2 days)
**Risk**: Low - additive feature, user-controlled

## Recommended Action

**Choose Solution 1: Content Hash on Capture, then layer Solution 3**

Start with content hashing for immediate exact-duplicate prevention. This is cheap, fast, and catches the most common case (accidental re-capture). Add the user-facing merge UI in a follow-up to handle near-duplicates that slip through. Defer embedding-based similarity (Solution 2) until user volume justifies the cost and complexity — it also builds toward the "embedding vectors" item on the future roadmap (plan line 607).

## Technical Details

**Affected Components**:
- `src/lib/db/schema.ts` — add `contentHash` column to memories table
- `src/lib/capture/` — add dedup module, integrate into extraction pipeline
- `src/lib/ai/extraction.ts` — wrap memory insertion with dedup check
- `src/app/(dashboard)/memories/` — future duplicate review page

**Database Changes**:
```sql
-- Add content hash column for deduplication
ALTER TABLE memories ADD COLUMN content_hash TEXT;

-- Index for fast duplicate lookups
CREATE INDEX idx_memories_dedup
  ON memories(profile_id, content_hash);

-- Future: embedding column for semantic similarity
-- ALTER TABLE memories ADD COLUMN embedding vector(1024);
-- CREATE INDEX idx_memories_embedding ON memories
--   USING ivfflat (embedding vector_cosine_ops);
```

## Acceptance Criteria

- [ ] Content hash generated for every new memory on insertion
- [ ] Exact duplicate memories (same profile, same hash) are rejected or merged
- [ ] Capture result shows "X new memories, Y duplicates skipped"
- [ ] Existing memories backfilled with content hashes (migration script)
- [ ] Normalization handles whitespace, case, and punctuation differences
- [ ] Merge preserves highest importance score and combines emotional significance
- [ ] Unit tests cover: exact duplicate, whitespace-only difference, different content, cross-capture overlap
- [ ] No performance regression on capture pipeline (hash adds <5ms)

## Work Log

### 2026-02-10
- **Review finding**: Code review identified missing deduplication strategy
- **Severity**: Marked as P2 MODERATE - data quality degradation over time
- **Plan acknowledgment**: Line 281 explicitly defers this ("accept duplicates for now")
- **Key risk**: Screenshot capture flow inherently produces overlapping content
- **Next step**: Add contentHash column and dedup check to extraction pipeline

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L281) - Dedup deferral
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L57-L60) - Multi-screenshot dedup
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L607) - Future: embedding vectors
- [Voyage AI Embeddings](https://docs.voyageai.com/docs/embeddings) - Embedding model for similarity
- [pgvector](https://github.com/pgvector/pgvector) - PostgreSQL vector similarity extension
- [Neon pgvector Support](https://neon.tech/docs/extensions/pgvector) - Vector search on Neon
