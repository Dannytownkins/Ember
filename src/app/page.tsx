import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/memories");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center">
        <h1 className="font-display text-5xl font-bold tracking-tight text-ember-text sm:text-7xl">
          <span className="text-ember-amber">Ember</span>
        </h1>
        <p className="mt-4 font-display text-xl text-ember-text-secondary sm:text-2xl">
          Persistent memory for every AI you talk to
        </p>
        <p className="mt-6 text-lg text-ember-text-muted leading-relaxed">
          Capture your conversations. Extract what matters — facts and feelings.
          Give any AI platform the context it needs to truly know you.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="rounded-xl bg-ember-amber-600 px-8 py-3 font-semibold text-ember-bg shadow-ember-glow transition-all duration-300 hover:bg-ember-amber hover:shadow-ember-glow-lg active:scale-[0.98]"
          >
            Get Started
          </Link>
          <Link
            href="/sign-in"
            className="rounded-xl border border-ember-border px-8 py-3 font-semibold text-ember-text-secondary transition-colors duration-200 hover:border-ember-amber/30 hover:text-ember-text"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
