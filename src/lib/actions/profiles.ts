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

export async function updateTokenBudgetAction(
  budget: number
): Promise<ActionState<{ tokenBudget: number }>> {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { status: "error", error: "Not authenticated" };
    }

    if (budget < 2000 || budget > 32000) {
      return { status: "error", error: "Budget must be between 2,000 and 32,000" };
    }

    const user = await ensureUser(clerkId);

    await db
      .update(users)
      .set({ tokenBudget: budget })
      .where(eq(users.id, user.id));

    return { status: "success", data: { tokenBudget: budget } };
  } catch (error) {
    console.error("updateTokenBudgetAction error:", error);
    return { status: "error", error: "Failed to update token budget" };
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
