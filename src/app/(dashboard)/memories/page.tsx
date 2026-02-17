import { getAuthUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { profiles, memories, captures } from "@/lib/db/schema";
import { eq, and, desc, isNull, count as sqlCount } from "drizzle-orm";
import { ensureUser } from "@/lib/actions/profiles";
import { MemoryBrowser } from "@/components/memory-browser";
import { MemoryStats } from "@/components/memory-stats";
import { MemoriesPageClient } from "./memories-client";

export default async function MemoriesPage() {
  const clerkId = await getAuthUserId();
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
    <MemoriesPageClient
      memories={userMemories}
      totalCaptures={Number(captureCount[0]?.count ?? 0)}
      categoryCounts={categoryCounts}
      recentCaptureDate={recentCapture?.createdAt?.toISOString() ?? null}
    />
  );
}
