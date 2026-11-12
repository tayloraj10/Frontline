import type { ReactNode } from "react";

/**
 * First-screen frame for map pages: fills the space left under the app header, page title and tabs
 * (and above the mobile bottom nav), so a flex-1 child (the map) takes whatever room remains and
 * shrink-0 siblings (the call-to-action buttons) stay visible without scrolling. Never gets
 * shorter than 26rem on tiny screens or taller than 48rem on huge ones.
 */
export default function FitScreen({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex h-[calc(100dvh-16.5rem)] min-h-[26rem] max-h-[48rem] flex-col gap-3 sm:h-[calc(100dvh-16rem)]">
      {children}
    </div>
  );
}
