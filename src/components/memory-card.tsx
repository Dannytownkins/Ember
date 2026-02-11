"use client";

import { useState, useTransition } from "react";
import type { Memory, MemoryCategory } from "@/lib/db/schema";
import { updateMemoryAction, deleteMemoryAction } from "@/lib/actions/memories";

const categoryColors: Record<MemoryCategory, string> = {
  emotional: "bg-rose-500/20 text-rose-300",
  work: "bg-blue-500/20 text-blue-300",
  hobbies: "bg-emerald-500/20 text-emerald-300",
  relationships: "bg-purple-500/20 text-purple-300",
  preferences: "bg-amber-500/20 text-amber-300",
};

const CATEGORIES: MemoryCategory[] = [
  "emotional",
  "work",
  "hobbies",
  "relationships",
  "preferences",
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

export function MemoryCard({
  memory,
  onDeleted,
}: {
  memory: Memory;
  onDeleted: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [editData, setEditData] = useState({
    factualContent: memory.factualContent,
    category: memory.category as MemoryCategory,
    useVerbatim: memory.useVerbatim,
  });
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateMemoryAction(memory.id, editData);
      if (result.status === "success") {
        setIsEditing(false);
      }
    });
  }

  function handleDelete() {
    if (deleteStep === 0) {
      setDeleteStep(1);
      return;
    }
    if (deleteStep === 1) {
      setDeleteStep(2);
      return;
    }
    // deleteStep === 2: confirmed twice
    startTransition(async () => {
      const result = await deleteMemoryAction(memory.id);
      if (result.status === "success") {
        onDeleted(memory.id);
      }
    });
  }

  if (isEditing) {
    return (
      <div className="rounded-2xl border border-ember-amber/20 bg-ember-surface p-5 shadow-ember-glow-sm">
        <div className="space-y-3">
          <textarea
            value={editData.factualContent}
            onChange={(e) =>
              setEditData({ ...editData, factualContent: e.target.value })
            }
            rows={3}
            className="w-full rounded-lg border border-ember-border bg-ember-surface-raised p-3 text-sm text-ember-text focus:border-ember-amber/40 focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <select
              value={editData.category}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  category: e.target.value as MemoryCategory,
                })
              }
              className="rounded-lg border border-ember-border bg-ember-surface-raised px-3 py-1.5 text-sm text-ember-text focus:border-ember-amber/40 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-ember-text-secondary">
              <input
                type="checkbox"
                checked={editData.useVerbatim}
                onChange={(e) =>
                  setEditData({ ...editData, useVerbatim: e.target.checked })
                }
                className="accent-ember-amber"
              />
              Use verbatim
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg bg-ember-amber-600 px-4 py-1.5 text-xs font-semibold text-ember-bg transition-colors hover:bg-ember-amber disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="rounded-lg border border-ember-border px-4 py-1.5 text-xs text-ember-text-secondary transition-colors hover:text-ember-text"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group rounded-2xl border border-ember-border-subtle bg-ember-surface p-5 shadow-ember-card transition-shadow duration-500 hover:shadow-ember-card-hover">
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
        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-ember-text-muted hover:text-ember-text"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="text-xs text-ember-text-muted hover:text-ember-error"
          >
            {deleteStep === 0
              ? "Delete"
              : deleteStep === 1
                ? "Are you sure?"
                : "Click to confirm"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ember-text">
        {memory.factualContent}
      </p>

      {memory.emotionalSignificance && (
        <p className="mt-2 text-sm italic leading-relaxed text-ember-text-warm">
          &rarr; {memory.emotionalSignificance}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-ember-text-muted">
        <span>{new Date(memory.createdAt).toLocaleDateString()}</span>
        <span>{memory.verbatimTokens} tokens</span>
      </div>
    </div>
  );
}
