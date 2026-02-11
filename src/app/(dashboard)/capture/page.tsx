import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CaptureForm } from "@/components/capture-form";
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
        Paste a conversation to extract memories.
      </p>
      <div className="mt-8">
        {profileId ? (
          <CaptureForm profileId={profileId} />
        ) : (
          <p className="text-ember-error">
            Error loading profile. Please try refreshing.
          </p>
        )}
      </div>
    </div>
  );
}
