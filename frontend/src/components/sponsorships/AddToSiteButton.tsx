"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import { Note, TextInput } from "@/components/ui/fields";

/**
 * "Add money to this site" for a funded site or area whose sponsor left it open to
 * additions. Starts a Stripe Checkout for the extra amount; the paid amount is added to the
 * site's balance when the payment clears. Sole-credit sites never render this.
 */
export default function AddToSiteButton({ id, label, autoOpen = false }: { id: string; label: string; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const [dollars, setDollars] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoOpen) {
      setOpen(true);
      boxRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [autoOpen]);

  const go = async () => {
    const cents = Math.round(parseFloat(dollars) * 100);
    if (!cents || cents < 500) {
      setError("The minimum is $5.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sponsored/${id}/top-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: cents,
          success_url: `${window.location.origin}/earn?checkout=success`,
          cancel_url: window.location.href,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(typeof data.detail === "string" ? data.detail : "Could not start checkout");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div ref={boxRef}>
      <Button variant="ghost" className="w-full" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add money to this
      </Button>
      </div>
    );
  }
  return (
    <div ref={boxRef} className="space-y-2 rounded-2xl bg-zinc-900 p-3 ring-1 ring-inset ring-zinc-800">
      <p className="text-xs text-zinc-400">Chip in more for {label}. It goes into the same pot, so more cleanups get paid.</p>
      <TextInput
        type="number"
        inputMode="decimal"
        min="5"
        step="1"
        aria-label="Amount in dollars"
        value={dollars}
        onChange={(e) => setDollars(e.target.value)}
      />
      {error && <Note tone="warn">{error}</Note>}
      <div className="flex gap-2">
        <Button className="flex-1" loading={busy} onClick={go}>
          Add ${dollars || "0"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
