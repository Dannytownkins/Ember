"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { memories, profiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ensureUser } from "./profiles";
import { updateMemorySchema, type ActionState } from "@/lib/validators/schemas";

export async function updateMemoryAction(
  memoryId: string,
  input: unknown
): Promise<ActionState<{ id: string }>> {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { status: "error", error: "Not authenticated" };
    }

    const validated = updateMemorySchema.safeParse(input);
    if (!validated.success) {
      return {
        status: "error",
        error: validated.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const user = await ensureUser(clerkId);

    // Verify memory belongs to user's profile
    const memory = await db.query.memories.findFirst({
      where: eq(memories.id, memoryId),
      with: { profile: true },
    });

    if (!memory || memory.profile.userId !== user.id) {
      return { status: "error", error: "Memory not found" };
    }

    await db
      .update(memories)
      .set(validated.data)
      .where(eq(memories.id, memoryId));

    return { status: "success", data: { id: memoryId } };
  } catch (error) {
    console.error("updateMemoryAction error:", error);
    return { status: "error", error: "Failed to update memory" };
  }
}

export async function deleteMemoryAction(
  memoryId: string
): Promise<ActionState<{ id: string }>> {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { status: "error", error: "Not authenticated" };
    }

    const user = await ensureUser(clerkId);

    // Verify memory belongs to user's profile
    const memory = await db.query.memories.findFirst({
      where: eq(memories.id, memoryId),
      with: { profile: true },
    });

    if (!memory || memory.profile.userId !== user.id) {
      return { status: "error", error: "Memory not found" };
    }

    await db.delete(memories).where(eq(memories.id, memoryId));

    return { status: "success", data: { id: memoryId } };
  } catch (error) {
    console.error("deleteMemoryAction error:", error);
    return { status: "error", error: "Failed to delete memory" };
  }
}
