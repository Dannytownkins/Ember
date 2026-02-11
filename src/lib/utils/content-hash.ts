import { createHash } from "crypto";

/**
 * Generate a deterministic hash for memory content.
 * Used for deduplication — if two memories have the same hash,
 * they're duplicates (or near-duplicates).
 *
 * Hash is based on normalized factual content + category.
 * We normalize whitespace and case to catch near-duplicates.
 */
export function generateContentHash(
  factualContent: string,
  category: string
): string {
  const normalized = [
    factualContent.toLowerCase().trim().replace(/\s+/g, " "),
    category,
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
