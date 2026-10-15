"use client";

import { useEffect, useState } from "react";
import BodyPortal from "@/components/ui/BodyPortal";
import { PRIMER_EVENT, snoozePrimer, type PrimerRequest } from "@/lib/permissionPrimer";

/**
 * Plain-language heads-up shown right before the phone's own notification prompt, so the
 * system dialog is not the first the user hears of it. Mounted by NativeAppBridge.
 */
export default function NotificationPrimer() {
  const [request, setRequest] = useState<PrimerRequest | null>(null);

  useEffect(() => {
    const onRequest = (e: Event) => {
      e.preventDefault();
      setRequest((e as CustomEvent<PrimerRequest>).detail);
    };
    window.addEventListener(PRIMER_EVENT, onRequest);
    return () => window.removeEventListener(PRIMER_EVENT, onRequest);
  }, []);

  if (!request) return null;

  const answer = (accepted: boolean) => {
    if (!accepted) snoozePrimer();
    request.respond(accepted);
    setRequest(null);
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="notif-primer-title">
        <div className="w-full max-w-sm rounded-3xl bg-zinc-900 ring-1 ring-white/10 p-6 space-y-4 text-center pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="text-4xl" aria-hidden="true">🔔</div>
          <h2 id="notif-primer-title" className="font-display text-lg font-extrabold text-zinc-100">Want a heads-up?</h2>
          <p className="text-sm text-zinc-400">
            We can let you know about nearby events, reward activity and updates from your groups. Your phone will ask you to confirm next.
          </p>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => answer(true)} className="min-h-12 rounded-full bg-emerald-400 text-emerald-950 font-bold text-sm touch-manipulation active:scale-[0.97] transition-transform">
              Turn on notifications
            </button>
            <button type="button" onClick={() => answer(false)} className="min-h-12 rounded-full bg-zinc-800 text-zinc-200 font-semibold text-sm touch-manipulation active:scale-[0.97] transition-transform">
              Not now
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
