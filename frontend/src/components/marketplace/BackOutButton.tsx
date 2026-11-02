"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { mk } from "@/lib/marketplace";

/** Lets the cleaner give a job back before starting it. Board jobs return to the board. */
export default function BackOutButton({ jobId, direct, onDone }: { jobId: string; direct: boolean; onDone?: () => Promise<void> | void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function backOut() {
    setBusy(true);
    setError(null);
    try {
      await mk(`/jobs/${jobId}/cancel`, { method: "POST", body: { reason: "The cleaner backed out" } });
      if (onDone) await onDone();
      else router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (!open)
    return (
      <Button variant="destructive" className="w-full" onClick={() => setOpen(true)}>
        Back out of this job
      </Button>
    );
  return (
    <div className="space-y-2 rounded-2xl bg-red-500/10 p-3 ring-1 ring-inset ring-red-500/30">
      <p className="text-sm text-zinc-200">
        {direct ? "The customer is told and refunded." : "The job goes back on the board and the customer is refunded."} Backing out after
        the start time counts as a strike.
      </p>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="destructive" loading={busy} onClick={backOut}>
          Yes, back out
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
          Keep the job
        </Button>
      </div>
    </div>
  );
}
