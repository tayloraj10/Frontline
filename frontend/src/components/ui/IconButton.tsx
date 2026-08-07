"use client";

import type { ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** "md" (44px) meets the mobile tap-target minimum; "sm" (36px) is for dense inline lists only. */
  size?: "sm" | "md";
}

/**
 * Icon-only button with a guaranteed minimum tap target, independent of the
 * visual icon's size. Replaces bare "×"/SVG icons with no padding, which were
 * hard to hit with a finger.
 */
export default function IconButton({ size = "md", className = "", children, ...props }: IconButtonProps) {
  const sizeCls = size === "sm" ? "w-9 h-9" : "w-11 h-11";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center ${sizeCls} shrink-0 rounded-full ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
