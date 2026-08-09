"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const VARIANT_CLASS = {
  primary: "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 shadow-elevation-2",
  secondary: "bg-zinc-800 text-zinc-100 border border-zinc-700 hover:bg-zinc-700",
  destructive: "bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25",
  ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASS;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows an inline spinner and disables the button, without shifting layout. */
  loading?: boolean;
}

/**
 * Primary interactive control. Bakes in tap-press feedback (active:scale) so
 * call sites don't need to remember it — this is a Capacitor WebView app,
 * every tappable element needs a non-hover feedback state.
 */
export default function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg text-sm font-semibold",
        "transition-[transform,background-color,box-shadow] duration-150 ease-out",
        "active:scale-[0.97] active:duration-100 touch-manipulation",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANT_CLASS[variant],
        className
      )}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
