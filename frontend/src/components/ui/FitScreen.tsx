"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const MIN_PX = 320; // never shorter than this on tiny screens
const MAX_PX = 768; // or taller than this on huge ones (48rem)
const GAP_PX = 12; // breathing room between the last card and the bottom nav

/**
 * First-screen frame for map pages: fills the space left under the app header, page title and tabs
 * and above the mobile bottom nav, so a flex-1 child (the map) takes whatever room remains and
 * shrink-0 siblings (the call-to-action buttons) stay visible without scrolling.
 *
 * The height is measured on the device (where this frame starts inside the scroll area, and how tall the
 * real bottom nav is, safe-area included) instead of guessed with a fixed rem offset, which cut the last
 * row of buttons off behind the nav on phones with a home indicator. Until it measures (first paint,
 * no JS) it falls back to a CSS estimate that already subtracts the published --bottom-nav-h.
 */
export default function FitScreen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scroller = document.getElementById("app-scroll-container");
    const measure = () => {
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bottom-nav-h")) || 0;
      const sc = scroller?.getBoundingClientRect();
      const scTop = sc?.top ?? 0;
      // Distance from the top of the visible area to the top of this frame, independent of current scroll.
      const topInView = el.getBoundingClientRect().top - scTop + (scroller?.scrollTop ?? 0);
      const visibleBottom = (window.visualViewport?.height ?? window.innerHeight) - navH - scTop;
      const next = Math.round(Math.min(MAX_PX, Math.max(MIN_PX, visibleBottom - topInView - GAP_PX)));
      setH((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    if (scroller) ro.observe(scroller);
    const nav = document.querySelector("nav.fixed, nav[class*='fixed']");
    if (nav) ro.observe(nav);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    // The nav and header publish their heights after hydration, so measure once more a beat later.
    const t = window.setTimeout(measure, 300);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="mb-6 flex min-h-[20rem] max-h-[48rem] flex-col gap-3 h-[calc(100dvh-11.5rem-var(--bottom-nav-h))] sm:h-[calc(100dvh-16rem)]"
      style={h != null ? { height: h } : undefined}
    >
      {children}
    </div>
  );
}
