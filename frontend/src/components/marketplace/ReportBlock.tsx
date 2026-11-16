"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { Field, Select, TextArea } from "@/components/ui/fields";
import { mk } from "@/lib/marketplace";

/** Report and block controls (required for app store user-generated-content and services policy). */
export default function ReportBlock({
  userId, jobId, siteLabel, name, role,
}: {
  userId: string;
  jobId?: string;
  /** For a sponsored site: there is no job to attach, so the site name is added to the report instead. */
  siteLabel?: string;
  /** Username of the person being reported or blocked. */
  name?: string | null;
  /** How they relate to this page, such as "customer" or "cleaner". */
  role?: string;
}) {
  const who = name ? `${name}${role ? ` (the ${role})` : ""}` : role ? `the ${role}` : "this user";
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"safety" | "abuse" | "other">("safety");
  const [details, setDetails] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  async function report() {
    setBusy(true);
    try {
      await mk("/reports", { method: "POST", body: { job_id: jobId ?? null, reported_user_id: userId, kind, details: siteLabel ? `[Sponsored site: ${siteLabel}] ${details}` : details } });
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
    setConfirmBlock(false);
    try {
      await mk("/blocks", { method: "POST", body: { user_id: userId } });
      setNote(`Blocked ${who}.`);
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  return (
    <div className="space-y-3 border-t border-zinc-800 pt-4">
      <p className="text-xs text-zinc-500">
        Problem with {who}?{jobId ? " A report is sent to our team along with this job." : siteLabel ? " A report is sent to our team along with this site." : ""}
      </p>
      <div className="flex gap-4 text-xs font-semibold">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
          Report
        </button>
        <button type="button" onClick={() => setConfirmBlock(true)} className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
          Block
        </button>
      </div>
      {confirmBlock && (
        <div className="space-y-2 rounded-2xl bg-red-500/10 p-3 ring-1 ring-inset ring-red-500/30">
          <p className="text-sm text-zinc-200">Block {who}? You will no longer see each other&apos;s listings or be able to message.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="destructive" onClick={block}>Yes, block</Button>
            <Button variant="secondary" onClick={() => setConfirmBlock(false)}>Cancel</Button>
          </div>
        </div>
      )}
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
