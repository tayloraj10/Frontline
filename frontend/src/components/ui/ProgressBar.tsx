import { cn } from "@/lib/cn";

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  label?: string;
  className?: string;
  tone?: "accent" | "points";
}

/** Thin rounded progress track used for weekly goals, next-reward progress, and event capacity. */
export default function ProgressBar({ value, label, className, tone = "accent" }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-zinc-800", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", tone === "points" ? "bg-amber-400" : "bg-emerald-400")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
