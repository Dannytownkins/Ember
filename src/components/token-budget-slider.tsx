"use client";

import { useState, useTransition } from "react";
import { updateTokenBudgetAction } from "@/lib/actions/profiles";

export function TokenBudgetSlider({
  initialBudget,
}: {
  initialBudget: number;
}) {
  const [budget, setBudget] = useState(initialBudget);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateTokenBudgetAction(budget);
      if (result.status === "success") {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  const hasChanged = budget !== initialBudget;

  return (
    <div className="rounded-2xl border border-ember-border-subtle bg-ember-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-ember-text">
            Wake Prompt Token Budget
          </h3>
          <p className="mt-1 text-xs text-ember-text-muted">
            Maximum tokens for generated wake prompts. Higher = more context,
            shorter conversations.
          </p>
        </div>
        <span className="font-mono text-lg font-semibold text-ember-amber">
          {budget.toLocaleString()}
        </span>
      </div>

      <div className="mt-4">
        <input
          type="range"
          min={2000}
          max={32000}
          step={1000}
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          className="w-full accent-ember-amber"
        />
        <div className="mt-1 flex justify-between text-xs text-ember-text-muted">
          <span>2,000</span>
          <span>8,000</span>
          <span>16,000</span>
          <span>32,000</span>
        </div>
      </div>

      {hasChanged && (
        <button
          onClick={handleSave}
          disabled={isPending}
          className="mt-4 rounded-lg bg-ember-amber-600 px-4 py-2 text-sm font-semibold text-ember-bg transition-colors hover:bg-ember-amber disabled:opacity-50"
        >
          {isPending ? "Saving..." : saved ? "Saved!" : "Save Budget"}
        </button>
      )}
    </div>
  );
}
