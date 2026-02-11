"use client";

import { useState, useTransition } from "react";
import { generateWakePromptAction } from "@/lib/actions/wake-prompts";
import type { MemoryCategory } from "@/lib/db/schema";

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  emotional: "Emotional",
  work: "Work",
  hobbies: "Hobbies",
  relationships: "Relationships",
  preferences: "Preferences",
};

export function WakePromptGenerator({
  profileId,
  categoryCounts,
  tokenBudget,
}: {
  profileId: string;
  categoryCounts: Record<MemoryCategory, number>;
  tokenBudget: number;
}) {
  const categories: MemoryCategory[] = [
    "emotional",
    "work",
    "hobbies",
    "relationships",
    "preferences",
  ];
  const [selected, setSelected] = useState<Set<MemoryCategory>>(
    new Set(categories.filter((c) => categoryCounts[c] > 0))
  );
  const [result, setResult] = useState<{
    prompt: string;
    tokenCount: number;
    memoryCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function toggleCategory(cat: MemoryCategory) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  async function handleGenerate() {
    setError(null);
    setResult(null);

    startTransition(async () => {
      const res = await generateWakePromptAction({
        profileId,
        categories: Array.from(selected),
        budget: tokenBudget,
      });

      if (res.status === "error") {
        setError(res.error);
        return;
      }

      setResult(res.data);
    });
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Category checkboxes */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-ember-text-secondary">
          Select categories to include:
        </h3>
        <div className="space-y-2">
          {categories.map((cat) => (
            <label
              key={cat}
              className="flex items-center justify-between rounded-xl border border-ember-border-subtle bg-ember-surface p-3 transition-colors hover:bg-ember-surface-hover"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(cat)}
                  onChange={() => toggleCategory(cat)}
                  disabled={categoryCounts[cat] === 0}
                  className="h-4 w-4 rounded border-ember-border accent-ember-amber"
                />
                <span className="text-sm text-ember-text">
                  {CATEGORY_LABELS[cat]}
                </span>
              </div>
              <span className="text-xs text-ember-text-muted">
                {categoryCounts[cat]} memories
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Token budget display */}
      <div className="flex items-center justify-between rounded-xl bg-ember-surface-raised px-4 py-3">
        <span className="text-sm text-ember-text-secondary">Token budget</span>
        <span className="text-sm font-medium text-ember-amber">
          {tokenBudget.toLocaleString()} tokens
        </span>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={selected.size === 0 || isPending}
        className="w-full rounded-xl bg-ember-amber-600 py-3 font-semibold text-ember-bg shadow-ember-glow transition-all duration-300 hover:bg-ember-amber hover:shadow-ember-glow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {isPending ? "Generating..." : "Generate Wake Prompt"}
      </button>

      {error && (
        <div className="rounded-xl border border-ember-error/20 bg-ember-error/5 px-4 py-3 text-sm text-ember-error">
          {error}
        </div>
      )}

      {/* Result preview */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ember-text-secondary">
              {result.tokenCount.toLocaleString()} tokens &middot;{" "}
              {result.memoryCount} memories
            </span>
            <button
              onClick={handleCopy}
              className="rounded-lg border border-ember-border px-3 py-1.5 text-xs font-medium text-ember-text-secondary transition-colors hover:border-ember-amber/30 hover:text-ember-text"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="max-h-96 overflow-auto rounded-2xl border border-ember-border-subtle bg-ember-surface p-4 font-mono text-xs leading-relaxed text-ember-text-secondary">
            {result.prompt}
          </pre>
        </div>
      )}
    </div>
  );
}
