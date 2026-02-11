import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CaptureForm } from "@/components/capture-form";
import { ScreenshotCaptureForm } from "@/components/screenshot-capture-form";
import { CaptureModeTabs } from "@/components/capture-mode-tabs";
import { getDefaultProfileAction } from "@/lib/actions/profiles";

export default async function CapturePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profileResult = await getDefaultProfileAction();
  const profileId =
    profileResult.status === "success" ? profileResult.data.id : null;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-ember-text">
        Capture
      </h1>
      <p className="mt-2 text-ember-text-secondary">
        Extract memories from conversations — paste text or upload screenshots.
      </p>
      <div className="mt-8">
        {profileId ? (
          <CaptureModeTabs profileId={profileId} />
        ) : (
          <p className="text-ember-error">
            Error loading profile. Please try refreshing.
          </p>
        )}
      </div>
    </div>
  );
}
