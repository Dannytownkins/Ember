import { NextRequest } from "next/server";
import { validateBearerToken, requireScope } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { db } from "@/lib/db";
import { memories, profiles } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { checkApiLimit } from "@/lib/rate-limit";
import { updateMemorySchema } from "@/lib/validators/schemas";

async function verifyMemoryOwnership(memoryId: string, userId: string) {
  const memory = await db.query.memories.findFirst({
    where: and(eq(memories.id, memoryId), isNull(memories.deletedAt)),
    with: { profile: true },
  });

  if (!memory || memory.profile.userId !== userId) {
    return null;
  }

  return memory;
}

async function checkRate(authResult: { userId: string; tier: import("@/lib/db/schema").UserTier }) {
  const rateLimit = await checkApiLimit(authResult.userId, authResult.tier);
  if (!rateLimit.success) {
    return {
      error: apiError("RATE_LIMIT_EXCEEDED", "API rate limit exceeded", 429, {
        limit: rateLimit.limit,
        reset: rateLimit.reset,
      }),
      rateLimit,
    };
  }
  return { error: null, rateLimit };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateBearerToken(request);
  if (authResult instanceof Response) return authResult;

  const scopeError = requireScope(authResult, "read");
  if (scopeError) return scopeError;

  const { error: rateLimitError, rateLimit } = await checkRate(authResult);
  if (rateLimitError) return rateLimitError;

  const { id } = await params;
  const memory = await verifyMemoryOwnership(id, authResult.userId);

  if (!memory) {
    return apiError("NOT_FOUND", "Memory not found", 404);
  }

  return apiSuccess(memory, { rateLimit });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateBearerToken(request);
  if (authResult instanceof Response) return authResult;

  const scopeError = requireScope(authResult, "write");
  if (scopeError) return scopeError;

  const { error: rateLimitError, rateLimit } = await checkRate(authResult);
  if (rateLimitError) return rateLimitError;

  const { id } = await params;
  const memory = await verifyMemoryOwnership(id, authResult.userId);

  if (!memory) {
    return apiError("NOT_FOUND", "Memory not found", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body", 422);
  }

  const validated = updateMemorySchema.safeParse(body);
  if (!validated.success) {
    return apiError(
      "VALIDATION_ERROR",
      validated.error.issues[0]?.message ?? "Invalid input",
      422
    );
  }

  const [updated] = await db
    .update(memories)
    .set(validated.data)
    .where(eq(memories.id, id))
    .returning();

  return apiSuccess(updated, { rateLimit });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await validateBearerToken(request);
  if (authResult instanceof Response) return authResult;

  const scopeError = requireScope(authResult, "write");
  if (scopeError) return scopeError;

  const { error: rateLimitError, rateLimit } = await checkRate(authResult);
  if (rateLimitError) return rateLimitError;

  const { id } = await params;
  const memory = await verifyMemoryOwnership(id, authResult.userId);

  if (!memory) {
    return apiError("NOT_FOUND", "Memory not found", 404);
  }

  // Soft delete — set deletedAt, don't permanently remove
  await db
    .update(memories)
    .set({ deletedAt: new Date() })
    .where(eq(memories.id, id));

  return apiSuccess({ id, deleted: true, restorable: true }, { rateLimit });
}
