"use client";

import { useState, useTransition } from "react";
import {
  Flame,
  Sparkles,
  Heart,
  Briefcase,
  Gamepad2,
  Users,
  Settings,
  ArrowRight,
  RotateCcw,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  emotional: <Heart className="h-3.5 w-3.5" />,
  work: <Briefcase className="h-3.5 w-3.5" />,
  hobbies: <Gamepad2 className="h-3.5 w-3.5" />,
  relationships: <Users className="h-3.5 w-3.5" />,
  preferences: <Settings className="h-3.5 w-3.5" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  emotional: "text-rose-400 bg-rose-400/10 border-rose-400/20",
  work: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  hobbies: "text-green-400 bg-green-400/10 border-green-400/20",
  relationships: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  preferences: "text-amber-400 bg-amber-400/10 border-amber-400/20",
};

const SAMPLE_CONVERSATION = `User: I've been thinking about quitting my job at the marketing agency. I've been there 6 years and I'm making $85k but honestly I feel invisible. My boss takes credit for my campaigns constantly.

AI: That sounds really frustrating, especially after 6 years of dedication. What's holding you back from making the change?

User: My daughter just started high school and I don't want to rock the boat financially. She's 14 and already dealing with enough change — her mom and I separated last year. But I've been learning Python on the side and I think I could pivot into data analytics.

AI: It sounds like you're being thoughtful about the timing. Learning Python while managing everything else shows real commitment. Have you looked into what the transition might look like practically?

User: Yeah, I found this bootcamp that's $5k over 6 months, evenings and weekends. My buddy Marcus who works at Spotify said he'd refer me once I have the skills. I'm also really into woodworking — it's what keeps me sane. I built my daughter a bookshelf for her birthday and she actually loved it.

AI: That's a solid plan with Marcus as a potential connection. And the woodworking sounds like it's more than a hobby — it sounds like how you process things and connect with your daughter.

User: Exactly. My therapist says the same thing. I started therapy after the separation and honestly it's the best decision I've made. I prefer morning sessions, like 7am before work. And yeah — the woodworking is meditative. I'm working on a dining table right now, walnut with maple inlays.`;

interface DemoMemory {
  factualContent: string;
  emotionalSignificance: string | null;
  category: string;
  importance: number;
}

export function LiveDemo() {
  const [text, setText] = useState("");
  const [memories, setMemories] = useState<DemoMemory[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [usedSample, setUsedSample] = useState(false);

  function loadSample() {
    setText(SAMPLE_CONVERSATION);
    setUsedSample(true);
    setMemories(null);
    setError(null);
  }

  function reset() {
    setText("");
    setMemories(null);
    setError(null);
    setUsedSample(false);
  }

  async function handleExtract() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/demo/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Something went wrong");
          return;
        }

        const data = await res.json();
        setMemories(data.memories);
      } catch {
        setError("Network error. Try again?");
      }
    });
  }

  return (
    <section className="border-t border-ember-border-subtle px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <h2 className="font-display text-3xl font-bold text-ember-text sm:text-4xl">
            See it in action
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-ember-text-secondary">
            Paste any AI conversation — or try our sample — and watch Ember
            extract memories in seconds. No signup required.
          </p>
        </div>

        <div className="mt-12 space-y-4">
          {!memories ? (
            <>
              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setError(null);
                  }}
                  placeholder="Paste an AI conversation here (min 100 characters)..."
                  rows={8}
                  className="w-full resize-y rounded-2xl border border-ember-border bg-ember-surface-raised p-4 text-sm leading-relaxed text-ember-text placeholder:text-ember-text-muted focus:border-ember-amber/40 focus:outline-none focus:ring-1 focus:ring-ember-amber/20"
                />
                {!text && (
                  <button
                    onClick={loadSample}
                    className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-lg border border-ember-amber/20 bg-ember-surface px-3 py-1.5 text-xs font-medium text-ember-amber transition-colors hover:border-ember-amber/40 hover:bg-ember-amber/5"
                  >
                    <Sparkles className="h-3 w-3" />
                    Load sample conversation
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-ember-text-muted">
                  {text.length > 0
                    ? `${text.length.toLocaleString()} characters${text.length < 100 ? ` (${100 - text.length} more needed)` : ""}`
                    : "3 free demo extractions per hour"}
                </span>
                {text && !usedSample && (
                  <button
                    onClick={loadSample}
                    className="text-xs text-ember-amber hover:underline"
                  >
                    Or try our sample →
                  </button>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-ember-error/20 bg-ember-error/5 px-4 py-3 text-sm text-ember-error">
                  {error}
                </div>
              )}

              <button
                onClick={handleExtract}
                disabled={text.length < 100 || isPending}
                className="w-full rounded-xl bg-ember-amber-600 py-3.5 font-semibold text-ember-bg shadow-ember-glow transition-all duration-300 hover:bg-ember-amber hover:shadow-ember-glow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Flame className="h-4 w-4 animate-pulse" />
                    Extracting memories...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Flame className="h-4 w-4" />
                    Gather Embers
                  </span>
                )}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ember-amber">
                  <Flame className="h-5 w-5" />
                  {memories.length} embers gathered
                </h3>
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 rounded-lg border border-ember-border px-3 py-1.5 text-xs text-ember-text-secondary transition-colors hover:border-ember-amber/30 hover:text-ember-text"
                >
                  <RotateCcw className="h-3 w-3" />
                  Try another
                </button>
              </div>

              <div className="space-y-3">
                {memories.map((memory, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-ember-border-subtle bg-ember-surface p-4 transition-shadow hover:shadow-ember-card-hover"
                    style={{
                      animation: `fadeSlideIn 0.4s ease-out ${i * 0.08}s both`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-relaxed text-ember-text">
                        {memory.factualContent}
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[memory.category] ?? "text-ember-text-muted bg-ember-surface-raised border-ember-border"}`}
                        >
                          {CATEGORY_ICONS[memory.category]}
                          {memory.category}
                        </span>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <div
                              key={j}
                              className={`h-1.5 w-1.5 rounded-full ${j < memory.importance ? "bg-ember-amber" : "bg-ember-surface-raised"}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    {memory.emotionalSignificance && (
                      <p className="mt-2 border-l-2 border-ember-amber/20 pl-3 text-xs italic leading-relaxed text-ember-text-muted">
                        {memory.emotionalSignificance}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-ember-amber/20 bg-gradient-to-r from-ember-amber-700/10 to-ember-amber-600/10 p-6 text-center">
                <p className="text-sm text-ember-text-secondary">
                  Imagine every AI you talk to knowing this about you.
                </p>
                <a
                  href="/sign-up"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-ember-amber-600 px-6 py-2.5 text-sm font-semibold text-ember-bg shadow-ember-glow transition-all duration-300 hover:bg-ember-amber hover:shadow-ember-glow-lg"
                >
                  Start Gathering — It&apos;s Free
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
