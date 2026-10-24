"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextInput } from "@/components/ui/fields";
import { Section } from "@/components/ui/PageShell";
import { mk, usd } from "@/lib/marketplace";

export type AdminOverview = {
  pending_cleaners: { user_id: string; username: string | null; headline: string; services: string[]; created_at: string }[];
  disputed_jobs: { id: string; title: string; price_cents: number; customer_username: string | null; cleaner_username: string | null; details: string | null }[];
  open_reports: { id: string; kind: string; details: string; job_id: string | null; reporter: string | null; reported: string | null }[];
  held_jobs: number;
  held_cents: number;
};

export default function AdminPanel({ initial }: { initial: AdminOverview }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function run(key: string, path: string, body: unknown) {
    setBusy(key);
    setError(null);
    try {
      await mk(path, { method: "POST", body });
      setData(await mk<AdminOverview>("/admin/overview"));
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3">
        <Card padding="sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Jobs holding funds</p>
          <p className="text-2xl font-extrabold text-zinc-50">{data.held_jobs}</p>
        </Card>
        <Card padding="sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Held total</p>
          <p className="text-2xl font-extrabold text-emerald-300">{usd(data.held_cents)}</p>
        </Card>
      </div>

      {error && <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      <Section title={`Cleaners awaiting approval (${data.pending_cleaners.length})`}>
        {data.pending_cleaners.length === 0 ? (
          <p className="text-sm text-zinc-500">None.</p>
        ) : (
          <ul className="space-y-3">
            {data.pending_cleaners.map((c) => (
              <li key={c.user_id}>
                <Card padding="sm" className="space-y-2">
                  <p className="font-bold text-zinc-100">{c.username ?? "Unknown"}</p>
                  <p className="text-sm text-zinc-400">{c.headline}</p>
                  <p className="text-xs text-zinc-500">{c.services.join(", ")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button loading={busy === c.user_id} onClick={() => run(c.user_id, `/admin/cleaners/${c.user_id}/status`, { status: "active" })}>
                      Approve
                    </Button>
                    <Button variant="destructive" onClick={() => run(c.user_id, `/admin/cleaners/${c.user_id}/status`, { status: "suspended" })}>
                      Suspend
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Disputes (${data.disputed_jobs.length})`} description="Release pays the cleaner. Refund returns the money to the customer.">
        {data.disputed_jobs.length === 0 ? (
          <p className="text-sm text-zinc-500">None.</p>
        ) : (
          <ul className="space-y-3">
            {data.disputed_jobs.map((j) => (
              <li key={j.id}>
                <Card padding="sm" className="space-y-2">
                  <Link href={`/marketplace/jobs/${j.id}`} className="font-bold text-zinc-100 underline-offset-2 hover:underline">
                    {j.title} · {usd(j.price_cents)}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {j.customer_username} hired {j.cleaner_username}
                  </p>
                  {j.details && <p className="text-sm text-zinc-300">{j.details}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <Button loading={busy === `${j.id}r`} onClick={() => run(`${j.id}r`, `/admin/jobs/${j.id}/resolve-dispute`, { outcome: "release" })}>
                      Release
                    </Button>
                    <Button variant="destructive" loading={busy === `${j.id}f`} onClick={() => run(`${j.id}f`, `/admin/jobs/${j.id}/resolve-dispute`, { outcome: "refund" })}>
                      Refund
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Open reports (${data.open_reports.length})`}>
        {data.open_reports.length === 0 ? (
          <p className="text-sm text-zinc-500">None.</p>
        ) : (
          <ul className="space-y-3">
            {data.open_reports.map((r) => (
              <li key={r.id}>
                <Card padding="sm" className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">{r.kind}</p>
                  <p className="text-sm text-zinc-300">{r.details}</p>
                  <p className="text-xs text-zinc-500">
                    From {r.reporter ?? "?"} about {r.reported ?? "?"}
                    {r.job_id && (
                      <>
                        {" "}
                        ·{" "}
                        <Link href={`/marketplace/jobs/${r.job_id}`} className="underline">
                          job
                        </Link>
                      </>
                    )}
                  </p>
                  <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note" />
                  <div className="grid grid-cols-2 gap-2">
                    <Button loading={busy === r.id} onClick={() => run(r.id, `/admin/reports/${r.id}/resolve`, { status: "resolved", resolution: note || null })}>
                      Resolve
                    </Button>
                    <Button variant="secondary" onClick={() => run(r.id, `/admin/reports/${r.id}/resolve`, { status: "dismissed", resolution: note || null })}>
                      Dismiss
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
