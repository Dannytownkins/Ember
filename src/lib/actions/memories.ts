"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { memories, profiles } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
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

    // Verify memory belongs to user's profile and is not deleted
    const memory = await db.query.memories.findFirst({
      where: and(eq(memories.id, memoryId), isNull(memories.deletedAt)),
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

/**
 * Soft delete a memory — sets deletedAt timestamp.
 * Memory can be restored within 30 days.
 */
export async function deleteMemoryAction(
  memoryId: string
): Promise<ActionState<{ id: string }>> {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { status: "error", error: "Not authenticated" };
    }

    const user = await ensureUser(clerkId);

    // Verify memory belongs to user's profile and is not already deleted
    const memory = await db.query.memories.findFirst({
      where: and(eq(memories.id, memoryId), isNull(memories.deletedAt)),
      with: { profile: true },
    });

    if (!memory || memory.profile.userId !== user.id) {
      return { status: "error", error: "Memory not found" };
    }

    // Soft delete — set deletedAt instead of removing
    await db
      .update(memories)
      .set({ deletedAt: new Date() })
      .where(eq(memories.id, memoryId));

    return { status: "success", data: { id: memoryId } };
  } catch (error) {
    console.error("deleteMemoryAction error:", error);
    return { status: "error", error: "Failed to delete memory" };
  }
}

/**
 * Restore a soft-deleted memory.
 * Only works within the 30-day recovery window.
 */
export async function restoreMemoryAction(
  memoryId: string
): Promise<ActionState<{ id: string }>> {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { status: "error", error: "Not authenticated" };
    }

    const user = await ensureUser(clerkId);

    // Find the soft-deleted memory
    const memory = await db.query.memories.findFirst({
      where: eq(memories.id, memoryId),
      with: { profile: true },
    });

    if (!memory || memory.profile.userId !== user.id) {
      return { status: "error", error: "Memory not found" };
    }

    if (!memory.deletedAt) {
      return { status: "error", error: "Memory is not deleted" };
    }

    // Restore — clear deletedAt
    await db
      .update(memories)
      .set({ deletedAt: null })
      .where(eq(memories.id, memoryId));

    return { status: "success", data: { id: memoryId } };
  } catch (error) {
    console.error("restoreMemoryAction error:", error);
    return { status: "error", error: "Failed to restore memory" };
  }
}
