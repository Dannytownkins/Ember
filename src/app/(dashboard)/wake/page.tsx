import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { memories, profiles, users } from "@/lib/db/schema";
import { eq, and, count as sqlCount } from "drizzle-orm";
import { ensureUser } from "@/lib/actions/profiles";
import { WakePromptGenerator } from "@/components/wake-prompt-generator";
import type { MemoryCategory } from "@/lib/db/schema";

export default async function WakePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await ensureUser(clerkId);

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, user.id),
    columns: { id: true },
  });

  if (!profile) redirect("/capture");

  // Get per-category memory counts
  const categoryCounts = await db
    .select({
      category: memories.category,
      count: sqlCount(),
    })
    .from(memories)
    .where(eq(memories.profileId, profile.id))
    .groupBy(memories.category);

  const countsMap: Record<MemoryCategory, number> = {
    emotional: 0,
    work: 0,
    hobbies: 0,
    relationships: 0,
    preferences: 0,
  };

  for (const row of categoryCounts) {
    countsMap[row.category as MemoryCategory] = Number(row.count);
  }

  const totalMemories = Object.values(countsMap).reduce((a, b) => a + b, 0);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-ember-text">
        Wake Prompt
      </h1>
      <p className="mt-2 text-ember-text-secondary">
        Generate a system prompt to give any AI your context.
      </p>
      <div className="mt-8">
        {totalMemories > 0 ? (
          <WakePromptGenerator
            profileId={profile.id}
            categoryCounts={countsMap}
            tokenBudget={user.tokenBudget}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ember-border py-16 text-center">
            <p className="text-lg text-ember-text-muted">
              Add some memories first.
            </p>
            <a
              href="/capture"
              className="mt-3 text-sm text-ember-amber hover:underline"
            >
              Capture a conversation &rarr;
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
