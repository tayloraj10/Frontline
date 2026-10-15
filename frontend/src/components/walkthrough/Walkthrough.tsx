"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { svgProps, type WalkthroughDef } from "./parts";

/** Generic stepped walkthrough: bottom sheet on mobile, centered card on desktop, swipe + Back/Next. */
export default function Walkthrough({
  def,
  intro,
  onClose,
}: {
  def: WalkthroughDef;
  intro?: string | null;
  onClose: () => void;
}) {
  const steps = def.steps;
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const last = i === steps.length - 1;
  const step = steps[i];

  function go(n: number) {
    setI(Math.max(0, Math.min(steps.length - 1, n)));
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={def.title}
    >
      <div
        className="relative w-full sm:max-w-md flex flex-col bg-zinc-900 border border-zinc-700/60 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
        }}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  n === i ? "w-6 bg-zinc-100" : n < i ? "w-1.5 bg-zinc-500" : "w-1.5 bg-zinc-700"
                }`}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 -mr-2 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:scale-[0.92] transition-[background-color,color,transform] duration-150 touch-manipulation"
          >
            <svg className="w-5 h-5" {...svgProps} strokeWidth={2}>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div key={i} className="px-6 pt-5 pb-4 min-h-[22rem] max-h-[70dvh] overflow-y-auto flex flex-col">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Step {i + 1} of {steps.length}
            {step.label && <span className="text-emerald-400">{" · "}{step.label}</span>}
          </p>
          {step.visual}
          <h2 className="mt-5 text-xl font-black text-zinc-100 tracking-tight flex items-center gap-2">
            {step.title}
            {step.beta && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded px-1 py-0.5 leading-none">
                Beta
              </span>
            )}
          </h2>
          <p className="mt-2 text-[15px] text-zinc-300 leading-relaxed">{step.body}</p>
          {step.how && (
            <ol className="mt-4 flex flex-col gap-2">
              {step.how.map((h, n) => (
                <li key={h} className="flex items-start gap-3 text-[13px] text-zinc-300 leading-snug">
                  <span className="mt-px w-5 h-5 shrink-0 rounded-full bg-zinc-800 text-zinc-400 text-[11px] font-bold flex items-center justify-center">
                    {n + 1}
                  </span>
                  {h}
                </li>
              ))}
            </ol>
          )}
          {i === 0 && intro && <p className="mt-4 text-xs text-zinc-500 leading-relaxed">{intro}</p>}
        </div>

        <div className="px-5 pt-1 flex items-center gap-2">
          {i > 0 ? (
            <button
              onClick={() => go(i - 1)}
              className="min-h-12 px-5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
            >
              Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="min-h-12 px-5 rounded-full text-zinc-400 hover:text-zinc-200 text-sm font-semibold active:scale-[0.97] transition-[color,transform] duration-150 touch-manipulation"
            >
              Skip
            </button>
          )}
          <button
            onClick={() => (last ? onClose() : go(i + 1))}
            className="flex-1 min-h-12 rounded-full bg-zinc-100 hover:bg-white text-zinc-900 text-sm font-bold active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
          >
            {last ? (def.finishLabel ?? "Done") : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
