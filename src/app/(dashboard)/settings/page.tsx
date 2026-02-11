import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserProfile } from "@clerk/nextjs";
import { ensureUser } from "@/lib/actions/profiles";

export default async function SettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await ensureUser(clerkId);

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
                  cardBox: "shadow-none border border-ember-border-subtle rounded-2xl",
                },
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
