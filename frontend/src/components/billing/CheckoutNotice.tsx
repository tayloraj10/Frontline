"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Shows a short banner after returning from Stripe Checkout (?checkout=success|cancelled), then clears the flag. */
export default function CheckoutNotice() {
  const router = useRouter();
  const [result, setResult] = useState<"success" | "cancelled" | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("checkout");
    // The Earn tab shows its own message for its return flag.
    if ((flag !== "success" && flag !== "cancelled") || url.pathname.startsWith("/sponsorships")) return;
    url.searchParams.delete("checkout");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    const show = setTimeout(() => setResult(flag), 0);
    const hide = setTimeout(() => setResult(null), 8000);
    if (flag === "success") router.refresh();
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [router]);

  if (!result) return null;
  const ok = result === "success";
  return (
    <p
      role="status"
      className={`fixed inset-x-4 top-[calc(4rem+env(safe-area-inset-top))] z-50 mx-auto max-w-md rounded-2xl px-4 py-3 text-center text-sm font-semibold shadow-elevation-3 ring-1 ring-inset ${
        ok ? "bg-emerald-950 text-emerald-200 ring-emerald-400/40" : "bg-zinc-900 text-zinc-300 ring-zinc-700"
      }`}
    >
      {ok ? "Thank you! Your payment went through." : "Checkout cancelled. You were not charged."}
    </p>
  );
}
