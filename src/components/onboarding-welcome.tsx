"use client";

import { useState } from "react";
import { Flame, ClipboardPaste, Sparkles, ArrowRight, X } from "lucide-react";

const steps = [
  {
    icon: ClipboardPaste,
    title: "Gather your Embers",
    description:
      "Paste any AI conversation or snap a screenshot. Ember reads it and captures what matters — the facts AND the feelings.",
    hint: "Works with ChatGPT, Claude, Gemini, Character.AI — any platform.",
  },
  {
    icon: Sparkles,
    title: "Watch them form",
    description:
      "AI extracts dual-dimension memories: what happened and why it mattered. Not just data — context. The kind that makes an AI feel like it knows you.",
    hint: "Memories are organized by category: emotional, work, hobbies, relationships, preferences.",
  },
  {
    icon: Flame,
    title: "Kindle any chat",
    description:
      "One tap generates a kindle prompt. Paste it into any AI chat and watch them pick up where you left off. Like you never left.",
    hint: "Your memories are yours. Portable. Private. Permanent.",
  },
];

export function OnboardingWelcome({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(0);
  const current = steps[step];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-ember-amber/20 bg-gradient-to-b from-ember-surface to-ember-bg p-8 shadow-ember-glow">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(245, 158, 11, 0.3), transparent)",
        }}
      />

      {/* Close button */}
      <button
        onClick={onDismiss}
        className="absolute right-4 top-4 rounded-lg p-1.5 text-ember-text-muted transition-colors hover:bg-ember-surface-hover hover:text-ember-text"
        aria-label="Dismiss welcome"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="relative">
        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === step
                  ? "w-8 bg-ember-amber"
                  : i < step
                    ? "w-4 bg-ember-amber/40"
                    : "w-4 bg-ember-border"
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-ember-amber/10">
          <current.icon className="h-7 w-7 text-ember-amber" />
        </div>

        {/* Content */}
        <h2 className="font-display text-2xl font-bold text-ember-text">
          {current.title}
        </h2>
        <p className="mt-3 max-w-lg leading-relaxed text-ember-text-secondary">
          {current.description}
        </p>
        <p className="mt-2 text-sm text-ember-text-muted">{current.hint}</p>

        {/* Actions */}
        <div className="mt-8 flex items-center gap-3">
          {step < steps.length - 1 ? (
            <>
              <button
                onClick={() => setStep(step + 1)}
                className="group flex items-center gap-2 rounded-xl bg-ember-amber-600 px-6 py-2.5 font-semibold text-ember-bg transition-all hover:bg-ember-amber active:scale-[0.98]"
              >
                Next
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={onDismiss}
                className="rounded-xl px-4 py-2.5 text-sm text-ember-text-muted transition-colors hover:text-ember-text"
              >
                Skip
              </button>
            </>
          ) : (
            <a
              href="/capture"
              onClick={onDismiss}
              className="group flex items-center gap-2 rounded-xl bg-ember-amber-600 px-6 py-2.5 font-semibold text-ember-bg transition-all hover:bg-ember-amber active:scale-[0.98]"
            >
              Gather your first Embers
              <Flame className="h-4 w-4 transition-transform group-hover:scale-110" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
