"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full min-h-12 rounded-2xl bg-zinc-800 px-4 py-3 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 ring-1 ring-inset ring-white/5 focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-shadow";

/** Label + optional hint + error wrapper for a single form control. */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-200">{label}</span>
        {optional && <span className="text-[11px] text-zinc-500">Optional</span>}
      </span>
      {children}
      {hint && !error && <span className="text-xs text-zinc-500 leading-snug">{hint}</span>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "resize-none", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(CONTROL, "appearance-none pr-11 truncate", className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 8l5 5 5-5" />
      </svg>
    </div>
  );
}

/** Pill-style single choice, e.g. Walk / Bike / Drive or Small / Large. */
export function ChoiceChips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null;
  options: { value: T; label: string; icon?: React.ReactNode; activeClass?: string; idleClass?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full text-sm font-semibold active:scale-[0.96] transition-[background-color,color,transform] duration-150 touch-manipulation",
            value === o.value
              ? (o.activeClass ?? "bg-zinc-100 text-zinc-900")
              : (o.idleClass ?? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Plus / minus counter, much easier than a number input on a phone. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const btn =
    "w-12 h-12 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xl font-bold text-zinc-100 active:scale-[0.92] disabled:opacity-30 disabled:pointer-events-none transition-[background-color,transform] duration-150 touch-manipulation";
  return (
    <div className="flex items-center justify-between rounded-2xl bg-zinc-800/60 px-3 py-2 ring-1 ring-inset ring-white/5">
      <span className="text-sm font-semibold text-zinc-200 pl-1">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`Fewer ${label}`} className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          -
        </button>
        <span className="w-8 text-center text-lg font-black tabular-nums text-zinc-100">{value}</span>
        <button type="button" aria-label={`More ${label}`} className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}

/** Informational callout used inside flows (replaces the ad hoc colored boxes). */
export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "good"; children: React.ReactNode }) {
  const tones = {
    info: "bg-sky-500/10 text-sky-200 ring-sky-500/20",
    warn: "bg-amber-500/10 text-amber-200 ring-amber-500/20",
    good: "bg-emerald-500/10 text-emerald-200 ring-emerald-500/20",
  } as const;
  return <div className={cn("rounded-2xl px-4 py-3 text-xs leading-relaxed ring-1 ring-inset", tones[tone])}>{children}</div>;
}
