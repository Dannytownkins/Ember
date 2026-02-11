"use client";

import { useState, useMemo, useCallback } from "react";
import type { Memory, MemoryCategory } from "@/lib/db/schema";
import { MemoryCard } from "./memory-card";
import { MemorySearch } from "./memory-search";

const CATEGORIES: { value: MemoryCategory | "all"; label: string; emoji: string }[] = [
  { value: "all", label: "All", emoji: "✦" },
  { value: "emotional", label: "Emotional", emoji: "💜" },
  { value: "work", label: "Work", emoji: "💼" },
  { value: "hobbies", label: "Hobbies", emoji: "🎮" },
  { value: "relationships", label: "Relationships", emoji: "👥" },
  { value: "preferences", label: "Preferences", emoji: "⚙️" },
];

export function MemoryBrowser({
  initialMemories,
}: {
  initialMemories: Memory[];
}) {
  const [filter, setFilter] = useState<MemoryCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [memories, setMemories] = useState(initialMemories);

  const filtered = useMemo(() => {
    let result = memories;

    // Category filter
    if (filter !== "all") {
      result = result.filter((m) => m.category === filter);
    }

    // Search filter (client-side for instant feedback)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.factualContent.toLowerCase().includes(q) ||
          (m.emotionalSignificance?.toLowerCase().includes(q) ?? false) ||
          m.verbatimText.toLowerCase().includes(q)
      );
    }

    return result;
  }, [memories, filter, searchQuery]);

  // Category counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: memories.length };
    for (const m of memories) {
      c[m.category] = (c[m.category] || 0) + 1;
    }
    return c;
  }, [memories]);

  function handleDeleted(id: string) {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

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
      {/* Search */}
      <div className="mb-4">
        <MemorySearch onSearch={handleSearch} />
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFilter(cat.value)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === cat.value
                ? "bg-ember-amber text-ember-bg"
                : "bg-ember-surface-raised text-ember-text-secondary hover:text-ember-text"
            }`}
          >
            <span className="text-xs">{cat.emoji}</span>
            {cat.label}
            <span className="ml-1 text-xs opacity-60">
              {counts[cat.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Results count */}
      {searchQuery && (
        <p className="mt-3 text-sm text-ember-text-muted">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
        </p>
      )}

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
          {searchQuery
            ? `No memories matching "${searchQuery}"`
            : "No memories in this category."}
        </div>
      )}

      {/* Stats footer */}
      <div className="mt-8 text-center text-xs text-ember-text-muted">
        {memories.length} total memories across {Object.keys(counts).length - 1} categories
      </div>
    </div>
  );
}
