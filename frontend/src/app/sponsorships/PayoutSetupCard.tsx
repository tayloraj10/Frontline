"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ActionTile from "@/components/ui/ActionTile";
import { Wallet } from "lucide-react";

type Status = { payouts_enabled: boolean; has_account: boolean };

/**
 * Earn payouts go to the worker's bank through Stripe Connect. Shown until payouts are ready, so
 * nobody finds out after an approval that there is nowhere to send the money.
 * With a groupId it manages the group's payout account instead (group admins only), which a group
 * needs before it can host sponsored events or take direct support.
 */
export default function PayoutSetupCard({
  groupId,
  returnPath,
  tileSibling,
  className = "",
}: {
  groupId?: string;
  returnPath?: string;
  /** When payouts are on, shows the earnings link as a half-width tile with this element beside it. */
  tileSibling?: (wide: boolean) => ReactNode;
  /** Extra classes for the card, e.g. spacing below it. */
  className?: string;
} = {}) {
  const base = groupId ? `/api/sponsored/groups/${groupId}/payouts` : "/api/sponsored/payouts";
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("payouts")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    fetch(`${base}/status`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [base]);

  async function openDashboard() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/dashboard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.detail ?? "Could not open Stripe.");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(returnPath ? { return_path: returnPath } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.detail ?? "Could not open payout setup.");
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!status) {
    return tileSibling ? (
      <div className="grid grid-cols-2 gap-3">
        <ActionTile loading icon={Wallet} title="Earnings and payment info" sub="Checking your payouts..." />
        {tileSibling(false)}
      </div>
    ) : null;
  }

  if (status.payouts_enabled && tileSibling) {
    return (
      <div>
        <div className="grid grid-cols-2 gap-3">
          <ActionTile
            tone="emerald"
            icon={Wallet}
            title="Earnings and payment info"
            sub={busy ? "Opening Stripe..." : "See pay, change bank details."}
            onClick={openDashboard}
            disabled={busy}
          />
          {tileSibling(false)}
        </div>
        <button type="button" onClick={start} disabled={busy} className="mt-2 w-full text-center text-sm font-semibold text-sky-300 hover:text-sky-200">
          Update payment info
        </button>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  if (status.payouts_enabled) {
    return (
      <Card className={`flex items-center justify-between gap-3 ${className}`}>
        <div className="min-w-0">
          <p className="font-bold text-zinc-100">{groupId ? "Group payouts on" : "Payouts are on"}</p>
          <p className="text-sm text-zinc-400">
            {groupId ? "Group rewards are paid to your group's bank through Stripe." : "Rewards are paid to your bank through Stripe."}
          </p>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Button variant="secondary" className="px-4" loading={busy} onClick={openDashboard}>
            See earnings
          </Button>
          <Button variant="secondary" className="px-4" loading={busy} onClick={start}>
            Update payment info
          </Button>
        </div>
      </Card>
    );
  }


  const setupCard = groupId ? (
    <Card className={`space-y-3 border-amber-400/50 bg-amber-400/10 ${className}`}>
      <p className="text-base font-extrabold text-amber-200">
        {status.has_account ? "Finish setting up group payouts" : "Your group needs a payout account"}
      </p>
      <p className="text-sm text-zinc-200">
        Without one, your group cannot host a sponsored event, take direct support or be paid for sponsored cleanups.
        Approved rewards wait until it is set up.
      </p>
      <ol className="space-y-1.5 text-sm text-zinc-200">
        <li className="flex gap-2">
          <span className="font-bold text-amber-300">1.</span>
          <span>Tap the button below. It opens Stripe, our payments partner.</span>
        </li>
        <li className="flex gap-2">
          <span className="font-bold text-amber-300">2.</span>
          <span>Add the bank account your group&apos;s money should go to. It takes a few minutes and you only do it once.</span>
        </li>
        <li className="flex gap-2">
          <span className="font-bold text-amber-300">3.</span>
          <span>You come back here automatically, and this turns green. Any group admin can do it.</span>
        </li>
      </ol>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button loading={busy} onClick={start} className="w-full sm:w-auto">
        {status.has_account ? "Continue setup" : "Set up group payouts"}
      </Button>
    </Card>
  ) : (
    <Card className={`space-y-2 border-sky-400/30 bg-sky-400/5 ${className}`}>
      <p className="font-bold text-zinc-100">{status.has_account ? "Finish setting up payouts" : "Set up payouts to get paid"}</p>
      <p className="text-sm text-zinc-300">
        Rewards are sent to your bank through Stripe. Setup takes a few minutes and you only do it once. Approved rewards
        wait for you until it is done.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button loading={busy} onClick={start} className="w-full sm:w-auto">
        {status.has_account ? "Continue setup" : "Set up payouts"}
      </Button>
    </Card>
  );

  return tileSibling ? (
    <div className="space-y-3">
      {setupCard}
      {tileSibling(true)}
    </div>
  ) : (
    setupCard
  );
}
