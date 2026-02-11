import { NextRequest } from "next/server";
import { validateBearerToken, requireScope } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { db } from "@/lib/db";
import { memories, profiles } from "@/lib/db/schema";
import { eq, and, or, ilike, isNull, desc } from "drizzle-orm";
import { z } from "zod";

const searchQuerySchema = z.object({
  profileId: z.string().uuid(),
  query: z.string().min(1).max(200),
  category: z
    .enum(["emotional", "work", "hobbies", "relationships", "preferences"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /api/v1/memories/search?profileId=...&query=...&category=...&limit=...
 *
 * Full-text search across memories using ILIKE (case-insensitive).
 * Searches factual content, emotional significance, and verbatim text.
 */
export async function GET(request: NextRequest) {
  // Auth
  const authResult = await validateBearerToken(request);
  if (authResult instanceof Response) return authResult;

  const scopeError = requireScope(authResult, "read");
  if (scopeError) return scopeError;

  // Parse query params
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const validated = searchQuerySchema.safeParse(params);

  if (!validated.success) {
    return apiError(
      "VALIDATION_ERROR",
      validated.error.issues[0]?.message ?? "Invalid query parameters",
      422
    );
  }

  const { profileId, query, category, limit } = validated.data;

  // Verify profile belongs to user
  const profile = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      eq(profiles.userId, authResult.userId)
    ),
  });

  if (!profile) {
    return apiError("NOT_FOUND", "Profile not found", 404);
  }

  // Build search pattern
  const searchPattern = `%${query}%`;

  // Build where conditions
  const conditions = [
    eq(memories.profileId, profileId),
    isNull(memories.deletedAt),
    or(
      ilike(memories.factualContent, searchPattern),
      ilike(memories.emotionalSignificance, searchPattern),
      ilike(memories.verbatimText, searchPattern)
    ),
  ];

  if (category) {
    conditions.push(eq(memories.category, category));
  }

  const results = await db
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.importance), desc(memories.createdAt))
    .limit(limit);

  return apiSuccess({
    query,
    category: category ?? null,
    count: results.length,
    memories: results.map((m) => ({
      id: m.id,
      category: m.category,
      factualContent: m.factualContent,
      emotionalSignificance: m.emotionalSignificance,
      verbatimText: m.verbatimText,
      importance: m.importance,
      createdAt: m.createdAt,
    })),
  });
}
