"use client";

import { useEffect, useState } from "react";

/** Matches Tailwind's default `sm` breakpoint (640px) so JS branching stays in sync with `sm:` classes. */
const MOBILE_BREAKPOINT_QUERY = "(max-width: 639px)";

/** SSR-safe: reports `false` until mounted, then tracks the viewport live. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    setIsMobile(mql.matches);
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

/** True for touch-primary devices (phones/tablets), regardless of viewport width. */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(pointer: coarse)");
    setIsTouch(mql.matches || window.innerWidth < 640);
    const handleChange = (e: MediaQueryListEvent) => setIsTouch(e.matches || window.innerWidth < 640);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isTouch;
}
