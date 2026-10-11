"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV_START_EVENT } from "@/lib/navigationProgress";

// If a navigation never commits (offline, error boundary, same-route no-op),
// the bar must not hang forever.
const SAFETY_TIMEOUT_MS = 10000;

type Phase = "idle" | "loading" | "done";

function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const [phase, setPhase] = useState<Phase>("idle");
  const lastRouteKey = useRef(routeKey);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Navigation committed → finish the bar, then fade it out.
  useEffect(() => {
    if (lastRouteKey.current === routeKey) return;
    lastRouteKey.current = routeKey;
    clearTimeout(safetyTimer.current);
    setPhase("done");
    doneTimer.current = setTimeout(() => setPhase("idle"), 300);
  }, [routeKey]);

  useEffect(() => {
    const start = () => {
      clearTimeout(doneTimer.current);
      clearTimeout(safetyTimer.current);
      setPhase("loading");
      safetyTimer.current = setTimeout(() => setPhase("idle"), SAFETY_TIMEOUT_MS);
    };

    // Capture phase + no defaultPrevented check: next/link's own onClick calls
    // preventDefault, and we still want to react to those clicks.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener(NAV_START_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(NAV_START_EVENT, start);
      clearTimeout(safetyTimer.current);
      clearTimeout(doneTimer.current);
    };
  }, []);

  if (phase === "idle") return null;

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div
          className={`h-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)] ${
            phase === "loading" ? "nav-progress-loading" : "nav-progress-done"
          }`}
        />
      </div>
      {/* Phone-sized screens only: a thin bar is easy to miss there. Fades in
          after a short delay so fast navigations never flash a spinner. */}
      {phase === "loading" && (
        <div
          aria-hidden="true"
          className="sm:hidden pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
        >
          <div className="nav-spinner-in rounded-full bg-zinc-900/90 border border-zinc-800 p-3 shadow-elevation-3">
            <div className="w-7 h-7 border-[3px] border-zinc-700 border-t-emerald-400 rounded-full animate-spin" />
          </div>
        </div>
      )}
    </>
  );
}

export default function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <ProgressBar />
    </Suspense>
  );
}
