import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserProfile } from "@clerk/nextjs";
import { ensureUser } from "@/lib/actions/profiles";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ApiTokenManager } from "@/components/api-token-manager";
import { DataExportButton } from "@/components/data-export-button";
import { TokenBudgetSlider } from "@/components/token-budget-slider";

export default async function SettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await ensureUser(clerkId);

  const tokens = await db.query.apiTokens.findMany({
    where: eq(apiTokens.userId, user.id),
    columns: {
      id: true,
      name: true,
      scopes: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: (apiTokens, { desc }) => [desc(apiTokens.createdAt)],
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-ember-text">
        Settings
      </h1>
      <p className="mt-2 text-ember-text-secondary">
        Manage your account and preferences.
      </p>

      <div className="mt-8 space-y-8">
        {/* Account info */}
        <section>
          <h2 className="font-display text-xl font-semibold text-ember-text">
            Account
          </h2>
          <div className="mt-4 rounded-2xl border border-ember-border-subtle bg-ember-surface p-5">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ember-text-secondary">Email</span>
                <span className="text-ember-text">{user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ember-text-secondary">Tier</span>
                <span className="capitalize text-ember-amber">{user.tier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ember-text-secondary">Token Budget</span>
                <span className="text-ember-text">
                  {user.tokenBudget.toLocaleString()} tokens
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Token Budget */}
        <section>
          <h2 className="font-display text-xl font-semibold text-ember-text">
            Token Budget
          </h2>
          <div className="mt-4">
            <TokenBudgetSlider initialBudget={user.tokenBudget} />
          </div>
        </section>

        {/* API Tokens */}
        <section>
          <h2 className="font-display text-xl font-semibold text-ember-text">
            API Tokens
          </h2>
          <p className="mt-1 text-sm text-ember-text-muted">
            Create tokens to access your memories from AI agents, CLI tools, or
            MCP servers.
          </p>
          <div className="mt-4">
            <ApiTokenManager initialTokens={tokens} />
          </div>
        </section>

        {/* Data Export */}
        <section>
          <h2 className="font-display text-xl font-semibold text-ember-text">
            Data
          </h2>
          <p className="mt-1 text-sm text-ember-text-muted">
            Export all your memories, profiles, and captures as JSON.
          </p>
          <div className="mt-4">
            <DataExportButton />
          </div>
        </section>

        {/* Clerk profile management */}
        <section>
          <h2 className="font-display text-xl font-semibold text-ember-text">
            Profile
          </h2>
          <div className="mt-4">
            <UserProfile
              appearance={{
                elements: {
                  rootBox: "w-full",
                  cardBox:
                    "shadow-none border border-ember-border-subtle rounded-2xl",
                },
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
