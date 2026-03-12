# Semantic Search Implementation Spec

**Status:** Planned
**Priority:** High (core feature for v1)
**Author:** Vera, March 12, 2026

## Problem

Current search is full-text only. If a user searches "that conversation about my shoulder" but the memory says "arm pain" or "physical discomfort," it won't match.

## Solution

Vector similarity search using embeddings.

## Technical Requirements

### 1. Database Changes

```sql
-- Enable pgvector extension (Neon supports this)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to memories
ALTER TABLE memories 
ADD COLUMN embedding vector(1536);

-- Create index for fast similarity search
CREATE INDEX idx_memories_embedding 
ON memories USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 2. Embedding Generation

- **When:** During memory extraction (in Inngest process-capture function)
- **What:** Generate embedding from `factualContent + emotionalSignificance`
- **Provider Options:**
  - OpenAI `text-embedding-3-small` (1536 dimensions, cheap)
  - Voyage AI (if we want to stay off OpenAI)
  - Cohere embed-v3

### 3. Search Flow

```
User query
    ↓
Generate query embedding
    ↓
Vector similarity search (cosine distance)
    ↓
Combine with category filters
    ↓
Return ranked results
```

### 4. API Changes

**Updated endpoint:** `GET /api/v1/memories/search`

```typescript
// Request
{
  query: string;           // Search query
  semantic?: boolean;      // Enable semantic search (default: true for pro/founders)
  categories?: string[];   // Filter by category
  limit?: number;          // Max results (default: 10)
  threshold?: number;      // Similarity threshold (0-1, default: 0.7)
}

// Response adds similarity score
{
  memories: Array<Memory & { similarity?: number }>;
  searchType: "semantic" | "fulltext";
}
```

### 5. Tier Gating

- **Free:** Full-text search only
- **Pro/Founders:** Semantic search enabled

## Implementation Steps

1. [ ] Add pgvector extension to Neon database
2. [ ] Add `embedding` column to memories table
3. [ ] Create embedding generation utility (`src/lib/ai/embeddings.ts`)
4. [ ] Update `process-capture` Inngest function to generate embeddings
5. [ ] Update search endpoint to use vector similarity
6. [ ] Add backfill script for existing memories
7. [ ] Update UI to show similarity scores (optional)

## Cost Estimate

- OpenAI embeddings: ~$0.02 per 1M tokens
- Average memory: ~200 tokens
- 1000 memories = ~$0.004
- Negligible at scale

## Notes

- Consider caching query embeddings for repeated searches
- May want to combine semantic + keyword for best results
- Need to handle case where embedding generation fails gracefully

---

*Spec written by Vera. Feature matters because the whole point of Ember is finding context you've forgotten — and you don't always remember the exact words you used.*
