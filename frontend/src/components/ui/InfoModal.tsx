"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";

/** A small button that opens its children in a bottom-sheet style modal. Keeps explainers off the page itself. */
export default function InfoModal({
  label,
  title,
  children,
  className = "",
  iconOnly = false,
}: {
  label: string;
  title: string;
  children: ReactNode;
  className?: string;
  /** Render just a small info icon (aria-label = label) instead of a labeled pill. */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={iconOnly ? label : undefined}
        className={iconOnly ? `-my-2 inline-flex h-9 w-8 items-center justify-center rounded-full text-zinc-400 touch-manipulation hover:text-zinc-100 active:scale-95 ${className}` : `inline-flex min-h-11 items-center gap-1.5 rounded-full bg-zinc-900 px-4 text-sm font-semibold text-zinc-200 ring-1 ring-inset ring-zinc-700 touch-manipulation hover:bg-zinc-800 active:scale-[0.97] ${className}`}
      >
        <HelpCircle className={iconOnly ? "h-4 w-4" : "h-4 w-4 text-zinc-400"} aria-hidden="true" />
        {!iconOnly && label}
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:px-4"
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div
              className="relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-zinc-700/60 bg-zinc-900 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-4">
                <h2 className="font-display text-lg font-extrabold text-zinc-100">{title}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="overflow-y-auto px-5 pb-2 pt-1">{children}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
