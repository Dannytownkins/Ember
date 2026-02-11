"use client";

import { useState } from "react";
import type { Memory, MemoryCategory } from "@/lib/db/schema";
import { MemoryCard } from "./memory-card";

const CATEGORIES: { value: MemoryCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "emotional", label: "Emotional" },
  { value: "work", label: "Work" },
  { value: "hobbies", label: "Hobbies" },
  { value: "relationships", label: "Relationships" },
  { value: "preferences", label: "Preferences" },
];

export function MemoryBrowser({
  initialMemories,
}: {
  initialMemories: Memory[];
}) {
  const [filter, setFilter] = useState<MemoryCategory | "all">("all");
  const [memories, setMemories] = useState(initialMemories);

  const filtered =
    filter === "all"
      ? memories
      : memories.filter((m) => m.category === filter);

  function handleDeleted(id: string) {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  if (memories.length === 0) {
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
          <MemoryCard
            key={memory.id}
            memory={memory}
            onDeleted={handleDeleted}
          />
        ))}
      </div>

      {filtered.length === 0 && memories.length > 0 && (
        <div className="py-12 text-center text-sm text-ember-text-muted">
          No memories in this category.
        </div>
      )}
    </div>
  );
}
