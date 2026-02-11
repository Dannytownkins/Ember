import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { captures, memories } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const capture = await db.query.captures.findFirst({
    where: eq(captures.id, id),
  });

  if (!capture) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Capture not found" } },
      { status: 404 }
    );
  }

  let memoryCount = 0;
  if (capture.status === "completed") {
    const [result] = await db
      .select({ count: count() })
      .from(memories)
      .where(eq(memories.captureId, id));
    memoryCount = result?.count ?? 0;
  }

  return NextResponse.json({
    data: {
      id: capture.id,
      status: capture.status,
      memoryCount,
      errorMessage: capture.errorMessage,
      createdAt: capture.createdAt,
    },
  });
}
