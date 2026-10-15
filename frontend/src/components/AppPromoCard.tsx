"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const DISMISS_KEY = "frontline:app-promo-dismissed-at";
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL ?? "https://apps.apple.com/ca/app/frontline-maps/id6799487822";
// Android isn't published yet: set NEXT_PUBLIC_PLAY_STORE_URL to show its button.
const PLAY_STORE_URL = process.env.NEXT_PUBLIC_PLAY_STORE_URL;

function StoreButton({ href, kicker, label }: { href: string; kicker: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col justify-center min-h-11 px-4 py-1.5 rounded-xl bg-zinc-100 text-zinc-950 hover:bg-white active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
    >
      <span className="text-[10px] leading-none font-medium text-zinc-600">{kicker}</span>
      <span className="font-display text-sm font-bold leading-tight">{label}</span>
    </a>
  );
}

/** Website-only promo for the native apps. Hidden inside the app itself and after a dismissal (30 days). */
export default function AppPromoCard({ className = "" }: { className?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!APP_STORE_URL && !PLAY_STORE_URL) return;
    if (navigator.userAgent.includes("FrontlineNativeApp")) return;
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (at && Date.now() - at < DISMISS_MS) return;
    } catch {
      // storage blocked: show the card
    }
    // Client-only check (UA + localStorage) must run after mount to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
  }, []);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }

  return (
    <aside
      aria-label="Get the Frontline app"
      className={`relative rounded-[24px] bg-zinc-900 p-5 pr-12 flex flex-col gap-4 ${className}`}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss app promo"
        className="absolute top-2 right-2 grid place-items-center w-11 h-11 rounded-full text-zinc-500 hover:text-zinc-200 active:bg-zinc-800 transition-colors duration-150 touch-manipulation"
      >
        <X className="w-4 h-4" />
      </button>
      <div>
        <h2 className="font-display text-lg font-extrabold text-zinc-100">Get the Frontline app</h2>
        <p className="text-sm text-zinc-400 mt-1 max-w-md">
          Log cleanups from the field with your phone camera and GPS, and see your points and rewards at a glance.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {APP_STORE_URL && <StoreButton href={APP_STORE_URL} kicker="Download on the" label="App Store" />}
        {PLAY_STORE_URL && <StoreButton href={PLAY_STORE_URL} kicker="Get it on" label="Google Play" />}
      </div>
    </aside>
  );
}
