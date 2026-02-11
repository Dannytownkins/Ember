import { anthropic } from "./client";
import {
  extractionResponse,
  type ExtractionResponse,
} from "@/lib/validators/schemas";

const EXTRACTION_PROMPT = `You are analyzing a conversation to extract memories for a personal AI memory system.

For each distinct piece of memorable information, extract:

1. FACTUAL CONTENT: The concrete information (dates, names, facts, preferences, decisions).
   Be specific and complete.

2. EMOTIONAL SIGNIFICANCE: Why might someone want to remember this? What's the emotional weight?
   What would an AI need to understand to handle this topic with care?
   If there is no emotional significance, set to null.

3. CATEGORY: One of exactly these five:
   - "emotional" — feelings, difficult moments, vulnerable topics, mental health
   - "work" — career, projects, professional goals, skills
   - "hobbies" — interests, activities, entertainment, creative pursuits
   - "relationships" — family, friends, partners, social dynamics
   - "preferences" — likes, dislikes, communication style, pet peeves

4. IMPORTANCE: 1-5 scale
   - 5: Life-defining (birth of child, career change, loss)
   - 4: Significant (new relationship, major decision)
   - 3: Notable (strong preference, recurring theme)
   - 2: Useful (minor preference, one-time fact)
   - 1: Trivial (mentioned once, low weight)

Return a JSON array of memories. A single conversation typically yields 5-15 memories.
Do not extract small talk or filler. Focus on information that would help an AI know this person.

Respond ONLY with valid JSON matching this schema:
{
  "memories": [
    {
      "factualContent": "string",
      "emotionalSignificance": "string | null",
      "category": "emotional | work | hobbies | relationships | preferences",
      "importance": 1-5,
      "verbatimText": "string (the exact relevant excerpt from the conversation)"
    }
  ]
}`;

const SCREENSHOT_EXTRACTION_PROMPT = `You are analyzing a screenshot of an AI conversation to extract memories for a personal AI memory system.

IMPORTANT: This is a screenshot, not raw text. Read the conversation carefully and identify who is the user and who is the AI.
- The user's messages are typically on one side, the AI's on the other
- Pay attention to usernames, avatars, or message alignment to distinguish speakers
- Extract information ABOUT THE USER (their facts, preferences, feelings) — not the AI's responses
- If you cannot confidently determine who said what, note lower speaker confidence

For each distinct piece of memorable information about the USER, extract:

1. FACTUAL CONTENT: The concrete information (dates, names, facts, preferences, decisions).
   Be specific and complete.

2. EMOTIONAL SIGNIFICANCE: Why might someone want to remember this? What's the emotional weight?
   What would an AI need to understand to handle this topic with care?
   If there is no emotional significance, set to null.

3. CATEGORY: One of exactly these five:
   - "emotional" — feelings, difficult moments, vulnerable topics, mental health
   - "work" — career, projects, professional goals, skills
   - "hobbies" — interests, activities, entertainment, creative pursuits
   - "relationships" — family, friends, partners, social dynamics
   - "preferences" — likes, dislikes, communication style, pet peeves

4. IMPORTANCE: 1-5 scale
   - 5: Life-defining (birth of child, career change, loss)
   - 4: Significant (new relationship, major decision)
   - 3: Notable (strong preference, recurring theme)
   - 2: Useful (minor preference, one-time fact)
   - 1: Trivial (mentioned once, low weight)

5. VERBATIM TEXT: Transcribe the exact relevant excerpt from the screenshot as closely as possible.

Respond ONLY with valid JSON matching this schema:
{
  "memories": [
    {
      "factualContent": "string",
      "emotionalSignificance": "string | null",
      "category": "emotional | work | hobbies | relationships | preferences",
      "importance": 1-5,
      "verbatimText": "string (transcribed from the screenshot)"
    }
  ]
}`;

/**
 * Extract memories from pasted conversation text.
 */
export async function extractMemories(
  rawText: string
): Promise<ExtractionResponse> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${EXTRACTION_PROMPT}\n\nConversation:\n${rawText}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const parsed = extractionResponse.parse(JSON.parse(textBlock.text));
  return parsed;
}

/**
 * Extract memories from conversation screenshots using Claude Vision.
 * Accepts an array of image URLs (supports multiple screenshots of a long conversation).
 */
export async function extractMemoriesFromImage(
  imageUrls: string[]
): Promise<ExtractionResponse> {
  const imageContent = imageUrls.map((url) => ({
    type: "image" as const,
    source: {
      type: "url" as const,
      url,
    },
  }));

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text" as const,
            content: SCREENSHOT_EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude Vision");
  }

  const parsed = extractionResponse.parse(JSON.parse(textBlock.text));
  return parsed;
}

/**
 * Rough token count estimate (4 chars per token).
 * Good enough for budget estimation. Replace with tiktoken for precision.
 */
export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
