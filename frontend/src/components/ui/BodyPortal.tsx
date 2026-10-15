"use client";

import { createPortal } from "react-dom";

/** Renders children into document.body so no parent stacking context can trap a modal under the bottom tab bar (z-40). */
export default function BodyPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
