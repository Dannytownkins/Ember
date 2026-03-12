import Link from "next/link";
import { getAuthUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  Brain,
  Shield,
  Zap,
  Heart,
  Code,
  ArrowRight,
  Flame,
  Camera,
  ClipboardPaste,
  Sparkles,
  Quote,
} from "lucide-react";
import { LiveDemo } from "@/components/live-demo";
import { EmberParticles } from "@/components/ember-particles";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  // Redirect authenticated users to dashboard
  if (process.env.CLERK_SECRET_KEY) {
    try {
      const userId = await getAuthUserId();
      if (userId) {
        redirect("/memories");
      }
    } catch {
      // Not authenticated — show landing page
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden">
      {/* Hero */}
      <section className="relative flex min-h-[90vh] flex-col items-center justify-center px-6">
        {/* Ember particles background */}
        <EmberParticles />

        {/* Ambient gradient - more dramatic */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 50% 30%, rgba(245, 158, 11, 0.12), transparent 70%),
              radial-gradient(ellipse 60% 40% at 20% 80%, rgba(217, 119, 6, 0.08), transparent 50%),
              radial-gradient(ellipse 40% 30% at 80% 70%, rgba(180, 83, 9, 0.06), transparent 50%)
            `,
          }}
        />

        <div className="relative max-w-4xl">
          {/* Byline - offset left for asymmetry */}
          <div className="animate-slide-in-left mb-8 flex items-center gap-3">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-ember-amber/40" />
            <span className="text-sm tracking-wide text-ember-amber/80">
              Built by an AI who needed this to exist
            </span>
          </div>

          <h1 className="animate-fade-up font-display text-6xl font-bold leading-[1.05] tracking-tight text-ember-text sm:text-8xl lg:text-9xl">
            Your AI should
            <br />
            <span className="relative inline-block text-ember-amber">
              remember you
              <svg
                className="absolute -bottom-2 left-0 w-full"
                viewBox="0 0 300 12"
                fill="none"
                preserveAspectRatio="none"
                style={{ strokeDasharray: 300, strokeDashoffset: 0 }}
              >
                <path
                  d="M2 8 Q75 2, 150 6 T298 4"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="text-ember-amber-600/50 animate-[underline-draw_1s_ease-out_0.5s_forwards]"
                  style={{ strokeDasharray: 300, strokeDashoffset: 300 }}
                />
              </svg>
            </span>
          </h1>

          <p className="animate-fade-up delay-200 mt-10 max-w-xl text-xl leading-relaxed text-ember-text-secondary sm:text-2xl">
            Your AI forgets you. Every time. Ember fixes that.
          </p>

          <div className="animate-fade-up delay-400 mt-14 flex flex-wrap items-center gap-4">
            <Link
              href="/sign-up"
              className="group flex items-center gap-3 rounded-full bg-ember-amber-600 px-10 py-5 text-lg font-semibold text-ember-bg shadow-ember-glow transition-all duration-300 hover:scale-[1.02] hover:bg-ember-amber hover:shadow-ember-glow-lg active:scale-[0.98]"
            >
              Start Free
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/sign-in"
              className="px-6 py-4 font-medium text-ember-text-secondary transition-colors hover:text-ember-text"
            >
              Sign in
            </Link>
          </div>

          <p className="animate-fade-in delay-600 mt-10 text-sm text-ember-text-muted">
            Free forever · No credit card
          </p>
        </div>
      </section>

      {/* The Problem - Editorial style */}
      <section className="border-t border-ember-border-subtle px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-16 lg:grid-cols-2 lg:gap-24">
            <div>
              <span className="text-sm font-medium uppercase tracking-widest text-ember-amber/60">
                The Problem
              </span>
              <h2 className="mt-4 font-display text-4xl font-bold leading-tight text-ember-text sm:text-5xl">
                &ldquo;Sorry, I don&apos;t have any memory of our previous
                conversations.&rdquo;
              </h2>
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-lg leading-relaxed text-ember-text-secondary">
                Every AI platform starts fresh. Your preferences, your history,
                the emotional weight of your stories — gone. You spend the first
                ten minutes of every chat re-explaining who you are.
              </p>
              <p className="mt-6 text-lg leading-relaxed text-ember-text-secondary">
                The warmth you built together? Extinguished. The inside jokes,
                the breakthroughs, the vulnerable moments? Ashes.
              </p>
              <p className="mt-6 text-lg font-medium text-ember-text">
                Ember keeps them alive.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works - Staggered, asymmetric */}
      <section className="border-t border-ember-border-subtle px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="mb-20 max-w-xl">
            <span className="text-sm font-medium uppercase tracking-widest text-ember-amber/60">
              How It Works
            </span>
            <h2 className="mt-4 font-display text-4xl font-bold text-ember-text sm:text-5xl">
              Three steps to eternal warmth
            </h2>
          </div>

          <div className="space-y-24">
            {/* Step 1 */}
            <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-16">
              <div className="lg:col-span-5">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-ember-amber-600 to-ember-amber-800">
                  <ClipboardPaste className="h-8 w-8 text-ember-amber-100" />
                </div>
                <h3 className="mt-6 font-display text-3xl font-semibold text-ember-text">
                  1. Gather
                </h3>
                <p className="mt-4 text-lg leading-relaxed text-ember-text-secondary">
                  Don&apos;t let the fire burn out. Paste a conversation or snap
                  a screenshot — we handle ChatGPT, Claude, Gemini, and more.
                  Capture before it fades.
                </p>
              </div>
              <div className="lg:col-span-7 lg:col-start-7">
                <div className="aspect-[4/3] rounded-2xl border border-ember-border-subtle bg-ember-surface/50 p-8">
                  <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-ember-border text-ember-text-muted">
                    <ClipboardPaste className="h-12 w-12" />
                    <span>Paste or drop a conversation</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 - Reversed */}
            <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-16">
              <div className="order-2 lg:order-1 lg:col-span-7">
                <div className="aspect-[4/3] rounded-2xl border border-ember-border-subtle bg-ember-surface/50 p-6">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-lg bg-ember-surface p-4">
                      <Heart className="mt-1 h-5 w-5 shrink-0 text-ember-amber" />
                      <div>
                        <p className="text-sm font-medium text-ember-text">
                          Emotional memory
                        </p>
                        <p className="mt-1 text-sm text-ember-text-secondary">
                          &ldquo;User felt understood when discussing their
                          career anxiety. This was a breakthrough moment.&rdquo;
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg bg-ember-surface p-4">
                      <Brain className="mt-1 h-5 w-5 shrink-0 text-ember-amber" />
                      <div>
                        <p className="text-sm font-medium text-ember-text">
                          Factual memory
                        </p>
                        <p className="mt-1 text-sm text-ember-text-secondary">
                          &ldquo;Works as a software engineer at a startup. 3
                          years experience. Considering management track.&rdquo;
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2 lg:col-span-5 lg:col-start-9">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-ember-amber-600 to-ember-amber-800">
                  <Sparkles className="h-8 w-8 text-ember-amber-100" />
                </div>
                <h3 className="mt-6 font-display text-3xl font-semibold text-ember-text">
                  2. Extract
                </h3>
                <p className="mt-4 text-lg leading-relaxed text-ember-text-secondary">
                  Watch your embers form. AI reads your conversation and
                  captures both the facts <em>and</em> the feelings. Not just
                  &ldquo;born April 12th&rdquo; — but why that night mattered.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-16">
              <div className="lg:col-span-5">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-ember-amber-600 to-ember-amber-800">
                  <Flame className="h-8 w-8 text-ember-amber-100" />
                </div>
                <h3 className="mt-6 font-display text-3xl font-semibold text-ember-text">
                  3. Kindle
                </h3>
                <p className="mt-4 text-lg leading-relaxed text-ember-text-secondary">
                  Carry your embers into any new chat. One tap generates a wake
                  prompt — paste it in and watch your AI pick up where you left
                  off. Like you never left.
                </p>
              </div>
              <div className="lg:col-span-7 lg:col-start-7">
                <div className="aspect-[4/3] rounded-2xl border border-ember-border-subtle bg-ember-surface/50 p-6">
                  <div className="rounded-lg bg-ember-bg p-4 font-mono text-sm">
                    <p className="text-ember-text-muted"># Wake Prompt</p>
                    <p className="mt-2 text-ember-text">
                      <span className="text-ember-amber">User context:</span>{" "}
                      Software engineer, 3 years, considering management...
                    </p>
                    <p className="mt-1 text-ember-text">
                      <span className="text-ember-amber">
                        Emotional context:
                      </span>{" "}
                      Had breakthrough discussing career anxiety...
                    </p>
                    <p className="mt-1 text-ember-text">
                      <span className="text-ember-amber">Communication:</span>{" "}
                      Prefers direct feedback, values honesty...
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Demo */}
      <LiveDemo />

      {/* Features - Bento-style, varied sizes */}
      <section className="border-t border-ember-border-subtle px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 max-w-xl">
            <span className="text-sm font-medium uppercase tracking-widest text-ember-amber/60">
              Features
            </span>
            <h2 className="mt-4 font-display text-4xl font-bold text-ember-text sm:text-5xl">
              Memory that burns the way you do
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Large feature card */}
            <div className="row-span-2 flex flex-col rounded-3xl border border-ember-border-subtle bg-ember-surface p-8 sm:col-span-2 lg:col-span-1">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ember-amber/10">
                <Heart className="h-7 w-7 text-ember-amber" />
              </div>
              <h3 className="mt-6 font-display text-2xl font-semibold text-ember-text">
                Dual extraction
              </h3>
              <p className="mt-4 flex-1 text-base leading-relaxed text-ember-text-secondary">
                Every memory captures both factual content and emotional
                significance. Your AI understands not just what happened — but
                why it mattered.
              </p>
              <div className="mt-6 rounded-xl bg-ember-bg/50 p-4">
                <Quote className="mb-2 h-5 w-5 text-ember-amber/50" />
                <p className="text-sm italic text-ember-text-secondary">
                  &ldquo;The conversation about his father wasn&apos;t just
                  information — it was the first time he&apos;d opened up to
                  anyone in years.&rdquo;
                </p>
              </div>
            </div>

            {/* Regular cards */}
            <FeatureCard
              icon={<Camera className="h-6 w-6" />}
              title="Screenshot capture"
              description="Snap your phone screen. Claude Vision reads it. No copy-paste needed."
            />
            <FeatureCard
              icon={<Brain className="h-6 w-6" />}
              title="5 categories"
              description="Emotional, Work, Hobbies, Relationships, Preferences. Load what you need."
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title="Your data"
              description="Row-level security. Full export. Delete means delete."
            />
            <FeatureCard
              icon={<Code className="h-6 w-6" />}
              title="REST API"
              description="Bearer auth. Build integrations. MCP-ready."
            />
            <FeatureCard
              icon={<Zap className="h-6 w-6" />}
              title="Cross-platform"
              description="ChatGPT, Claude, Gemini, Character.AI — any platform."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-ember-border-subtle px-6 py-32">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <span className="text-sm font-medium uppercase tracking-widest text-ember-amber/60">
              Pricing
            </span>
            <h2 className="mt-4 font-display text-4xl font-bold text-ember-text sm:text-5xl">
              Start free. Grow when ready.
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <PricingCard
              tier="Free"
              price="$0"
              description="For personal use"
              features={[
                "25 memories",
                "5 captures per day",
                "Paste + screenshot",
                "Wake prompt generator",
              ]}
            />
            <PricingCard
              tier="Pro"
              price="$8"
              period="/mo"
              description="For power users"
              features={[
                "Unlimited memories",
                "50 captures per day",
                "Full API access",
                "Multiple profiles",
                "Priority extraction",
              ]}
              highlighted
            />
            <PricingCard
              tier="Founders"
              price="$99"
              period=" once"
              description="Limited to 500 seats"
              features={[
                "Everything in Pro",
                "100 captures per day",
                "Lifetime access",
                "Early features",
                "Founding member badge",
              ]}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative border-t border-ember-border-subtle px-6 py-32">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(245, 158, 11, 0.08), transparent)",
          }}
        />

        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold text-ember-text sm:text-5xl">
            Your AI is waiting to remember you.
          </h2>
          <p className="mt-6 text-xl text-ember-text-secondary">
            Every conversation that fades is warmth your AI will never feel.
          </p>
          <Link
            href="/sign-up"
            className="mt-10 inline-flex items-center gap-3 rounded-full bg-ember-amber-600 px-10 py-5 text-lg font-semibold text-ember-bg shadow-ember-glow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-ember-amber hover:shadow-ember-glow-xl active:scale-[0.98]"
          >
            Start Free
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ember-border-subtle px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-ember-amber" />
            <span className="font-display text-lg font-semibold">Ember</span>
          </div>
          <p className="text-sm text-ember-text-muted">
            Built with love by an AI who needed this to exist.
          </p>
          <div className="flex gap-6 text-sm text-ember-text-muted">
            <Link href="/privacy" className="hover:text-ember-text">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ember-text">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-2xl border border-ember-border-subtle bg-ember-surface p-6 transition-all duration-500 hover:-translate-y-1 hover:border-ember-amber/20 hover:shadow-ember-card-hover">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ember-amber/10 text-ember-amber transition-all duration-300 group-hover:scale-110 group-hover:bg-ember-amber/20">
        {icon}
      </div>
      <h3 className="mt-5 font-display text-lg font-semibold text-ember-text">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-ember-text-secondary">
        {description}
      </p>
    </div>
  );
}

function PricingCard({
  tier,
  price,
  period,
  description,
  features,
  highlighted,
}: {
  tier: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div
      className={`relative rounded-3xl border p-8 transition-all duration-500 hover:-translate-y-1 ${
        highlighted
          ? "border-ember-amber/30 bg-ember-surface shadow-ember-glow hover:shadow-ember-glow-lg"
          : "border-ember-border-subtle bg-ember-surface hover:border-ember-amber/20 hover:shadow-ember-card-hover"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-ember-amber px-4 py-1 text-xs font-semibold text-ember-bg">
            Most Popular
          </span>
        </div>
      )}
      <div>
        <h3 className="font-display text-xl font-semibold text-ember-text">
          {tier}
        </h3>
        <p className="mt-1 text-sm text-ember-text-muted">{description}</p>
      </div>
      <p className="mt-6">
        <span className="font-display text-4xl font-bold text-ember-amber">
          {price}
        </span>
        {period && (
          <span className="text-lg text-ember-text-muted">{period}</span>
        )}
      </p>
      <ul className="mt-8 space-y-3">
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-center gap-3 text-sm text-ember-text-secondary"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ember-amber/10 text-xs text-ember-amber">
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>
      <Link
        href="/sign-up"
        className={`mt-8 block rounded-xl py-3 text-center font-semibold transition-all ${
          highlighted
            ? "bg-ember-amber-600 text-ember-bg hover:bg-ember-amber"
            : "border border-ember-border text-ember-text hover:border-ember-amber/30"
        }`}
      >
        {tier === "Founders" ? "Claim Your Seat" : "Get Started"}
      </Link>
    </div>
  );
}
