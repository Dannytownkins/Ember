"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { createScreenshotCaptureAction } from "@/lib/actions/screenshot-captures";
import { ProcessingIndicator } from "./processing-indicator";
import { Camera, X, Upload, ImagePlus } from "lucide-react";

interface PreviewImage {
  file: File;
  url: string;
}

export function ScreenshotCaptureForm({
  profileId,
}: {
  profileId: string;
}) {
  const [images, setImages] = useState<PreviewImage[]>([]);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newImages: PreviewImage[] = [];
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      if (!file.type.startsWith("image/")) continue;
      if (images.length + newImages.length >= 10) break;

      newImages.push({
        file,
        url: URL.createObjectURL(file),
      });
    }

    setImages((prev) => [...prev, ...newImages]);
  }, [images.length]);

  function removeImage(index: number) {
    setImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  async function handleSubmit() {
    if (images.length === 0) return;
    setError(null);

    // For now, we'll use object URLs as placeholders.
    // In production, images would be uploaded to Cloudinary/S3 first,
    // then the URLs passed to the capture action.
    // TODO: Implement actual image upload to cloud storage

    startTransition(async () => {
      // Placeholder: In production, upload images first and get URLs
      // For MVP, we demonstrate the flow
      const imageUrls = images.map((img) => img.url);

      const result = await createScreenshotCaptureAction({
        profileId,
        imageUrls,
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
          setImages([]);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all duration-300 ${
          isDragging
            ? "border-ember-amber bg-ember-amber/5 shadow-ember-glow"
            : "border-ember-border hover:border-ember-amber/40 hover:bg-ember-surface-raised"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          className="hidden"
        />
        {images.length === 0 ? (
          <>
            <Camera className="h-10 w-10 text-ember-text-muted" />
            <p className="mt-3 text-sm font-medium text-ember-text-secondary">
              Drop screenshots here or click to upload
            </p>
            <p className="mt-1 text-xs text-ember-text-muted">
              Up to 10 images per capture · PNG, JPG, WEBP
            </p>
          </>
        ) : (
          <>
            <ImagePlus className="h-8 w-8 text-ember-amber" />
            <p className="mt-2 text-sm text-ember-text-secondary">
              Add more screenshots ({images.length}/10)
            </p>
          </>
        )}
      </div>

      {/* Image previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, i) => (
            <div
              key={i}
              className="group relative overflow-hidden rounded-xl border border-ember-border-subtle"
            >
              <img
                src={img.url}
                alt={`Screenshot ${i + 1}`}
                className="aspect-[3/4] w-full object-cover"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeImage(i);
                }}
                className="absolute right-2 top-2 rounded-full bg-ember-bg/80 p-1 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
              >
                <X className="h-4 w-4 text-ember-text" />
              </button>
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-ember-bg/80 px-2 py-1">
                <span className="text-[10px] text-ember-text-muted">
                  {(img.file.size / 1024).toFixed(0)} KB
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-ember-error/20 bg-ember-error/5 px-4 py-3 text-sm text-ember-error">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={images.length === 0 || isPending}
        className="w-full rounded-xl bg-ember-amber-600 py-3 font-semibold text-ember-bg shadow-ember-glow transition-all duration-300 hover:bg-ember-amber hover:shadow-ember-glow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {isPending
          ? "Processing..."
          : `Extract Memories from ${images.length} Screenshot${images.length !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
