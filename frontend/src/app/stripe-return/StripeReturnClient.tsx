"use client";

import { useEffect, useSyncExternalStore } from "react";

type Mode = "checking" | "in-app" | "mobile-browser" | "desktop";

const subscribe = () => () => {};

function getMode(): Mode {
  const ua = navigator.userAgent;
  if (ua.includes("FrontlineNativeApp")) return "in-app";
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return "mobile-browser";
  return "desktop";
}

// Stripe hosted pages open in the system browser from the native app. This page is where Stripe
// sends people back to: inside the app it just continues, in a phone browser it offers a button
// that hands off to the app, and on desktop it continues on the website.
export default function StripeReturnClient({ next }: { next: string }) {
  const mode = useSyncExternalStore(subscribe, getMode, () => "checking" as Mode);

  useEffect(() => {
    if (mode === "in-app" || mode === "desktop") window.location.replace(next);
  }, [mode, next]);

  const appUrl = `com.frontlinemaps.app://${next.replace(/^\//, "")}`;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-zinc-100">
        {mode === "mobile-browser" ? "All set with Stripe" : "Taking you back to Frontline"}
      </h1>
      {mode === "mobile-browser" && (
        <>
          <p className="text-sm text-zinc-400">Tap below to return to the Frontline app.</p>
          <a
            href={appUrl}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Return to the app
          </a>
        </>
      )}
      <a href={next} className="text-sm text-zinc-400 underline hover:text-zinc-200">
        Continue on the website
      </a>
    </main>
  );
}
