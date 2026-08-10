"use client";

import { useState } from "react";
import Link from "next/link";

export default function BusinessApplyPrompt() {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="mb-6 inline-flex items-center gap-1.5 px-3 py-1.5 min-h-9 text-xs border border-sky-700/50 hover:border-sky-500 active:scale-95 bg-sky-900/20 hover:bg-sky-900/30 text-sky-400 hover:text-sky-300 rounded-lg font-medium transition-[border-color,background-color,color,transform] duration-150 touch-manipulation"
      >
        <span aria-hidden="true">🏪</span>
        Want to put your business on the map?
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between shadow-elevation-1">
      <div>
        <p className="text-sm font-semibold text-zinc-200">Own a local business?</p>
        <p className="text-xs text-zinc-500 mt-1 max-w-md">
          Get in front of engaged, points-earning users doing cleanups and campaigns in your area. List a discount or
          perk here for free, no cost to join, just review and approval by a Frontline admin.
        </p>
      </div>
      <Link
        href="/partners/apply"
        className="shrink-0 px-4 py-2 min-h-9 text-sm text-center border border-zinc-700 hover:border-zinc-500 active:scale-95 text-zinc-200 rounded-lg font-medium transition-[border-color,transform] duration-150 touch-manipulation whitespace-nowrap"
      >
        Apply to become a partner
      </Link>
    </div>
  );
}
