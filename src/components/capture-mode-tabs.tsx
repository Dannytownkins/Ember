"use client";

import { useState } from "react";
import { CaptureForm } from "./capture-form";
import { ScreenshotCaptureForm } from "./screenshot-capture-form";
import { ClipboardPaste, Camera } from "lucide-react";

type CaptureMode = "paste" | "screenshot";

export function CaptureModeTabs({ profileId }: { profileId: string }) {
  const [mode, setMode] = useState<CaptureMode>("paste");

  return (
    <div>
      {/* Mode selector */}
      <div className="mb-6 flex rounded-xl border border-ember-border-subtle bg-ember-surface p-1">
        <button
          onClick={() => setMode("paste")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
            mode === "paste"
              ? "bg-ember-amber-600 text-ember-bg shadow-ember-glow-sm"
              : "text-ember-text-secondary hover:text-ember-text"
          }`}
        >
          <ClipboardPaste className="h-4 w-4" />
          Paste Text
        </button>
        <button
          onClick={() => setMode("screenshot")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
            mode === "screenshot"
              ? "bg-ember-amber-600 text-ember-bg shadow-ember-glow-sm"
              : "text-ember-text-secondary hover:text-ember-text"
          }`}
        >
          <Camera className="h-4 w-4" />
          Screenshots
        </button>
      </div>

      {/* Capture form based on mode */}
      {mode === "paste" ? (
        <CaptureForm profileId={profileId} />
      ) : (
        <ScreenshotCaptureForm profileId={profileId} />
      )}
    </div>
  );
}
