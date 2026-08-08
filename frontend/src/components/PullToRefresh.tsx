"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isNativePlatform } from "@/lib/capacitor";

const PULL_THRESHOLD = 70;
const MAX_PULL = 120;

// Native-only pull-to-refresh for the app's scrollable content container
// (#app-scroll-container in layout.tsx). The WebView has no built-in gesture
// for this, and server-rendered data (e.g. AppHeader's points display) only
// refetches on a real navigation, so this fills the gap with router.refresh().
export default function PullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isNativePlatform()) return;
    const container = document.getElementById("app-scroll-container");
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      if (container.scrollTop > 0) { startYRef.current = null; return; }
      // Map panning also starts at scrollTop 0 since the map isn't part of
      // the outer scroll flow — without this, dragging down on the map
      // fires the pull-to-refresh gesture instead of panning it.
      if ((e.target as Element)?.closest?.("[data-map-container]")) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) { setPullDistance(0); return; }
      setPullDistance(Math.min(delta, MAX_PULL));
    };

    const onTouchEnd = () => {
      if (startYRef.current === null) return;
      startYRef.current = null;
      if (pullDistance >= PULL_THRESHOLD && !refreshing) {
        setRefreshing(true);
        router.refresh();
        setTimeout(() => { setRefreshing(false); setPullDistance(0); }, 600);
      } else {
        setPullDistance(0);
      }
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pullDistance, refreshing]);

  if (!isNativePlatform() || pullDistance === 0) return null;

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);

  return (
    <div
      className="flex items-center justify-center overflow-hidden shrink-0"
      style={{ height: pullDistance }}
    >
      <svg
        className={`w-5 h-5 text-zinc-400 ${refreshing ? "animate-spin" : ""}`}
        style={{ transform: refreshing ? undefined : `rotate(${progress * 180}deg)`, opacity: progress }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    </div>
  );
}
