import { db } from "@/lib/db";
import { memories, profiles } from "@/lib/db/schema";
import { eq, and, inArray, desc, isNull } from "drizzle-orm";
import { countTokens } from "./extraction";
import type { MemoryCategory } from "@/lib/db/schema";

interface WakePromptResult {
  prompt: string;
  tokenCount: number;
  memoryCount: number;
  categories: MemoryCategory[];
  overflow: OverflowInfo;
}

interface OverflowInfo {
  totalAvailable: number;
  totalIncluded: number;
  droppedCount: number;
  oversizedMemories: number;
  perCategory: Record<string, { available: number; included: number; dropped: number }>;
}

const MAX_SINGLE_MEMORY_TOKENS = 500;

export async function generateWakePrompt(
  profileId: string,
  categories: MemoryCategory[],
  budget: number
): Promise<WakePromptResult> {
  // Get profile name
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, profileId),
  });

  const profileName = profile?.name ?? "this person";

  // Fetch memories by category, sorted by importance (exclude soft-deleted)
  const selectedMemories = await db.query.memories.findMany({
    where: and(
      eq(memories.profileId, profileId),
      inArray(memories.category, categories),
      isNull(memories.deletedAt)
    ),
    orderBy: [desc(memories.importance), desc(memories.createdAt)],
  });

  // Calculate overhead (preamble + footer + section headers)
  const preamble = `You are starting a conversation with someone you know well. Here is what you remember about them:\n\n## About ${profileName}\n\n`;
  const footer = `\n---\nUse this context naturally. Don't list facts back. Don't say "I remember that..." — just know it. Reference memories when relevant, especially emotional ones. Be warm and aware.`;

  const overheadTokens = countTokens(preamble) + countTokens(footer) + 50; // 50 token buffer for metadata line
  const availableBudget = budget - overheadTokens;

  // Distribute budget proportionally across selected categories
  const memoriesByCategory: Record<string, typeof selectedMemories> = {};
  for (const cat of categories) {
    memoriesByCategory[cat] = selectedMemories.filter(
      (m) => m.category === cat
    );
  }

  const totalMemoryCount = selectedMemories.length;
  const categoryBudgets: Record<string, number> = {};

  // Proportional budget distribution based on memory count per category
  // Minimum 20% of fair share to prevent categories with few memories from dominating
  const fairShare = availableBudget / categories.length;

  for (const cat of categories) {
    const catMemories = memoriesByCategory[cat]?.length ?? 0;
    const proportion = totalMemoryCount > 0 ? catMemories / totalMemoryCount : 1 / categories.length;
    categoryBudgets[cat] = Math.max(
      Math.floor(availableBudget * proportion),
      Math.floor(fairShare * 0.2)
    );
  }

  // Normalize budgets to not exceed available
  const totalAllocated = Object.values(categoryBudgets).reduce((a, b) => a + b, 0);
  if (totalAllocated > availableBudget) {
    const scale = availableBudget / totalAllocated;
    for (const cat of categories) {
      categoryBudgets[cat] = Math.floor(categoryBudgets[cat] * scale);
    }
  }

  // Pack memories per category
  const sections: Record<MemoryCategory, string[]> = {
    emotional: [],
    work: [],
    hobbies: [],
    relationships: [],
    preferences: [],
  };

  let totalTokens = overheadTokens;
  let oversizedCount = 0;
  const overflowPerCategory: Record<string, { available: number; included: number; dropped: number }> = {};

  for (const cat of categories) {
    const catMemories = memoriesByCategory[cat] ?? [];
    let catBudgetRemaining = categoryBudgets[cat];
    let included = 0;
    let dropped = 0;

    for (const memory of catMemories) {
      // Build memory line
      let line: string;
      if (memory.useVerbatim && memory.verbatimText) {
        line = memory.emotionalSignificance
          ? `- ${memory.factualContent}\n  → ${memory.emotionalSignificance}\n  > "${memory.verbatimText.slice(0, 200)}${memory.verbatimText.length > 200 ? "..." : ""}"`
          : `- ${memory.factualContent}\n  > "${memory.verbatimText.slice(0, 200)}${memory.verbatimText.length > 200 ? "..." : ""}"`;
      } else {
        line = memory.emotionalSignificance
          ? `- ${memory.factualContent}\n  → ${memory.emotionalSignificance}`
          : `- ${memory.factualContent}`;
      }

      let lineTokens = countTokens(line);

      // Handle oversized individual memories
      if (lineTokens > MAX_SINGLE_MEMORY_TOKENS) {
        // Truncate to max single memory size
        const truncatedContent = memory.factualContent.slice(
          0,
          MAX_SINGLE_MEMORY_TOKENS * 3 // ~3 chars per token estimate
        );
        line = memory.emotionalSignificance
          ? `- ${truncatedContent}...\n  → ${memory.emotionalSignificance}`
          : `- ${truncatedContent}...`;
        lineTokens = countTokens(line);
        oversizedCount++;
      }

      if (lineTokens > catBudgetRemaining) {
        dropped++;
        continue;
      }

      sections[cat as MemoryCategory].push(line);
      catBudgetRemaining -= lineTokens;
      totalTokens += lineTokens;
      included++;
    }

    overflowPerCategory[cat] = {
      available: catMemories.length,
      included,
      dropped,
    };
  }

  // Assemble prompt
  const sectionHeaders: Record<MemoryCategory, string> = {
    emotional:
      "### Emotional Context\nThese are sensitive topics. Handle with care and awareness.\n",
    work: "### Work & Projects\n",
    hobbies: "### Hobbies & Interests\n",
    relationships: "### Relationships\n",
    preferences: "### Preferences\n",
  };

  let prompt = preamble;

  const categoryOrder: MemoryCategory[] = [
    "emotional",
    "work",
    "hobbies",
    "relationships",
    "preferences",
  ];

  let memoryCount = 0;

  for (const cat of categoryOrder) {
    if (sections[cat].length > 0) {
      prompt += sectionHeaders[cat];
      prompt += sections[cat].join("\n") + "\n\n";
      memoryCount += sections[cat].length;
    }
  }

  prompt += footer;
  prompt += `\n\nToken count: ${totalTokens} | Memories: ${memoryCount}/${totalMemoryCount} | Generated by Ember`;

  const totalDropped = Object.values(overflowPerCategory).reduce(
    (a, b) => a + b.dropped,
    0
  );

  return {
    prompt,
    tokenCount: totalTokens,
    memoryCount,
    categories,
    overflow: {
      totalAvailable: totalMemoryCount,
      totalIncluded: memoryCount,
      droppedCount: totalDropped,
      oversizedMemories: oversizedCount,
      perCategory: overflowPerCategory,
    },
  };
}
