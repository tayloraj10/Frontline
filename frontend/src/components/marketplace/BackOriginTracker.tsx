"use client";

import { useEffect } from "react";

export const FUND_ORIGIN_KEY = "frontline:fund-origin";

/**
 * Remembers which page a visitor left to open a /fund detail page (a job, a cleaner), so its back link
 * can return there (Earn with its filter, the Fund home) instead of always going to Fund.
 * Only a tap on a link is recorded; moving around inside the detail pages keeps the first origin.
 */
export default function BackOriginTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      let to: URL;
      try {
        to = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (to.origin !== window.location.origin || !to.pathname.startsWith("/fund/")) return;
      const here = window.location.pathname;
      if (here.startsWith("/fund/")) return; // already inside the detail pages: keep the earlier origin
      try {
        sessionStorage.setItem(FUND_ORIGIN_KEY, here + window.location.search);
      } catch {}
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
