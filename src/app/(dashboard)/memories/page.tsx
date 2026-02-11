import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { profiles, memories, captures } from "@/lib/db/schema";
import { eq, and, desc, isNull, count as sqlCount } from "drizzle-orm";
import { ensureUser } from "@/lib/actions/profiles";
import { MemoryBrowser } from "@/components/memory-browser";
import { MemoryStats } from "@/components/memory-stats";

export default async function MemoriesPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await ensureUser(clerkId);

  const defaultProfile = await db.query.profiles.findFirst({
    where: and(eq(profiles.userId, user.id), isNull(profiles.deletedAt)),
    columns: { id: true },
  });

  const profileId = defaultProfile?.id ?? "";

  const userMemories = await db.query.memories.findMany({
    where: and(
      eq(memories.profileId, profileId),
      isNull(memories.deletedAt)
    ),
    orderBy: [desc(memories.createdAt)],
    limit: 100,
  });

  // Stats
  const captureCount = await db
    .select({ count: sqlCount() })
    .from(captures)
    .where(and(eq(captures.profileId, profileId), isNull(captures.deletedAt)));

  const categoryCounts: Record<string, number> = {};
  for (const m of userMemories) {
    categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
  }

  const recentCapture = await db.query.captures.findFirst({
    where: and(eq(captures.profileId, profileId), isNull(captures.deletedAt)),
    orderBy: [desc(captures.createdAt)],
    columns: { createdAt: true },
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-ember-text">
        Memories
      </h1>
      <p className="mt-2 text-ember-text-secondary">
        Your extracted memories, organized by category.
      </p>

      {userMemories.length > 0 && (
        <div className="mt-6">
          <MemoryStats
            totalMemories={userMemories.length}
            totalCaptures={Number(captureCount[0]?.count ?? 0)}
            categoryCounts={categoryCounts}
            recentCaptureDate={recentCapture?.createdAt?.toISOString() ?? null}
          />
        </div>
      )}

      <div className="mt-8">
        <MemoryBrowser initialMemories={userMemories} />
      </div>
    </div>
  );
}
