"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Field, Note, TextInput } from "@/components/ui/fields";
import { usd, type SponsorshipPool } from "@/lib/sponsorshipPools";

const PRESETS = [500, 1000, 2500, 5000];

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return typeof data?.detail === "string" ? data.detail : fallback;
}

/** Contribute (Stripe Checkout), share, and cancel for one pool. */
export default function PoolActions({ pool }: { pool: SponsorshipPool }) {
  const router = useRouter();
  const [cents, setCents] = useState(1000);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<"pay" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const remaining = pool.goal_cents - pool.raised_cents;
  const base = `/api/sponsorship-pools/${pool.id}`;

  const pay = async () => {
    const amount = custom ? Math.round(parseFloat(custom) * 100) : cents;
    if (!amount || amount < 500) return setError("The minimum contribution is $5.");
    setBusy("pay");
    setError(null);
    try {
      const res = await fetch(`${base}/contribute`, {
        method: "POST",
        body: JSON.stringify({
          amount_cents: amount,
          success_url: `${window.location.origin}/fund/pools/${pool.id}?paid=1`,
          cancel_url: window.location.href,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not start checkout."));
      window.location.assign((await res.json()).url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout.");
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    setError(null);
    const res = await fetch(`${base}/cancel`, { method: "POST" });
    if (!res.ok) setError(await readError(res, "Could not cancel the pool."));
    setBusy(null);
    setConfirmCancel(false);
    router.refresh();
  };

  const share = async () => {
    const url = `${window.location.origin}/fund/pools/${pool.id}`;
    try {
      if (navigator.share) await navigator.share({ title: pool.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  if (pool.status !== "open") return null;
  return (
    <div className="space-y-4">
      {pool.my_contribution_cents ? (
        <Note tone="good">You have put in {usd(pool.my_contribution_cents)}. You can add more.</Note>
      ) : null}
      <Field label="Add to the pool" hint={`${usd(remaining)} still needed. Held by Frontline until the goal is met.`}>
        <div className="flex flex-wrap gap-2">
          {PRESETS.filter((p) => p <= remaining).map((p) => {
            const on = !custom && cents === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setCents(p);
                  setCustom("");
                }}
                className={`min-h-11 rounded-full px-4 text-sm font-bold touch-manipulation active:scale-[0.97] ${
                  on ? "bg-emerald-400 text-emerald-950" : "bg-zinc-800 text-zinc-100"
                }`}
              >
                {usd(p)}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Or enter an amount">
        <TextInput
          inputMode="decimal"
          placeholder="Other amount in dollars"
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </Field>
      {error && <Note tone="warn">{error}</Note>}
      <Button className="w-full" loading={busy === "pay"} onClick={pay}>
        Chip in
      </Button>
      <Button variant="secondary" className="w-full" onClick={share}>
        {copied ? "Link copied" : "Share this pool"}
      </Button>
      {pool.is_creator &&
        (confirmCancel ? (
          <div className="space-y-2">
            <Note tone="warn">Cancelling refunds everyone who has chipped in.</Note>
            <Button variant="destructive" className="w-full" loading={busy === "cancel"} onClick={cancel}>
              Yes, cancel and refund
            </Button>
          </div>
        ) : (
          <Button variant="ghost" className="w-full" onClick={() => setConfirmCancel(true)}>
            Cancel this pool
          </Button>
        ))}
    </div>
  );
}
