import { db } from "./index";
import { users, profiles, captures, memories } from "./schema";
import { eq, isNull, and, lt } from "drizzle-orm";

/**
 * Soft delete helpers for Ember.
 *
 * Instead of permanently deleting records, we set a `deletedAt` timestamp.
 * Records are hidden from queries by default but can be restored within 30 days.
 * After 30 days, a purge job permanently removes them.
 */

// ─── Soft Delete Operations ─────────────────────────────

export async function softDeleteMemory(memoryId: string) {
  return db
    .update(memories)
    .set({ deletedAt: new Date() })
    .where(and(eq(memories.id, memoryId), isNull(memories.deletedAt)))
    .returning();
}

export async function softDeleteCapture(captureId: string) {
  // Soft delete the capture and all its memories
  const now = new Date();

  await db
    .update(memories)
    .set({ deletedAt: now })
    .where(and(eq(memories.captureId, captureId), isNull(memories.deletedAt)));

  return db
    .update(captures)
    .set({ deletedAt: now })
    .where(and(eq(captures.id, captureId), isNull(captures.deletedAt)))
    .returning();
}

export async function softDeleteProfile(profileId: string) {
  const now = new Date();

  // Cascade soft delete to memories and captures
  await db
    .update(memories)
    .set({ deletedAt: now })
    .where(and(eq(memories.profileId, profileId), isNull(memories.deletedAt)));

  await db
    .update(captures)
    .set({ deletedAt: now })
    .where(
      and(eq(captures.profileId, profileId), isNull(captures.deletedAt))
    );

  return db
    .update(profiles)
    .set({ deletedAt: now })
    .where(and(eq(profiles.id, profileId), isNull(profiles.deletedAt)))
    .returning();
}

export async function softDeleteUser(userId: string) {
  const now = new Date();

  // Get all profiles for cascading
  const userProfiles = await db.query.profiles.findMany({
    where: and(eq(profiles.userId, userId), isNull(profiles.deletedAt)),
  });

  const profileIds = userProfiles.map((p) => p.id);

  // Cascade soft delete through the hierarchy
  for (const profileId of profileIds) {
    await db
      .update(memories)
      .set({ deletedAt: now })
      .where(
        and(eq(memories.profileId, profileId), isNull(memories.deletedAt))
      );

    await db
      .update(captures)
      .set({ deletedAt: now })
      .where(
        and(eq(captures.profileId, profileId), isNull(captures.deletedAt))
      );
  }

  await db
    .update(profiles)
    .set({ deletedAt: now })
    .where(and(eq(profiles.userId, userId), isNull(profiles.deletedAt)));

  return db
    .update(users)
    .set({ deletedAt: now })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning();
}

// ─── Restore Operations ─────────────────────────────────

export async function restoreMemory(memoryId: string) {
  return db
    .update(memories)
    .set({ deletedAt: null })
    .where(eq(memories.id, memoryId))
    .returning();
}

export async function restoreCapture(captureId: string) {
  // Restore the capture and all its memories
  await db
    .update(memories)
    .set({ deletedAt: null })
    .where(eq(memories.captureId, captureId));

  return db
    .update(captures)
    .set({ deletedAt: null })
    .where(eq(captures.id, captureId))
    .returning();
}

// ─── Purge (Permanent Delete after 30 days) ─────────────

const PURGE_DAYS = 30;

export async function purgeExpiredRecords() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PURGE_DAYS);

  // Delete in reverse dependency order
  const deletedMemories = await db
    .delete(memories)
    .where(lt(memories.deletedAt, cutoff))
    .returning({ id: memories.id });

  const deletedCaptures = await db
    .delete(captures)
    .where(lt(captures.deletedAt, cutoff))
    .returning({ id: captures.id });

  const deletedProfiles = await db
    .delete(profiles)
    .where(lt(profiles.deletedAt, cutoff))
    .returning({ id: profiles.id });

  const deletedUsers = await db
    .delete(users)
    .where(lt(users.deletedAt, cutoff))
    .returning({ id: users.id });

  return {
    purged: {
      memories: deletedMemories.length,
      captures: deletedCaptures.length,
      profiles: deletedProfiles.length,
      users: deletedUsers.length,
    },
    cutoffDate: cutoff.toISOString(),
  };
}
