"use client";

import { useState } from "react";
import type { Memory, MemoryCategory } from "@/lib/db/schema";

const CATEGORIES: { value: MemoryCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "emotional", label: "Emotional" },
  { value: "work", label: "Work" },
  { value: "hobbies", label: "Hobbies" },
  { value: "relationships", label: "Relationships" },
  { value: "preferences", label: "Preferences" },
];

function ImportanceDots({ importance }: { importance: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < importance ? "bg-ember-amber" : "bg-ember-border"
          }`}
        />
      ))}
    </div>
  );
}

const categoryColors: Record<MemoryCategory, string> = {
  emotional: "bg-rose-500/20 text-rose-300",
  work: "bg-blue-500/20 text-blue-300",
  hobbies: "bg-emerald-500/20 text-emerald-300",
  relationships: "bg-purple-500/20 text-purple-300",
  preferences: "bg-amber-500/20 text-amber-300",
};

export function MemoryBrowser({
  initialMemories,
}: {
  initialMemories: Memory[];
}) {
  const [filter, setFilter] = useState<MemoryCategory | "all">("all");

  const filtered =
    filter === "all"
      ? initialMemories
      : initialMemories.filter((m) => m.category === filter);

  if (initialMemories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ember-border py-16 text-center">
        <p className="text-lg text-ember-text-muted">No memories yet.</p>
        <p className="mt-2 text-sm text-ember-text-muted">
          <a href="/capture" className="text-ember-amber hover:underline">
            Capture your first conversation &rarr;
          </a>
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFilter(cat.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === cat.value
                ? "bg-ember-amber text-ember-bg"
                : "bg-ember-surface-raised text-ember-text-secondary hover:text-ember-text"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Memory cards */}
      <div className="mt-6 space-y-3">
        {filtered.map((memory) => (
          <div
            key={memory.id}
            className="rounded-2xl border border-ember-border-subtle bg-ember-surface p-5 shadow-ember-card transition-shadow duration-500 hover:shadow-ember-card-hover"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    categoryColors[memory.category as MemoryCategory]
                  }`}
                >
                  {memory.category}
                </span>
                <ImportanceDots importance={memory.importance} />
              </div>
              <span className="text-xs text-ember-text-muted">
                {new Date(memory.createdAt).toLocaleDateString()}
              </span>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-ember-text">
              {memory.factualContent}
            </p>

            {memory.emotionalSignificance && (
              <p className="mt-2 text-sm italic leading-relaxed text-ember-text-warm">
                &rarr; {memory.emotionalSignificance}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
