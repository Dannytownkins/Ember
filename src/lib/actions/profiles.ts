"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, profiles, type User, type Profile } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ActionState } from "@/lib/validators/schemas";

/**
 * Ensure user exists in DB. Creates inline if Clerk webhook hasn't fired yet.
 * This is the "just-in-time creation fallback" from the PRD.
 */
export async function ensureUser(clerkId: string): Promise<User> {
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (existing) return existing;

  // Webhook hasn't fired yet — create user inline
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error("No email found for user");
  }

  const [newUser] = await db
    .insert(users)
    .values({
      clerkId,
      email,
    })
    .returning();

  // Create default profile
  await db.insert(profiles).values({
    userId: newUser.id,
    name: "Default",
    isDefault: true,
  });

  return newUser;
}

export async function getProfilesAction(): Promise<
  ActionState<Profile[]>
> {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { status: "error", error: "Not authenticated" };
    }

    const user = await ensureUser(clerkId);

    const userProfiles = await db.query.profiles.findMany({
      where: eq(profiles.userId, user.id),
      orderBy: (profiles, { desc }) => [desc(profiles.isDefault)],
    });

    return { status: "success", data: userProfiles };
  } catch (error) {
    console.error("getProfilesAction error:", error);
    return { status: "error", error: "Failed to load profiles" };
  }
}

export async function getDefaultProfileAction(): Promise<
  ActionState<Profile>
> {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { status: "error", error: "Not authenticated" };
    }

    const user = await ensureUser(clerkId);

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, user.id),
      orderBy: (profiles, { desc }) => [desc(profiles.isDefault)],
    });

    if (!profile) {
      return { status: "error", error: "No profile found" };
    }

    return { status: "success", data: profile };
  } catch (error) {
    console.error("getDefaultProfileAction error:", error);
    return { status: "error", error: "Failed to load profile" };
  }
}
