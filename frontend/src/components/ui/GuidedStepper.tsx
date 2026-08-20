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

/** Prev/Next row for a guided multi-step flow. Reusable above and below the active step's content. */
export function StepperNav({
  activeIndex,
  count,
  onPrev,
  onNext,
}: {
  activeIndex: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
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
      <button
        type="button"
        disabled={activeIndex === count - 1}
        onClick={onNext}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none transition-[border-color,transform] duration-150 touch-manipulation"
      >
        Next →
      </button>
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
