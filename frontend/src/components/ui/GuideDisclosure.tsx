"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** One-line collapsed explainer that expands in place. Starts closed so it never crowds the page. */
export default function GuideDisclosure({
  title,
  summary,
  children,
  className = "",
}: {
  title: string;
  summary: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`rounded-2xl bg-zinc-900 ring-1 ring-inset ring-zinc-800 ${className}`} aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center gap-2 px-4 py-2 text-left touch-manipulation active:bg-zinc-800/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-zinc-100">{title}</span>
          <span className="block truncate text-xs text-zinc-400">{summary}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="border-t border-zinc-800 px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}
