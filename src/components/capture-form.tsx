"use client";

import { useState, useTransition, useMemo } from "react";
import { createCaptureAction } from "@/lib/actions/captures";
import { ProcessingIndicator } from "./processing-indicator";
import { detectPlatform } from "@/lib/utils/platform-detect";

export function CaptureForm({ profileId }: { profileId: string }) {
  const [text, setText] = useState("");
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const charCount = text.length;
  const isValid = charCount >= 100 && charCount <= 100_000;
  const detectedPlatform = useMemo(
    () => (charCount >= 50 ? detectPlatform(text) : null),
    [text, charCount]
  );

  async function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createCaptureAction({
        profileId,
        text,
        ...(detectedPlatform && detectedPlatform !== "other"
          ? { platform: detectedPlatform }
          : {}),
      });

      if (result.status === "error") {
        setError(result.error);
        return;
      }

      setCaptureId(result.data.captureId);
    });
  }

  if (captureId) {
    return (
      <ProcessingIndicator
        captureId={captureId}
        onReset={() => {
          setCaptureId(null);
          setText("");
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your conversation here to gather embers... (minimum 100 characters)"
          rows={12}
          className="w-full resize-y rounded-2xl border border-ember-border bg-ember-surface-raised p-4 text-sm leading-relaxed text-ember-text placeholder:text-ember-text-muted focus:border-ember-amber/40 focus:outline-none focus:ring-1 focus:ring-ember-amber/20"
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span
              className={
                charCount > 0 && charCount < 100
                  ? "text-ember-error"
                  : "text-ember-text-muted"
              }
            >
              {charCount.toLocaleString()} / 100,000 characters
            </span>
            {detectedPlatform && detectedPlatform !== "other" && (
              <span className="rounded-full bg-ember-surface-raised px-2 py-0.5 text-ember-amber">
                Detected: {detectedPlatform === "chatgpt" ? "ChatGPT" : detectedPlatform === "claude" ? "Claude" : "Gemini"}
              </span>
            )}
          </div>
          {charCount > 0 && charCount < 100 && (
            <span className="text-ember-error">
              {100 - charCount} more characters needed
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-ember-error/20 bg-ember-error/5 px-4 py-3 text-sm text-ember-error">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!isValid || isPending}
        className="w-full rounded-xl bg-ember-amber-600 py-3 font-semibold text-ember-bg shadow-ember-glow transition-all duration-300 hover:bg-ember-amber hover:shadow-ember-glow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {isPending ? "Gathering..." : "🔥 Gather Embers"}
      </button>
    </div>
  );
}
