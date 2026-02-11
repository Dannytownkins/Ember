import { inngest } from "../client";
import { db } from "@/lib/db";
import { captures, memories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { extractMemories, countTokens } from "@/lib/ai/extraction";

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

    // Step 2: Extract memories via Claude
    const extracted = await step.run("extract", async () => {
      if (!capture.rawText) {
        throw new Error("Capture has no raw text to process");
      }

      const result = await extractMemories(capture.rawText);
      return result.memories;
    });

    // Step 3: Count tokens and save memories
    await step.run("save", async () => {
      const memoryRows = extracted.map((m) => ({
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
        speakerConfidence: null,
      }));

      await db.insert(memories).values(memoryRows);

      await db
        .update(captures)
        .set({ status: "completed" })
        .where(eq(captures.id, captureId));
    });

    return { memoryCount: extracted.length };
  }
);
