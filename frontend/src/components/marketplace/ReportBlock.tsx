"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { Field, Select, TextArea } from "@/components/ui/fields";
import { mk } from "@/lib/marketplace";

/** Report and block controls (required for app store user-generated-content and services policy). */
export default function ReportBlock({ userId, jobId }: { userId: string; jobId?: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"safety" | "abuse" | "other">("safety");
  const [details, setDetails] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function report() {
    setBusy(true);
    try {
      await mk("/reports", { method: "POST", body: { job_id: jobId ?? null, reported_user_id: userId, kind, details } });
      setNote("Thanks. Our team will review this.");
      setOpen(false);
      setDetails("");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function block() {
    if (!window.confirm("Block this user? You will no longer see each other's listings or be able to message.")) return;
    try {
      await mk("/blocks", { method: "POST", body: { user_id: userId } });
      setNote("User blocked.");
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  return (
    <div className="space-y-3 border-t border-zinc-800 pt-4">
      <div className="flex gap-4 text-xs font-semibold">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
          Report
        </button>
        <button type="button" onClick={block} className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
          Block
        </button>
      </div>
      {open && (
        <div className="space-y-3">
          <Field label="What happened?">
            <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="safety">Safety concern</option>
              <option value="abuse">Abuse or harassment</option>
              <option value="other">Something else</option>
            </Select>
          </Field>
          <TextArea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Tell us what happened" />
          <Button variant="secondary" loading={busy} disabled={details.trim().length < 3} onClick={report}>
            Send report
          </Button>
        </div>
      )}
      {note && <p className="text-xs text-zinc-400">{note}</p>}
    </div>
  );
}
