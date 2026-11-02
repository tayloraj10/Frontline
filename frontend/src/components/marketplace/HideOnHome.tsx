"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The Hire home already shows the active job in full, so the banner only appears on the other screens. */
export default function HideOnHome({ children }: { children: ReactNode }) {
  return usePathname() === "/marketplace" ? null : <>{children}</>;
}
