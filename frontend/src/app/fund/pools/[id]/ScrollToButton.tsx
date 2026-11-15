"use client";

import type { ReactNode } from "react";

/** In-page jump link that scrolls smoothly (instantly for people who prefer reduced motion). */
export default function ScrollToButton({ targetId, children }: { targetId: string; children: ReactNode }) {
  return (
    <a
      href={`#${targetId}`}
      onClick={(e) => {
        const el = document.getElementById(targetId);
        if (!el) return;
        e.preventDefault();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      }}
      className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-bold text-emerald-950 touch-manipulation active:scale-[0.98]"
    >
      {children}
    </a>
  );
}
