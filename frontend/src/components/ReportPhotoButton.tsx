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
  subtle = false,
}: {
  contentType: ContentType;
  contentId: string;
  photoUrl: string;
  userId: string | null;
  onHidden?: () => void;
  className?: string;
  subtle?: boolean;
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
    return <p className={`text-xs text-zinc-500 ${className}`}>{subtle ? "Reported" : "Reported, thanks for flagging this."}</p>;
  }

  if (state === "confirming" && subtle) {
    // Floats below the button so the long prompt can't widen the avatar column.
    return (
      <div className={`relative ${className}`}>
        <span className="inline-flex items-center justify-center min-h-7 px-2.5 rounded-full bg-zinc-800 text-xs font-semibold text-red-300">
          🚩 Report photo
        </span>
        <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-2xl bg-zinc-900 p-3 shadow-lg ring-1 ring-zinc-800 flex flex-col gap-2">
          <p className="text-xs text-zinc-400">
            Report this photo as inappropriate?
            {threshold !== undefined && (
              <>
                {" "}It&apos;s automatically hidden once {threshold} people report it, and an admin reviews every report.
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReport}
              className="inline-flex items-center justify-center min-h-9 px-3.5 rounded-full bg-red-600 hover:bg-red-500 text-xs font-bold text-white active:scale-[0.97] transition-[background-color,transform] duration-150"
            >
              Yes, report it
            </button>
            <button
              onClick={() => setState("idle")}
              className="inline-flex items-center justify-center min-h-9 px-3.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 active:scale-[0.97] transition-[background-color,transform] duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
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
            className="inline-flex items-center justify-center min-h-11 px-4 rounded-full bg-red-600 hover:bg-red-500 text-sm font-bold text-white active:scale-[0.97] transition-[background-color,transform] duration-150"
          >
            Yes, report it
          </button>
          <button
            onClick={() => setState("idle")}
            className="inline-flex items-center justify-center min-h-11 px-4 rounded-full bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold text-zinc-200 active:scale-[0.97] transition-[background-color,transform] duration-150"
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
        className={
          subtle
            ? "disabled:opacity-40 inline-flex items-center justify-center min-h-7 px-2.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-red-300 active:scale-[0.97] transition-[background-color,transform] duration-150"
            : "disabled:opacity-40 inline-flex items-center justify-center min-h-11 px-4 rounded-full bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold text-red-300 active:scale-[0.97] transition-[background-color,transform] duration-150"
        }
      >
        {state === "submitting" ? "Reporting…" : "🚩 Report photo"}
      </button>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
