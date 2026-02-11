import { NextRequest } from "next/server";
import { validateBearerToken, requireScope } from "@/lib/api/auth";
import { apiPaginated, apiError } from "@/lib/api/response";
import { db } from "@/lib/db";
import { memories, profiles } from "@/lib/db/schema";
import { eq, and, lt, desc, isNull } from "drizzle-orm";
import { checkApiLimit } from "@/lib/rate-limit";
import { memoriesQuerySchema } from "@/lib/validators/schemas";

export async function GET(request: NextRequest) {
  // Auth
  const authResult = await validateBearerToken(request);
  if (authResult instanceof Response) return authResult;

  const scopeError = requireScope(authResult, "read");
  if (scopeError) return scopeError;

  // API rate limit (per minute)
  const rateLimit = await checkApiLimit(authResult.userId, authResult.tier);
  if (!rateLimit.success) {
    return apiError("RATE_LIMIT_EXCEEDED", "API rate limit exceeded", 429, {
      limit: rateLimit.limit,
      reset: rateLimit.reset,
    });
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const queryInput = {
    profileId: searchParams.get("profileId") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  };

  const validated = memoriesQuerySchema.safeParse(queryInput);
  if (!validated.success) {
    return apiError(
      "VALIDATION_ERROR",
      validated.error.issues[0]?.message ?? "Invalid query parameters",
      422
    );
  }

  const { profileId, category, cursor, limit } = validated.data;

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

  // Build query conditions (exclude soft-deleted)
  const conditions = [
    eq(memories.profileId, profileId),
    isNull(memories.deletedAt),
  ];

  if (category) {
    conditions.push(eq(memories.category, category));
  }

  if (cursor) {
    conditions.push(lt(memories.createdAt, new Date(cursor)));
  }

  // Fetch limit + 1 to determine hasMore
  const results = await db.query.memories.findMany({
    where: and(...conditions),
    orderBy: [desc(memories.createdAt)],
    limit: limit + 1,
  });

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const nextCursor = data.length > 0 ? data[data.length - 1].createdAt.toISOString() : null;

  return apiPaginated(data, {
    cursor: hasMore ? nextCursor : null,
    hasMore,
    rateLimit,
  });
}
