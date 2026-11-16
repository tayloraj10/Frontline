"use client";

import { Smartphone } from "lucide-react";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/components/AppPromoCard";

/** Shown wherever field work is locked to the phone app. */
export default function FieldAppNotice({ what = "job" }: { what?: "job" | "site" }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm font-bold text-amber-200">
        <Smartphone className="size-4" aria-hidden /> Open the Frontline app on your phone to do this {what}
      </p>
      <p className="text-xs text-zinc-300">
        Photos, starting and finishing happen in the app, so your location and {what === "job" ? "route are" : "photos are"} verified. You can take it from here, then switch to your phone when you head out.
      </p>
      <div className="flex gap-3 text-xs font-semibold">
        <a className="underline text-amber-200" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">App Store</a>
        <a className="underline text-amber-200" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">Google Play</a>
      </div>
    </div>
  );
}
