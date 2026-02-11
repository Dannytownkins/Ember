"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { profiles, captures } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { checkCaptureLimit } from "@/lib/rate-limit";
import {
  createScreenshotCaptureSchema,
  type ActionState,
} from "@/lib/validators/schemas";
import { ensureUser } from "./profiles";

/**
 * Create a capture from screenshot uploads.
 * Uses Claude Vision to extract conversation text and memories.
 */
export async function createScreenshotCaptureAction(
  input: unknown
): Promise<ActionState<{ captureId: string }>> {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return { status: "error", error: "Not authenticated" };
    }

    const validated = createScreenshotCaptureSchema.safeParse(input);
    if (!validated.success) {
      return {
        status: "error",
        error: validated.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const { profileId, imageUrls, platform } = validated.data;

    // Ensure user exists
    const user = await ensureUser(clerkId);

    // Check capture rate limit
    const rateLimit = await checkCaptureLimit(user.id, user.tier);
    if (!rateLimit.success) {
      return {
        status: "error",
        error: `Daily capture limit reached (${rateLimit.limit}). Resets at ${new Date(rateLimit.reset).toLocaleTimeString()}.`,
      };
    }

    // Verify profile belongs to user
    const profile = await db.query.profiles.findFirst({
      where: and(eq(profiles.id, profileId), eq(profiles.userId, user.id)),
    });

    if (!profile) {
      return { status: "error", error: "Profile not found" };
    }

    // Create capture record
    const [capture] = await db
      .insert(captures)
      .values({
        profileId,
        method: "screenshot",
        status: "queued",
        rawText: null,
        imageUrls,
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
    console.error("createScreenshotCaptureAction error:", error);
    return { status: "error", error: "Failed to create screenshot capture" };
  }
}
