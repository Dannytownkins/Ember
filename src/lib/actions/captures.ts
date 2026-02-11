"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, profiles, captures } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import {
  createCaptureSchema,
  type ActionState,
} from "@/lib/validators/schemas";
import { ensureUser } from "./profiles";

export async function createCaptureAction(
  input: unknown
): Promise<ActionState<{ captureId: string }>> {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { status: "error", error: "Not authenticated" };
    }

    const validated = createCaptureSchema.safeParse(input);
    if (!validated.success) {
      return {
        status: "error",
        error: validated.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const { profileId, text, platform } = validated.data;

    // Ensure user exists (just-in-time creation fallback)
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

    // Create capture record
    const [capture] = await db
      .insert(captures)
      .values({
        profileId,
        method: "paste",
        status: "queued",
        rawText: text,
        platform: platform ?? null,
      })
      .returning();

    // Fire Inngest event for background processing
    await inngest.send({
      name: "capture/created",
      data: { captureId: capture.id },
    });

    return { status: "success", data: { captureId: capture.id } };
  } catch (error) {
    console.error("createCaptureAction error:", error);
    return { status: "error", error: "Failed to create capture" };
  }
}
