"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type CaptureStatusResponse = {
  data: {
    id: string;
    status: "queued" | "processing" | "completed" | "failed";
    memoryCount: number;
    errorMessage: string | null;
    createdAt: string;
  };
};

const STAGES = [
  { status: "queued", label: "Queued", description: "Your conversation is warming up..." },
  {
    status: "processing",
    label: "Forming Embers",
    description: "Extracting facts and feelings from your conversation...",
  },
  {
    status: "completed",
    label: "Embers Ready",
    description: "Your memories are glowing.",
  },
];

export function ProcessingIndicator({
  captureId,
  onReset,
}: {
  captureId: string;
  onReset: () => void;
}) {
  const [status, setStatus] = useState<CaptureStatusResponse["data"] | null>(
    null
  );

  useEffect(() => {
    let active = true;

    async function poll() {
      while (active) {
        try {
          const res = await fetch(`/api/captures/${captureId}/status`);
          const json: CaptureStatusResponse = await res.json();
          if (active) setStatus(json.data);

          if (
            json.data.status === "completed" ||
            json.data.status === "failed"
          ) {
            break;
          }
        } catch {
          // Retry on network error
        }

        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    poll();
    return () => {
      active = false;
    };
  }, [captureId]);

  const currentStatus = status?.status ?? "queued";

  return (
    <div className="space-y-6">
      {/* Progress stages */}
      <div className="space-y-3">
        {STAGES.map((stage, i) => {
          const stageOrder = ["queued", "processing", "completed"];
          const currentOrder = stageOrder.indexOf(currentStatus);
          const thisOrder = stageOrder.indexOf(stage.status);
          const isActive = thisOrder === currentOrder;
          const isComplete = thisOrder < currentOrder;

          return (
            <div
              key={stage.status}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-500 ${
                isActive
                  ? "border border-ember-amber/20 bg-ember-surface-raised shadow-ember-glow-sm"
                  : isComplete
                    ? "bg-ember-surface opacity-70"
                    : "bg-ember-surface opacity-40"
              }`}
            >
              <div
                className={`h-3 w-3 rounded-full ${
                  isComplete
                    ? "bg-ember-success"
                    : isActive
                      ? "bg-ember-amber animate-[pulse-glow_2s_ease-in-out_infinite]"
                      : "bg-ember-border"
                }`}
              />
              <div>
                <p className="text-sm font-medium text-ember-text">
                  {stage.label}
                </p>
                <p className="text-xs text-ember-text-muted">
                  {stage.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Result */}
      {currentStatus === "completed" && status && (
        <div className="rounded-2xl border border-ember-success/20 bg-ember-success/5 p-5 text-center">
          <p className="text-lg font-semibold text-ember-success">
            🔥 {status.memoryCount} embers gathered
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Link
              href="/memories"
              className="rounded-xl bg-ember-amber-600 px-6 py-2.5 text-sm font-semibold text-ember-bg transition-colors hover:bg-ember-amber"
            >
              View your Embers
            </Link>
            <button
              onClick={onReset}
              className="rounded-xl border border-ember-border px-6 py-2.5 text-sm font-semibold text-ember-text-secondary transition-colors hover:text-ember-text"
            >
              Gather More
            </button>
          </div>
        </div>
      )}

      {currentStatus === "failed" && status?.errorMessage && (
        <div className="rounded-2xl border border-ember-error/20 bg-ember-error/5 p-5 text-center">
          <p className="text-sm text-ember-error">{status.errorMessage}</p>
          <button
            onClick={onReset}
            className="mt-4 rounded-xl border border-ember-border px-6 py-2.5 text-sm font-semibold text-ember-text-secondary transition-colors hover:text-ember-text"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
