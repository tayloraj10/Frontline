"use client";

import { useCallback, useEffect, useState } from "react";
import { usePhotoViewer } from "@/components/marketplace/usePhotoViewer";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, TextArea, TextInput } from "@/components/ui/fields";
import { Section } from "@/components/ui/PageShell";
import { JOB_TYPE_LABELS, STATUS_LABELS, TIME_MODE_LABELS, mk, usd, whenLabel, type Job } from "@/lib/marketplace";
import CleanerFlow, { type FlowPhoto } from "./CleanerFlow";
import ReportBlock from "./ReportBlock";

type Message = { id: string; sender_id: string; username: string | null; body: string; created_at: string };
type Photo = FlowPhoto;

const HOLD_LABEL: Record<string, string> = {
  none: "No payment held yet",
  held: "Payment held until the job is confirmed",
  released: "Payment released to the cleaner",
  refunded: "Payment refunded",
};

export default function JobDetail({ initial, userId }: { initial: Job; userId: string }) {
  const [job, setJob] = useState(initial);
  const [messages, setMessages] = useState<Message[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);

  const role = job.viewer_role ?? "viewer";
  const participant = role === "customer" || role === "cleaner";

  const load = useCallback(async () => {
    const j = await mk<Job>(`/jobs/${initial.id}`);
    const isPart = j.viewer_role === "customer" || j.viewer_role === "cleaner";
    const [m, p] = await Promise.all([
      isPart ? mk<Message[]>(`/jobs/${initial.id}/messages`) : Promise.resolve([] as Message[]),
      isPart ? mk<Photo[]>(`/jobs/${initial.id}/photos`) : Promise.resolve([] as Photo[]),
    ]);
    return { j, m, p };
  }, [initial.id]);

  const refresh = useCallback(async () => {
    try {
      const { j, m, p } = await load();
      setJob(j);
      setMessages(m);
      setPhotos(p);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [load]);

  useEffect(() => {
    let live = true;
    load()
      .then(({ j, m, p }) => {
        if (!live) return;
        setJob(j);
        setMessages(m);
        setPhotos(p);
        })
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [load]);

  async function act(key: string, path: string, body: unknown = {}) {
    setBusy(key);
    setError(null);
    try {
      await mk(path, { method: "POST", body });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const s = STATUS_LABELS[job.status] ?? { label: job.status, tone: "neutral" as const };
  const other = role === "customer" ? job.cleaner_username : job.customer_username;
  const otherId = role === "customer" ? job.cleaner_id : job.customer_id;
  const active = ["accepted", "in_progress"].includes(job.status);

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-zinc-50">{job.title}</h1>
          <Badge variant={s.tone}>{s.label}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{JOB_TYPE_LABELS[job.job_type] ?? job.job_type}</Badge>
          <Badge variant="info">{TIME_MODE_LABELS[job.time_mode]}</Badge>
          {job.size && <Badge>{job.size}</Badge>}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Info label="When" value={whenLabel(job) || "To be agreed"} />
          <Info label="Price" value={`${usd(job.price_cents)}${job.price_type === "hourly" ? "/hr" : " fixed"}`} />
          <Info label="Location" value={job.address_label ?? "Shared once a cleaner is assigned"} />
          <Info label={role === "customer" ? "Cleaner" : "Customer"} value={other ?? "Not assigned yet"} />
        </dl>
        {job.description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{job.description}</p>}
        {job.listing_photos && job.listing_photos.length > 0 && (
          <ListingPhotos urls={job.listing_photos} />
        )}
        {participant && job.location_flagged && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            The cleaner&apos;s location did not match the job site, so our team will review this job.
          </p>
        )}
        <p className="text-xs text-zinc-500">{HOLD_LABEL[job.hold_status] ?? job.hold_status}</p>
      </Card>

      {error && <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      <Actions job={job} role={role} busy={busy} act={act} photos={photos} refresh={refresh} />

      {role === "customer" && job.status === "open" && (job.price_flag_count ?? 0) > 0 && (
        <PriceFlags job={job} busy={busy} act={act} />
      )}

      {participant && ["confirmed", "released"].includes(job.status) && !reviewed && (
        <ReviewForm
          jobId={job.id}
          who={other ?? "them"}
          onDone={() => {
            setReviewed(true);
          }}
        />
      )}

      {participant && (
        <Section title="Photos">
          <Photos photos={photos} />
        </Section>
      )}

      {participant && (
        <Section title="Messages" description="Keep the conversation in the app. Contact details stay private.">
          <Messages jobId={job.id} messages={messages} userId={userId} onSent={refresh} canSend={job.status !== "cancelled" && job.status !== "declined"} />
        </Section>
      )}

      {participant && active && (
        <Card className="space-y-2 border border-red-500/20">
          <p className="text-sm font-bold text-zinc-100">Something wrong?</p>
          <p className="text-xs text-zinc-400">If anyone is in danger, call emergency services first.</p>
          <a href="tel:911" className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-red-500/15 px-5 text-sm font-bold text-red-300 ring-1 ring-inset ring-red-500/30">
            Call 911
          </a>
        </Card>
      )}

      {participant && otherId && <ReportBlock userId={otherId} jobId={job.id} />}
    </div>
  );
}

function PriceFlags({ job, busy, act }: { job: Job; busy: string | null; act: (key: string, path: string, body?: unknown) => Promise<void> }) {
  const [price, setPrice] = useState(job.price_suggested_cents ? String(job.price_suggested_cents / 100) : "");
  const n = job.price_flag_count ?? 0;
  return (
    <Card className="space-y-3 border border-amber-500/30">
      <p className="text-sm font-bold text-amber-200">
        {n} {n === 1 ? "cleaner says" : "cleaners say"} this price is too low
      </p>
      {job.price_suggested_cents && <p className="text-sm text-zinc-300">Highest suggestion: {usd(job.price_suggested_cents)}</p>}
      {job.price_flag_notes && job.price_flag_notes.length > 0 && (
        <ul className="space-y-1 text-sm text-zinc-400">
          {job.price_flag_notes.map((t, i) => (
            <li key={i}>&ldquo;{t}&rdquo;</li>
          ))}
        </ul>
      )}
      <Field label="New price ($)" hint="Changing the price clears these flags.">
        <TextInput inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Button className="w-full" disabled={!(Number(price) > 0)} loading={busy === "price"} onClick={() => act("price", `/jobs/${job.id}/price`, { price_cents: Math.round(Number(price) * 100) })}>
        Update price
      </Button>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="truncate text-zinc-200">{value}</dd>
    </div>
  );
}

function Actions({
  job,
  role,
  busy,
  act,
  photos,
  refresh,
}: {
  job: Job;
  role: "customer" | "cleaner" | "viewer";
  busy: string | null;
  act: (key: string, path: string, body?: unknown) => Promise<void>;
  photos: Photo[];
  refresh: () => Promise<void>;
}) {
  const [ack, setAck] = useState(false);
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState("");
  const [showFlag, setShowFlag] = useState(false);
  const [details, setDetails] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [reason, setReason] = useState("");
  const base = `/jobs/${job.id}`;

  const safety = (
    <label className="flex items-start gap-3 text-sm text-zinc-200">
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-emerald-400" checked={ack} onChange={(e) => setAck(e.target.checked)} />
      <span>I checked the site for hazards and can do this work safely.</span>
    </label>
  );

  // Cleaner receiving a direct request
  if (role === "cleaner" && job.status === "requested") {
    return (
      <Card className="space-y-3">
        {safety}
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!ack} loading={busy === "accept"} onClick={() => act("accept", `${base}/accept`, { safety_ack: ack })}>
            Accept
          </Button>
          <Button variant="secondary" loading={busy === "decline"} onClick={() => act("decline", `${base}/decline`)}>
            Decline
          </Button>
        </div>
      </Card>
    );
  }

  // Anyone else viewing an open board job can take it at the posted price, or flag the price as too low
  if (role === "viewer" && job.status === "open") {
    const unit = job.price_type === "hourly" ? "/hr" : "";
    return (
      <Card className="space-y-3">
        <p className="text-sm font-bold text-zinc-100">Take this job at {usd(job.price_cents)}{unit}</p>
        {safety}
        <Button className="w-full" disabled={!ack} loading={busy === "take"} onClick={() => act("take", `${base}/take`, { safety_ack: ack })}>
          Take this job
        </Button>
        <p className="text-xs text-zinc-500">You need a cleaner profile and a signed agreement. The exact address unlocks once you take it.</p>
        {job.price_flagged_by_me ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">You flagged this price as too low. The poster has been told.</p>
        ) : (
          <div className="border-t border-zinc-800 pt-3">
            <button
              type="button"
              onClick={() => setShowFlag((v) => !v)}
              className="min-h-11 text-sm font-semibold text-amber-300 touch-manipulation"
            >
              {showFlag ? "Cancel" : "Price too low?"}
            </button>
            {showFlag && (
              <div className="space-y-3 pt-1">
                <Field label="What would be fair? ($)" optional>
                  <TextInput inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                </Field>
                <Field label="Note" optional>
                  <TextArea rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={300} />
                </Field>
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={busy === "flag"}
                  onClick={() => act("flag", `${base}/price-flag`, { suggested_price_cents: Number(price) > 0 ? Math.round(Number(price) * 100) : null, note: msg || null })}
                >
                  Flag price as too low
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    );
  }

  if (role === "cleaner" && ["accepted", "in_progress", "completed", "confirmed", "released"].includes(job.status)) {
    return (
      <div className="space-y-3">
        <CleanerFlow job={job} photos={photos} refresh={refresh} />
        {job.status === "accepted" && <CancelRow busy={busy} act={act} base={base} reason={reason} setReason={setReason} />}
      </div>
    );
  }

  if (role === "customer" && ["requested", "open"].includes(job.status)) {
    return (
      <Card className="space-y-3">
        <CancelRow busy={busy} act={act} base={base} reason={reason} setReason={setReason} />
      </Card>
    );
  }

  if (role === "customer" && job.status === "accepted") {
    return (
      <Card className="space-y-3">
        <p className="text-sm text-zinc-300">Your cleaner is booked. Payment is held until you confirm the finished work.</p>
        <CancelRow busy={busy} act={act} base={base} reason={reason} setReason={setReason} />
      </Card>
    );
  }

  if (role === "customer" && job.status === "completed") {
    return (
      <Card className="space-y-3">
        <p className="text-sm text-zinc-300">
          The cleaner marked this done. Check the photos, then confirm to release payment.
          {job.release_after ? ` It releases automatically on ${new Date(job.release_after).toLocaleDateString()} if there is no dispute.` : ""}
        </p>
        <Button className="w-full" loading={busy === "confirm"} onClick={() => act("confirm", `${base}/confirm`)}>
          Confirm and release payment
        </Button>
        {!showDispute ? (
          <Button variant="destructive" className="w-full" onClick={() => setShowDispute(true)}>
            Report a problem
          </Button>
        ) : (
          <div className="space-y-2">
            <TextArea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What went wrong?" />
            <Button
              variant="destructive"
              className="w-full"
              disabled={details.trim().length < 3}
              loading={busy === "dispute"}
              onClick={() => act("dispute", `${base}/dispute`, { details })}
            >
              Open a dispute (payment stays held)
            </Button>
          </div>
        )}
      </Card>
    );
  }

  if (job.status === "disputed") {
    return <Card className="text-sm text-zinc-300">This job is in dispute. Our team is reviewing the photos and messages. Payment stays held until it is resolved.</Card>;
  }

  return null;
}

function CancelRow({
  busy,
  act,
  base,
  reason,
  setReason,
}: {
  busy: string | null;
  act: (key: string, path: string, body?: unknown) => Promise<void>;
  base: string;
  reason: string;
  setReason: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
        Cancel this job
      </button>
    );
  return (
    <div className="space-y-2">
      <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" />
      <Button variant="destructive" className="w-full" loading={busy === "cancel"} onClick={() => act("cancel", `${base}/cancel`, { reason: reason || null })}>
        Confirm cancel
      </Button>
    </div>
  );
}

function ListingPhotos({ urls }: { urls: string[] }) {
  const { open, viewer } = usePhotoViewer(urls);
  return (
    <>
      <ul className="grid grid-cols-4 gap-2">
        {urls.map((u, i) => (
          <li key={u} className="overflow-hidden rounded-lg bg-zinc-900">
            <button type="button" onClick={() => open(i)} aria-label="Enlarge photo" className="block w-full touch-manipulation">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="The site, from the customer" className="aspect-square w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {viewer}
    </>
  );
}

function Photos({ photos }: { photos: Photo[] }) {
  const { open, viewer } = usePhotoViewer(photos.map((p) => p.url));
  if (photos.length === 0) return <p className="text-sm text-zinc-500">No photos yet.</p>;
  return (
    <>
      <ul className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <li key={p.id} className="relative overflow-hidden rounded-xl bg-zinc-900">
            <button type="button" onClick={() => open(i)} aria-label="Enlarge photo" className="block w-full touch-manipulation">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`${p.kind} photo`} className="aspect-square w-full object-cover" />
            </button>
            <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold capitalize text-zinc-100">{p.kind}</span>
          </li>
        ))}
      </ul>
      {viewer}
    </>
  );
}

function Messages({ jobId, messages, userId, onSent, canSend }: { jobId: string; messages: Message[]; userId: string; onSent: () => Promise<void>; canSend: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await mk(`/jobs/${jobId}/messages`, { method: "POST", body: { body: text } });
      setText("");
      await onSent();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      {messages.length === 0 ? (
        <p className="text-sm text-zinc-500">No messages yet.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li key={m.id} className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.sender_id === userId ? "ml-auto bg-emerald-500/15 text-emerald-100" : "bg-zinc-800 text-zinc-200"}`}>
              {m.sender_id !== userId && <p className="text-[11px] font-semibold text-zinc-500">{m.username}</p>}
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canSend && (
        <div className="flex gap-2">
          <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" maxLength={2000} />
          <Button disabled={!text.trim()} loading={busy} onClick={send}>
            Send
          </Button>
        </div>
      )}
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

function ReviewForm({ jobId, who, onDone }: { jobId: string; who: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await mk(`/jobs/${jobId}/review`, { method: "POST", body: { rating, comment: comment || null } });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-3">
      <p className="font-bold text-zinc-100">How was it with {who}?</p>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className={`h-11 w-11 rounded-xl text-lg font-bold touch-manipulation ${n <= rating ? "bg-amber-400 text-amber-950" : "bg-zinc-800 text-zinc-500"}`}
          >
            {n}
          </button>
        ))}
      </div>
      <TextArea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment" maxLength={1000} />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <Button className="w-full" loading={busy} onClick={submit}>
        Submit review
      </Button>
    </Card>
  );
}
