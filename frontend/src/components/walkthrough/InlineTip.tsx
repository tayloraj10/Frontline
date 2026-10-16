"use client";

import { useEffect, useId, useState } from "react";
import BodyPortal from "@/components/ui/BodyPortal";

/**
 * Small "?" that explains one decision in a sentence or two. Opens a tap-friendly sheet
 * (no hover needed) so it works on phones. Safe to place inside a label row.
 */
export default function InlineTip({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Help: ${title}`}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-xs font-bold text-zinc-300 hover:bg-zinc-700 active:scale-95 transition-[background-color,transform] touch-manipulation align-middle"
      >
        ?
      </button>
      {open && (
        <BodyPortal>
          <div
            className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl bg-zinc-900 ring-1 ring-white/10 p-5 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id={titleId} className="font-display text-base font-extrabold text-zinc-100">{title}</h2>
              <div className="text-sm text-zinc-400 space-y-2">{children}</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full min-h-11 rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200 touch-manipulation active:scale-[0.97] transition-transform"
              >
                Got it
              </button>
            </div>
          </div>
        </BodyPortal>
      )}
    </>
  );
}
