/**
 * Embedding generation for semantic search
 *
 * Uses OpenAI's text-embedding-3-small model (1536 dimensions)
 * Cost: ~$0.02 per 1M tokens (negligible)
 */

import OpenAI from "openai";

// Lazy initialization to avoid errors if OPENAI_API_KEY not set
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured for embeddings");
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
}

/**
 * Generate an embedding for a single text
 */
export async function generateEmbedding(
  text: string
): Promise<EmbeddingResult> {
  const client = getOpenAI();

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text.trim(),
    dimensions: 1536,
  });

  return {
    embedding: response.data[0].embedding,
    tokens: response.usage.total_tokens,
  };
}

/**
 * Generate embeddings for multiple texts (batched)
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<EmbeddingResult[]> {
  if (texts.length === 0) return [];

  const client = getOpenAI();

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts.map((t) => t.trim()),
    dimensions: 1536,
  });

  // OpenAI returns embeddings in same order as input
  return response.data.map((item, index) => ({
    embedding: item.embedding,
    tokens: Math.ceil(response.usage.total_tokens / texts.length), // Approximate per-text
  }));
}

/**
 * Create embedding text from memory content
 * Combines factual content and emotional significance for richer semantic matching
 */
export function createMemoryEmbeddingText(
  factualContent: string,
  emotionalSignificance: string | null
): string {
  const parts = [factualContent];
  if (emotionalSignificance) {
    parts.push(`Emotional context: ${emotionalSignificance}`);
  }
  return parts.join("\n\n");
}

/**
 * Compute cosine similarity between two embeddings
 * Returns value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have same dimensions");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}
