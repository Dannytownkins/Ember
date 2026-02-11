import { z } from "zod";

// ─── Memory Categories ───────────────────────────────────

export const memoryCategory = z.enum([
  "emotional",
  "work",
  "hobbies",
  "relationships",
  "preferences",
]);

export type MemoryCategory = z.infer<typeof memoryCategory>;

// ─── Extraction Response (Claude output) ─────────────────

const extractedMemory = z.object({
  factualContent: z.string().min(1),
  emotionalSignificance: z.string().nullable(),
  category: memoryCategory,
  importance: z.number().int().min(1).max(5),
  verbatimText: z.string().min(1),
});

export const extractionResponse = z.object({
  memories: z.array(extractedMemory).min(1).max(50),
});

export type ExtractionResponse = z.infer<typeof extractionResponse>;
export type ExtractedMemory = z.infer<typeof extractedMemory>;

// ─── Capture Inputs ──────────────────────────────────────

export const createCaptureSchema = z.object({
  profileId: z.string().uuid(),
  text: z
    .string()
    .min(100, "Minimum 100 characters")
    .max(100_000, "Maximum 100,000 characters"),
  platform: z.enum(["chatgpt", "claude", "gemini", "other"]).optional(),
});

export type CreateCaptureInput = z.infer<typeof createCaptureSchema>;

// ─── API Capture Input ───────────────────────────────────

export const apiCreateCaptureSchema = z.object({
  profileId: z.string().uuid(),
  text: z
    .string()
    .min(100, "Minimum 100 characters")
    .max(100_000, "Maximum 100,000 characters"),
  platform: z.enum(["chatgpt", "claude", "gemini", "other"]).optional(),
});

// ─── Memory Update ───────────────────────────────────────

export const updateMemorySchema = z.object({
  factualContent: z.string().min(1).optional(),
  emotionalSignificance: z.string().nullable().optional(),
  category: memoryCategory.optional(),
  verbatimText: z.string().min(1).optional(),
  useVerbatim: z.boolean().optional(),
  importance: z.number().int().min(1).max(5).optional(),
});

export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;

// ─── Wake Prompt Input ───────────────────────────────────

export const generateWakePromptSchema = z.object({
  profileId: z.string().uuid(),
  categories: z.array(memoryCategory).min(1),
  budget: z.number().int().min(1000).max(32000).optional(),
});

export type GenerateWakePromptInput = z.infer<typeof generateWakePromptSchema>;

// ─── API Token Input ─────────────────────────────────────

export const createApiTokenSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z
    .array(z.enum(["read", "write", "wake"]))
    .min(1)
    .default(["read", "write", "wake"]),
});

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

// ─── Query Params ────────────────────────────────────────

export const memoriesQuerySchema = z.object({
  profileId: z.string().uuid(),
  category: memoryCategory.optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ─── ActionState (discriminated union for Server Actions) ─

export type ActionState<T> =
  | { status: "success"; data: T }
  | { status: "error"; error: string };
