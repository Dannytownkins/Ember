import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { profiles, memories } from "@/lib/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { ensureUser } from "@/lib/actions/profiles";
import { MemoryBrowser } from "@/components/memory-browser";

export default async function MemoriesPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await ensureUser(clerkId);

  const defaultProfile = await db.query.profiles.findFirst({
    where: and(eq(profiles.userId, user.id), isNull(profiles.deletedAt)),
    columns: { id: true },
  });

  const userMemories = await db.query.memories.findMany({
    where: and(
      eq(memories.profileId, defaultProfile?.id ?? ""),
      isNull(memories.deletedAt)
    ),
    orderBy: [desc(memories.createdAt)],
    limit: 100,
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-ember-text">
        Memories
      </h1>
      <p className="mt-2 text-ember-text-secondary">
        Your extracted memories, organized by category.
      </p>
      <div className="mt-8">
        <MemoryBrowser initialMemories={userMemories} />
      </div>
    </div>
  );
}
