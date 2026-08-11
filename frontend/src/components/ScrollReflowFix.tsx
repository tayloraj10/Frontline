"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isNativePlatform } from "@/lib/capacitor";

// WKWebView occasionally mis-computes #app-scroll-container's scrollable
// height on first paint (safe-area/dynamic-toolbar math can be slightly off)
// and never rechecks, leaving a page that visually overflows but won't
// scroll — until some later DOM change forces a reflow. Nudge it ourselves
// on mount and on every route change so pages are scrollable immediately.
export default function ScrollReflowFix() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isNativePlatform()) return;
    const el = document.getElementById("app-scroll-container");
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.overflowY = "hidden";
      void el.offsetHeight;
      el.style.overflowY = "auto";
    });
  }, [pathname]);

  return null;
}
