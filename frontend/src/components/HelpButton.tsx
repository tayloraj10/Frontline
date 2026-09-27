"use client";

import { useState } from "react";
import OnboardingModal from "./OnboardingModal";

export default function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="How this app works"
        className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 min-h-9 sm:min-h-0 rounded-lg border border-zinc-700/60 bg-zinc-800/40 hover:bg-zinc-800 hover:border-zinc-600 active:bg-zinc-800 active:border-zinc-600 active:scale-[0.97] text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-[background-color,border-color,color,transform] duration-150 text-xs font-medium touch-manipulation"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.5 6C6.5 5.17 7.17 4.5 8 4.5s1.5.67 1.5 1.5c0 .67-.4 1.25-1 1.5L8 7.75V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11" r="0.75" fill="currentColor" />
        </svg>
        <span className="hidden sm:inline">Help</span>
      </button>
      <OnboardingModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
