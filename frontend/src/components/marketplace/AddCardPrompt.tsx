"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { mk } from "@/lib/marketplace";

/** Shown before the job form when the customer has no saved card. Stripe hosts the card entry. */
export default function AddCardPrompt({ returnPath }: { returnPath: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await mk<{ url: string }>("/payments/card/setup", {
        method: "POST",
        body: { return_path: returnPath },
      });
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-emerald-300" aria-hidden="true" />
        <p className="font-bold text-zinc-100">Add a payment card</p>
      </div>
      <p className="text-sm text-zinc-400">
        Posting is free. Your card is charged only when a cleaner takes the job, and the money is held until you confirm
        the work. Cancel before the work starts for a full refund.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <Button loading={busy} onClick={start}>
        Add card
      </Button>
    </Card>
  );
}
