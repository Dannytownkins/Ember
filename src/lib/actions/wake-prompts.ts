"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ensureUser } from "./profiles";
import { generateWakePrompt } from "@/lib/ai/wake-prompt";
import {
  generateWakePromptSchema,
  type ActionState,
} from "@/lib/validators/schemas";
import type { MemoryCategory } from "@/lib/db/schema";

interface WakePromptResult {
  prompt: string;
  tokenCount: number;
  memoryCount: number;
  categories: MemoryCategory[];
}

export async function generateWakePromptAction(
  input: unknown
): Promise<ActionState<WakePromptResult>> {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { status: "error", error: "Not authenticated" };
    }

    const validated = generateWakePromptSchema.safeParse(input);
    if (!validated.success) {
      return {
        status: "error",
        error: validated.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const { profileId, categories, budget } = validated.data;

    const user = await ensureUser(clerkId);

    // Verify profile belongs to user
    const profile = await db.query.profiles.findFirst({
      where: and(
        eq(profiles.id, profileId),
        eq(profiles.userId, user.id)
      ),
    });

    if (!profile) {
      return { status: "error", error: "Profile not found" };
    }

    const tokenBudget = budget ?? user.tokenBudget;

    const result = await generateWakePrompt(
      profileId,
      categories as MemoryCategory[],
      tokenBudget
    );

    return { status: "success", data: result };
  } catch (error) {
    console.error("generateWakePromptAction error:", error);
    return { status: "error", error: "Failed to generate wake prompt" };
  }
}
