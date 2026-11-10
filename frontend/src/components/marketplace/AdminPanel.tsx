"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextInput } from "@/components/ui/fields";
import { Section } from "@/components/ui/PageShell";
import { mk, usd } from "@/lib/marketplace";

export type ChatMessage = { id: string; sender_id: string; username: string | null; body: string; created_at: string; flag_reason: string | null; reviewed_at: string | null };

export type AdminOverview = {
  flagged_messages?: { id: string; job_id: string; title: string; body: string; flag_reason: string; sender: string | null; created_at: string }[];
  chats?: { job_id: string; title: string; customer_username: string | null; cleaner_username: string | null; messages: number; last_at: string }[];
  struck_cleaners?: { user_id: string; username: string | null; status: string; strikes: number; last_strike_at: string }[];
  awaiting_release: { id: string; title: string; price_cents: number; release_after: string | null; payment_error: string | null; customer_username: string | null; cleaner_username: string | null }[];
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

      <Section
        title={`Awaiting release (${data.awaiting_release.length})`}
        description="Finished jobs the customer has not confirmed. They pay out on their own after the review window. Release now pays the cleaner immediately."
      >
        {data.awaiting_release.length === 0 ? (
          <p className="text-sm text-zinc-500">None.</p>
        ) : (
          <ul className="space-y-3">
            {data.awaiting_release.map((j) => (
              <li key={j.id}>
                <Card padding="sm" className="space-y-2">
                  <Link href={`/marketplace/jobs/${j.id}`} className="font-bold text-zinc-100 underline-offset-2 hover:underline">
                    {j.title} · {usd(j.price_cents)}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {j.customer_username} hired {j.cleaner_username}
                    {j.release_after ? ` · auto-release ${new Date(j.release_after).toLocaleString()}` : ""}
                  </p>
                  {j.payment_error && <p className="text-sm text-amber-300">Last payment attempt failed: {j.payment_error}</p>}
                  <Button loading={busy === `${j.id}a`} onClick={() => run(`${j.id}a`, `/admin/jobs/${j.id}/release`, {})}>
                    Release now
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

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

      <Section
        title={`Flagged messages (${data.flagged_messages?.length ?? 0})`}
        description="The filter flags abusive language and threats. Contact details and off-app payment are refused before they are sent."
      >
        {!data.flagged_messages?.length ? (
          <p className="text-sm text-zinc-500">None.</p>
        ) : (
          <ul className="space-y-3">
            {data.flagged_messages.map((m) => (
              <li key={m.id}>
                <Card padding="sm" className="space-y-2 border border-amber-500/30">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">{m.flag_reason}</p>
                  <p className="break-words text-sm text-zinc-100">&ldquo;{m.body}&rdquo;</p>
                  <p className="text-xs text-zinc-500">
                    {m.sender} on{" "}
                    <Link href={`/marketplace/jobs/${m.job_id}`} className="underline-offset-2 hover:underline">{m.title}</Link>
                    {" "}· {new Date(m.created_at).toLocaleString()}
                  </p>
                  <Button variant="secondary" loading={busy === m.id} onClick={() => run(m.id, `/admin/messages/${m.id}/review`, {})}>
                    Mark reviewed
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent chats" description="Open any job conversation to read it.">
        {!data.chats?.length ? (
          <p className="text-sm text-zinc-500">No chats yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.chats.map((c) => (
              <ChatRow key={c.job_id} chat={c} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={`Cleaners with strikes (${data.struck_cleaners?.length ?? 0})`}
        description="Strikes come from taking a job and not starting it, or backing out after the start time. Suspended cleaners cannot take jobs."
      >
        {!data.struck_cleaners?.length ? (
          <p className="text-sm text-zinc-500">None.</p>
        ) : (
          <ul className="space-y-3">
            {data.struck_cleaners.map((c) => (
              <li key={c.user_id}>
                <Card padding="sm" className="space-y-2">
                  <p className="font-bold text-zinc-100">
                    {c.username ?? "Unknown"} · {c.strikes} {c.strikes === 1 ? "strike" : "strikes"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {c.status === "suspended" ? "Suspended" : "Active"} · last strike {new Date(c.last_strike_at).toLocaleDateString()}
                  </p>
                  {c.status === "suspended" ? (
                    <Button loading={busy === c.user_id} onClick={() => run(c.user_id, `/admin/cleaners/${c.user_id}/status`, { status: "active" })}>
                      Reinstate
                    </Button>
                  ) : (
                    <Button variant="destructive" loading={busy === c.user_id} onClick={() => run(c.user_id, `/admin/cleaners/${c.user_id}/status`, { status: "suspended" })}>
                      Suspend
                    </Button>
                  )}
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

function ChatRow({ chat }: { chat: NonNullable<AdminOverview["chats"]>[number] }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    setOpen((v) => !v);
    if (!msgs) {
      try {
        setMsgs(await mk<ChatMessage[]>(`/admin/jobs/${chat.job_id}/messages`));
      } catch (e) {
        setErr((e as Error).message);
      }
    }
  }

  return (
    <li>
      <Card padding="sm" className="space-y-2">
        <button type="button" onClick={toggle} className="flex min-h-11 w-full items-start justify-between gap-3 text-left touch-manipulation">
          <span className="min-w-0">
            <span className="block break-words font-bold text-zinc-100">{chat.title}</span>
            <span className="block text-xs text-zinc-500">
              {chat.customer_username} and {chat.cleaner_username ?? "no cleaner"} · {chat.messages} messages · {new Date(chat.last_at).toLocaleString()}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-sky-300">{open ? "Hide" : "Read"}</span>
        </button>
        {open && (
          <div className="space-y-2 border-t border-zinc-800 pt-2">
            {err && <p className="text-xs text-red-400">{err}</p>}
            {msgs?.map((m) => (
              <p key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.flag_reason ? "bg-amber-500/10 text-amber-100" : "bg-zinc-800 text-zinc-200"}`}>
                <span className="block text-[11px] font-semibold text-zinc-500">
                  {m.username} · {new Date(m.created_at).toLocaleString()}
                  {m.flag_reason ? ` · flagged: ${m.flag_reason}` : ""}
                </span>
                <span className="whitespace-pre-wrap break-words">{m.body}</span>
              </p>
            ))}
          </div>
        )}
      </Card>
    </li>
  );
}
