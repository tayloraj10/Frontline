"use client";

import { useState } from "react";
import { useGameSettings } from "@/lib/gameSettings";

type ContentType = "contribution_photo" | "cleanup_log_photo" | "cleanup_event_photo" | "avatar";

export default function ReportPhotoButton({
  contentType,
  contentId,
  photoUrl,
  userId,
  onHidden,
  className = "",
}: {
  contentType: ContentType;
  contentId: string;
  photoUrl: string;
  userId: string | null;
  onHidden?: () => void;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "confirming" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const { values } = useGameSettings(["flag_auto_hide_threshold"] as const);
  const threshold = values.flag_auto_hide_threshold;

  if (!userId) return null;

  const handleReport = async () => {
    setState("submitting");
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/content-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: contentType,
          content_id: contentId,
          photo_url: photoUrl,
          user_id: userId,
        }),
      });
      if (!res.ok) throw new Error("Failed to report this photo.");
      const data = (await res.json()) as { flag_count: number; auto_hidden: boolean };
      if (data.auto_hidden) {
        onHidden?.();
        return;
      }
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to report this photo.");
      setState("idle");
    }
  };

  if (state === "done") {
    return <p className={`text-xs text-zinc-500 ${className}`}>Reported — thanks for flagging this.</p>;
  }

  if (state === "confirming") {
    return (
      <div className={`flex flex-col items-center gap-1.5 ${className}`}>
        <p className="text-xs text-zinc-400 text-center">
          Report this photo as inappropriate?
          {threshold !== undefined && (
            <>
              {" "}It&apos;s automatically hidden once {threshold} people report it, and an admin reviews every report.
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReport}
            className="text-xs font-semibold text-red-400 hover:text-red-300 active:text-red-300 transition-colors duration-150"
          >
            Yes, report it
          </button>
          <button
            onClick={() => setState("idle")}
            className="text-xs text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        onClick={() => setState("confirming")}
        disabled={state === "submitting"}
        className="text-xs text-zinc-400 hover:text-red-400 active:text-red-400 transition-colors duration-150 disabled:opacity-40 underline"
      >
        {state === "submitting" ? "Reporting…" : "🚩 Report photo"}
      </button>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
