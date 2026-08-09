import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const VARIANT_CLASS = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  error: "bg-red-500/15 text-red-400 border-red-500/20",
  info: "bg-sky-500/15 text-sky-400 border-sky-500/20",
  neutral: "bg-zinc-800 text-zinc-400 border-zinc-700",
} as const;

export type BadgeVariant = keyof typeof VARIANT_CLASS;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/** Status pill — replaces the emerald/amber/red/sky/zinc pair copy-pasted at each call site. */
export default function Badge({ variant = "neutral", className = "", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium",
        VARIANT_CLASS[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
