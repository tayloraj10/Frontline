"use client";

import { useState, useEffect, useRef } from "react";
import Walkthrough from "./walkthrough/Walkthrough";
import { claimAutoOpen, releaseAutoOpen } from "./walkthrough/autoOpen";
import { WALKTHROUGHS, type WalkthroughId } from "@/walkthroughs";
import BodyPortal from "@/components/ui/BodyPortal";

const CAMPAIGN_GUIDES = {
  "trash-war": "trash-war",
  "touch-grass": "touch-grass",
  solarpunk: "solarpunk",
} as const satisfies Record<string, WalkthroughId>;

function storageKey(slug: string): string {
  return `frontline_instructions_seen_${slug}`;
}

export default function CampaignInstructionsModal({
  slug,
  description,
  hideTriggers = false,
  helpSignal = 0,
}: {
  slug: string;
  description?: string | null;
  /** Omit the built-in ? / i buttons; open the dialogs via the signals instead (e.g. from an overflow menu). */
  hideTriggers?: boolean;
  /** Bump to open the "how it works" dialog. */
  helpSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const guideId = (CAMPAIGN_GUIDES as Record<string, WalkthroughId>)[slug];
  const instructions = !!guideId;
  const heldAuto = useRef(false);

  useEffect(() => {
    if (!instructions) return;
    if (typeof window !== "undefined" && !localStorage.getItem(storageKey(slug)) && claimAutoOpen()) {
      heldAuto.current = true;
      setOpen(true);
    }
  }, [slug, instructions]);

  useEffect(() => {
    if (!helpSignal) return;
    if (instructions) {
      setOpen(true);
    } else if (description) {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helpSignal]);

  if (!instructions) {
    if (!description) return null;
    return (
      <>
        {!hideTriggers && <button
          onClick={() => setOpen(true)}
          title="About this campaign"
          className="w-7 h-7 flex items-center justify-center text-xs font-bold rounded-full border border-zinc-700/60 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 active:text-zinc-200 active:bg-zinc-800 active:border-zinc-600 active:scale-[0.92] transition-[background-color,border-color,color,transform] duration-150 touch-manipulation shrink-0"
        >
          i
        </button>}
        {open && (
          <BodyPortal>
            <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 pt-[max(1rem,calc(var(--top-header-h)+1.25rem))] pb-[max(1rem,calc(var(--bottom-nav-h)+1.25rem))] bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={() => setOpen(false)}>
              <div
                className="relative w-full max-w-md modal-max-h-85 flex flex-col bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden my-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 py-5 overflow-y-auto min-h-0 flex-1">
                  <p className="text-zinc-300 text-sm leading-relaxed">{description}</p>
                </div>
                <div className="px-6 pb-5 shrink-0">
                  <button
                    onClick={() => setOpen(false)}
                    className="w-full px-4 py-2.5 bg-zinc-100 hover:bg-white active:bg-white active:scale-[0.97] text-zinc-900 text-sm font-bold rounded-full transition-[background-color,transform] duration-150 touch-manipulation"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          </BodyPortal>
        )}
      </>
    );
  }

  function close() {
    try {
      localStorage.setItem(storageKey(slug), "1");
    } catch {
      /* blocked storage: guide may show again, which is harmless */
    }
    if (heldAuto.current) {
      heldAuto.current = false;
      releaseAutoOpen();
    }
    setOpen(false);
  }

  function reopen() {
    setOpen(true);
  }

  return (
    <>
      {!hideTriggers && <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={reopen}
          title="How this campaign works"
          className="w-7 h-7 flex items-center justify-center text-xs font-bold rounded-full border border-zinc-700/60 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 active:text-zinc-200 active:bg-zinc-800 active:border-zinc-600 active:scale-[0.92] transition-[background-color,border-color,color,transform] duration-150 touch-manipulation shrink-0"
        >
          ?
        </button>
        {description && (
          <button
            onClick={() => setDescOpen(true)}
            title="About this campaign"
            className="w-7 h-7 flex items-center justify-center text-xs font-bold rounded-full border border-zinc-700/60 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 active:text-zinc-200 active:bg-zinc-800 active:border-zinc-600 active:scale-[0.92] transition-[background-color,border-color,color,transform] duration-150 touch-manipulation shrink-0 sm:hidden"
          >
            i
          </button>
        )}
      </div>}

      {description && descOpen && (
        <BodyPortal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 pt-[max(1rem,calc(var(--top-header-h)+1.25rem))] pb-[max(1rem,calc(var(--bottom-nav-h)+1.25rem))] bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={() => setDescOpen(false)}>
            <div
              className="relative w-full max-w-md modal-max-h-85 flex flex-col bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5 overflow-y-auto min-h-0 flex-1">
                <p className="text-zinc-300 text-sm leading-relaxed">{description}</p>
              </div>
              <div className="px-6 pb-5 shrink-0">
                <button
                  onClick={() => setDescOpen(false)}
                  className="w-full px-4 py-2.5 bg-zinc-100 hover:bg-white active:bg-white active:scale-[0.97] text-zinc-900 text-sm font-bold rounded-full transition-[background-color,transform] duration-150 touch-manipulation"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </BodyPortal>
      )}

      {open && guideId && <Walkthrough def={WALKTHROUGHS[guideId]} onClose={close} />}
    </>
  );
}
