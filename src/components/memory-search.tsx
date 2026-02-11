"use client";

import { useState, useCallback } from "react";
import { Search, X } from "lucide-react";

export function MemorySearch({
  onSearch,
}: {
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(
    null
  );

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);

      // Debounce search
      if (debounceTimer) clearTimeout(debounceTimer);

      const timer = setTimeout(() => {
        onSearch(value.trim());
      }, 300);

      setDebounceTimer(timer);
    },
    [debounceTimer, onSearch]
  );

  function handleClear() {
    setQuery("");
    onSearch("");
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ember-text-muted" />
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search memories..."
        className="w-full rounded-xl border border-ember-border bg-ember-surface-raised py-2.5 pl-10 pr-10 text-sm text-ember-text placeholder:text-ember-text-muted focus:border-ember-amber/40 focus:outline-none focus:ring-1 focus:ring-ember-amber/20"
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ember-text-muted hover:text-ember-text"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
