"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { FUND_TAB_LABEL } from "@/lib/rewardsLabels";
import { FUND_ORIGIN_KEY } from "./BackOriginTracker";

/** Where the back link goes when we know the visitor came from elsewhere (see BackOriginTracker). */
function labelFor(path: string): string {
  if (path.startsWith("/earn")) return "Earn";
  if (path === "/fund" || path.startsWith("/fund?")) return FUND_TAB_LABEL;
  if (path.startsWith("/impact")) return "Impact";
  if (path.startsWith("/groups")) return "Groups";
  return "Back";
}

/** The Fund home owns its actions; every other Fund screen just gets a way back to where the visitor came from. */
export default function MarketplaceNav() {
  const pathname = usePathname();
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(FUND_ORIGIN_KEY);
      // Same-site paths only, and never a /fund detail page (that would loop).
      setOrigin(saved && saved.startsWith("/") && !saved.startsWith("//") && !saved.startsWith("/fund/") ? saved : null);
    } catch {
      setOrigin(null);
    }
  }, [pathname]);
  if (pathname === "/fund") return null;
  const href = origin ?? "/fund";
  return (
    <Link
      href={href}
      className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 text-sm font-semibold text-zinc-400 touch-manipulation hover:text-zinc-100 active:scale-[0.97]"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {origin ? labelFor(origin) : FUND_TAB_LABEL}
    </Link>
  );
}
