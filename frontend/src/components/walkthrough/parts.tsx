import type { ReactNode } from "react";

/** Shared building blocks for walkthrough step visuals (mock UI, not screenshots, so they never go stale). */

export interface WalkthroughStep {
  title: string;
  /** Short topic tag shown above the visual next to the step count, e.g. "Logging". */
  label?: string;
  body: string;
  /** Numbered actions. Use the exact button labels from the real UI. */
  how?: string[];
  /** Only show this step to viewers holding this role (see FlowGuide `roles`). Omit for everyone. */
  role?: string;
  beta?: boolean;
  visual: ReactNode;
}

export interface WalkthroughDef {
  /** Stable id, also the localStorage key suffix. Never rename once shipped. */
  id: string;
  /** Screen reader label for the dialog. */
  title: string;
  /** Label for the last step's button. */
  finishLabel?: string;
  steps: WalkthroughStep[];
}

export const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const PILL =
  "inline-flex items-center gap-2 h-11 rounded-full bg-zinc-900 ring-1 ring-white/10 text-sm font-semibold shadow-lg";

export function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="w-full h-28 rounded-2xl bg-zinc-800/60 ring-1 ring-white/5 flex items-center justify-center gap-3 overflow-hidden">
      {children}
    </div>
  );
}

export function Chip({ children, on }: { children: ReactNode; on?: boolean }) {
  return (
    <span
      className={`px-3 h-8 inline-flex items-center rounded-full text-xs font-semibold ${
        on ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-zinc-300 ring-1 ring-white/10"
      }`}
    >
      {children}
    </span>
  );
}

export function Arrow() {
  return (
    <svg className="w-4 h-4 text-zinc-500" {...svgProps}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** A filled action button, for "tap this next" visuals. */
export function ActionButton({ children, tone = "sky" }: { children: ReactNode; tone?: "sky" | "violet" | "emerald" | "zinc" }) {
  const tones = {
    sky: "bg-sky-600 text-white",
    violet: "bg-violet-600 text-white",
    emerald: "bg-emerald-600 text-white",
    zinc: "bg-zinc-100 text-zinc-900",
  };
  return (
    <span className={`inline-flex items-center h-10 px-5 rounded-full text-sm font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** A round map-pin style icon. */
export function PinDot({ children, tone = "sky" }: { children: ReactNode; tone?: "sky" | "amber" | "emerald" | "rose" }) {
  const tones = {
    sky: "bg-sky-500/20 ring-sky-400/60",
    amber: "bg-amber-500/20 ring-amber-400/60",
    emerald: "bg-emerald-500/20 ring-emerald-400/60",
    rose: "bg-rose-500/20 ring-rose-400/60",
  };
  return (
    <span className={`flex items-center justify-center w-10 h-10 rounded-full ring-2 text-lg ${tones[tone]}`}>{children}</span>
  );
}
