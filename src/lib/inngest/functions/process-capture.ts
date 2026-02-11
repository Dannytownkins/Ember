import { inngest } from "../client";
import { db } from "@/lib/db";
import { captures, memories } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { extractMemories, extractMemoriesFromImage, countTokens } from "@/lib/ai/extraction";
import { generateContentHash } from "@/lib/utils/content-hash";

export const processCapture = inngest.createFunction(
  {
    id: "process-capture",
    retries: 3,
    concurrency: { limit: 5 },
    onFailure: async ({ error, event }) => {
      await db
        .update(captures)
        .set({
          status: "failed",
          errorMessage: (error as Error).message.slice(0, 500),
        })
        .where(eq(captures.id, event.data.event.data.captureId as string));
    },
  },
  { event: "capture/created" },
  async ({ event, step }) => {
    const { captureId } = event.data as { captureId: string };

    // Step 1: Validate capture exists and mark as processing
    const capture = await step.run("validate", async () => {
      const result = await db
        .update(captures)
        .set({ status: "processing" })
        .where(eq(captures.id, captureId))
        .returning();

      if (!result.length) {
        throw new Error(`Capture ${captureId} not found`);
      }

      return result[0];
    });

    // Step 2: Extract memories via Claude (text or screenshot)
    const extracted = await step.run("extract", async () => {
      if (capture.method === "screenshot" && capture.imageUrls?.length) {
        // Screenshot capture — use vision
        return (await extractMemoriesFromImage(capture.imageUrls)).memories;
      }

      if (!capture.rawText) {
        throw new Error("Capture has no raw text or images to process");
      }

      return (await extractMemories(capture.rawText)).memories;
    });

    // Step 3: Deduplicate, count tokens, and save memories
    const result = await step.run("save", async () => {
      let saved = 0;
      let skippedDuplicates = 0;

      for (const m of extracted) {
        const contentHash = generateContentHash(m.factualContent, m.category);

        // Check for duplicate
        const existing = await db.query.memories.findFirst({
          where: and(
            eq(memories.profileId, capture.profileId),
            eq(memories.contentHash, contentHash),
            isNull(memories.deletedAt)
          ),
          columns: { id: true },
        });

        if (existing) {
          skippedDuplicates++;
          continue;
        }

        await db.insert(memories).values({
          profileId: capture.profileId,
          captureId: capture.id,
          category: m.category as
            | "emotional"
            | "work"
            | "hobbies"
            | "relationships"
            | "preferences",
          factualContent: m.factualContent,
          emotionalSignificance: m.emotionalSignificance,
          verbatimText: m.verbatimText,
          useVerbatim: true,
          importance: m.importance,
          verbatimTokens: countTokens(m.verbatimText),
          summaryTokens: null,
          contentHash,
          speakerConfidence: null,
        });
        saved++;
      }

      await db
        .update(captures)
        .set({ status: "completed" })
        .where(eq(captures.id, captureId));

      return { saved, skippedDuplicates };
    });

    return {
      memoryCount: result.saved,
      duplicatesSkipped: result.skippedDuplicates,
    };
  }
);
