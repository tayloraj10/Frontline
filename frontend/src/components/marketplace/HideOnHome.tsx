"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The Earn job board already shows the active job in full, so the banner only appears on the other screens. */
export default function HideOnHome({ children }: { children: ReactNode }) {
  const path = usePathname();
  return path === "/earn" ? null : <>{children}</>;
}
