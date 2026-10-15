"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export interface FlowStep {
  key: string;
  label: string;
}

interface FlowSheetProps {
  title?: string;
  /** Small amber tag next to the title, e.g. "Beta". */
  badge?: string;
  onClose: () => void;
  /** When set, shows a progress bar and the current step label above the title. */
  steps?: FlowStep[];
  stepIndex?: number;
  children: React.ReactNode;
  /** Sticky action row (Back / Next / Submit). Use FlowFooter for the standard layout. */
  footer?: React.ReactNode;
  /** Soft colored ring for special modes (hotspot bonus, event). */
  glow?: "orange" | "blue" | false;
  footerId?: string;
}

/**
 * Shared shell for every "create something" flow: a bottom sheet on mobile and a
 * centered card on desktop, with an optional step progress bar, a scrolling body
 * and a sticky footer so the primary action never scrolls out of reach.
 */
export default function FlowSheet({
  title,
  badge,
  onClose,
  steps,
  stepIndex = 0,
  children,
  footer,
  glow = false,
  footerId,
}: FlowSheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ring = glow === "blue" ? "ring-2 ring-sky-500/50" : glow === "orange" ? "ring-2 ring-orange-500/50" : "ring-1 ring-white/10";

  // Portaled to body so no parent stacking context can put the bottom tab bar (z-40) over the footer.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`relative w-full sm:max-w-md flex flex-col bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[min(44rem,88dvh)] ${ring}`}
      >
        <div className="shrink-0 px-5 pt-4">
          <div className="flex items-center justify-between gap-3">
            {steps && steps.length > 1 ? (
              <div className="flex-1 flex items-center gap-1.5" aria-hidden="true">
                {steps.map((s, n) => (
                  <span
                    key={s.key}
                    className={`h-1 flex-1 rounded-full transition-colors duration-200 ${n <= stepIndex ? "bg-zinc-100" : "bg-zinc-700"}`}
                  />
                ))}
              </div>
            ) : (
              <span className="flex-1" />
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 -mr-2 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:scale-[0.92] transition-[background-color,color,transform] duration-150 touch-manipulation"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          {(title || (steps && steps.length > 1)) && (
            <div className="mt-3">
              {steps && steps.length > 1 && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Step {stepIndex + 1} of {steps.length}
                </p>
              )}
              {title && (
                <h2 className="text-xl font-black text-zinc-100 tracking-tight flex items-center gap-2">
                  {steps && steps.length > 1 ? steps[stepIndex]?.label ?? title : title}
                  {badge && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded px-1 py-0.5 leading-none">
                      {badge}
                    </span>
                  )}
                </h2>
              )}
              {steps && steps.length > 1 && title && <p className="text-xs text-zinc-500 mt-0.5">{title}</p>}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-4">
          {children}
          {footerId && <span className="block mt-3 text-[9px] text-zinc-700 select-text">{footerId}</span>}
        </div>

        {footer && (
          <div className="shrink-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-zinc-800 bg-zinc-900">
            {footer}
          </div>
        )}
        {!footer && <div className="shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]" />}
      </div>
    </div>,
    document.body,
  );
}

const BTN = "min-h-12 rounded-full text-sm font-bold active:scale-[0.97] transition-[background-color,color,transform] duration-150 touch-manipulation disabled:opacity-40 disabled:pointer-events-none";

/** Standard footer: Back (or Cancel) on the left, one primary pill filling the rest. */
export function FlowFooter({
  onBack,
  backLabel = "Back",
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryHref,
  hint,
}: {
  onBack?: () => void;
  backLabel?: string;
  primaryLabel: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  primaryHref?: string;
  /** Short reason shown above the buttons, e.g. why Next is disabled. */
  hint?: string | null;
}) {
  const primary = `flex-1 inline-flex items-center justify-center px-5 bg-zinc-100 hover:bg-white text-zinc-900 ${BTN}`;
  return (
    <div className="flex flex-col gap-2">
      {hint && <p className="text-xs text-amber-400 text-center">{hint}</p>}
      <div className="flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} className={`px-5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 ${BTN}`}>
            {backLabel}
          </button>
        )}
        {primaryHref ? (
          <a href={primaryHref} className={primary}>
            {primaryLabel}
          </a>
        ) : (
          <button type="button" onClick={onPrimary} disabled={primaryDisabled} className={primary}>
            {primaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
