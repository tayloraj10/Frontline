"use client";

export interface GuidedStep {
  key: string;
  label: string;
}

/** Step-pills row for a guided multi-step flow. Direct jump to any step is allowed. */
export function GuidedStepper({
  steps,
  activeIndex,
  onJump,
}: {
  steps: GuidedStep[];
  activeIndex: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((s, i) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onJump(i)}
          className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors touch-manipulation ${
            i === activeIndex
              ? "border-sky-500 bg-sky-950/40 text-sky-300"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 active:text-zinc-200 active:border-zinc-500"
          }`}
        >
          {i + 1}. {s.label}
        </button>
      ))}
    </div>
  );
}

const STEPPER_ACCENT = {
  sky: "bg-sky-500 hover:bg-sky-400 active:bg-sky-400 text-sky-950",
  emerald: "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-500 text-white",
} as const;

/**
 * Prev/Continue row for a guided multi-step flow. On the last step, no Next/Continue button
 * is rendered — the caller is expected to show its own Submit action separately (visually
 * separated, e.g. behind a divider) so Submit is never adjacent to a Prev/Next control.
 */
export function StepperNav({
  activeIndex,
  count,
  onPrev,
  onNext,
  accent = "sky",
  nextDisabledReason,
}: {
  activeIndex: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
  accent?: keyof typeof STEPPER_ACCENT;
  /** When set, Continue is disabled and this reason is shown — e.g. "Add a title to continue". */
  nextDisabledReason?: string | null;
}) {
  const isLastStep = activeIndex === count - 1;
  const nextDisabled = !!nextDisabledReason;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={activeIndex === 0}
          onClick={onPrev}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none transition-[border-color,transform] duration-150 touch-manipulation"
        >
          ← Prev
        </button>
        <span className="text-xs text-zinc-500">
          Step {activeIndex + 1} of {count}
        </span>
        {isLastStep ? (
          <span className="px-3 py-1.5 text-xs text-zinc-600">Review &amp; submit below ↓</span>
        ) : (
          <button
            type="button"
            disabled={nextDisabled}
            onClick={onNext}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none transition-[background-color,transform] duration-150 touch-manipulation ${STEPPER_ACCENT[accent]}`}
          >
            Continue →
          </button>
        )}
      </div>
      {!isLastStep && nextDisabledReason && (
        <p className="text-[11px] text-amber-400 text-right">{nextDisabledReason}</p>
      )}
    </div>
  );
}

/** Guided/Full segmented view-mode control, matching CleanupEventDetail's pattern. */
export function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: "guided" | "full";
  onChange: (mode: "guided" | "full") => void;
}) {
  return (
    <div className="self-start inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900 p-0.5 text-xs font-semibold">
      {(["guided", "full"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`px-3 py-1.5 rounded-md transition-colors touch-manipulation ${
            viewMode === mode ? "bg-sky-500 text-sky-950" : "text-zinc-400 hover:text-zinc-200 active:text-zinc-200"
          }`}
        >
          {mode === "guided" ? "Guided" : "Full page"}
        </button>
      ))}
    </div>
  );
}
