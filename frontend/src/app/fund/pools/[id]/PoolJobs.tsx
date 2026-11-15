"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Note } from "@/components/ui/fields";
import { Card } from "@/components/ui/Card";
import { daysLeft, usd, type PoolJob, type SponsorshipPool } from "@/lib/sponsorshipPools";

const JOB_LABEL: Record<string, string> = {
  open: "On the board",
  requested: "Requested",
  accepted: "Taken",
  in_progress: "In progress",
  completed: "Waiting for approval",
  confirmed: "Approved",
  released: "Paid",
  disputed: "In dispute",
  cancelled: "Cancelled",
  expired: "Expired",
  refunded: "Refunded",
  declined: "Declined",
};

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return typeof data?.detail === "string" ? data.detail : fallback;
}

function JobRow({ job, pool, send, busy }: { job: PoolJob; pool: SponsorshipPool; send: (k: string, p: string, b?: unknown) => void; busy: string | null }) {
  const [disputing, setDisputing] = useState(false);
  const [details, setDetails] = useState("");
  const waiting = job.status === "completed";
  return (
    <li className="space-y-2 rounded-xl bg-zinc-900 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-zinc-100">{job.title}</span>
        <span className="text-sm text-zinc-300">{usd(job.price_cents)}</span>
      </div>
      <p className="text-xs text-zinc-400">
        {JOB_LABEL[job.status] ?? job.status}
        {job.cleaner_name ? ` · ${job.cleaner_name}` : ""}
      </p>
      {job.after_photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {job.after_photos.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="After the cleanup" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
          ))}
        </div>
      )}
      {waiting && pool.can_approve && (
        <div className="space-y-2">
          {job.release_after && (
            <p className="text-xs text-zinc-500">Pays out automatically in {daysLeft(job.release_after)} days unless someone raises a problem.</p>
          )}
          <Button className="w-full" loading={busy === `ok-${job.id}`} onClick={() => send(`ok-${job.id}`, `jobs/${job.id}/approve`)}>
            Approve and pay the cleaner
          </Button>
          {disputing ? (
            <div className="space-y-2">
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="What is wrong with the work?"
                className="w-full rounded-xl bg-zinc-950 p-3 text-sm text-zinc-100"
              />
              <Button
                variant="destructive"
                className="w-full"
                disabled={details.trim().length < 3}
                loading={busy === `bad-${job.id}`}
                onClick={() => send(`bad-${job.id}`, `jobs/${job.id}/dispute`, { details: details.trim() })}
              >
                Report a problem
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setDisputing(true)}>
              Report a problem
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** Jobs-budget pools: the balance, the jobs posted from it, approval by contributors, and closing out. */
export default function PoolJobs({ pool }: { pool: SponsorshipPool }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  if (pool.plan_kind !== "jobs" || (pool.status !== "active" && pool.status !== "closed")) return null;

  const base = `/api/sponsorship-pools/${pool.id}`;
  const send = async (key: string, path: string, body?: unknown) => {
    setBusy(key);
    setError(null);
    const res = await fetch(`${base}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      setError(await readError(res, "Something went wrong."));
      setBusy(null);
      return;
    }
    setBusy(null);
    setConfirmClose(false);
    router.refresh();
  };

  const closed = pool.status === "closed";
  const left = pool.jobs_deadline ? daysLeft(pool.jobs_deadline) : 0;
  const jobs = pool.jobs ?? [];
  return (
    <Card className="mb-4 space-y-3 p-4">
      <h2 className="text-base font-bold text-zinc-100">{closed ? "Jobs budget closed" : "Jobs budget"}</h2>
      {!closed && (
        <p className="text-sm text-zinc-300">
          {usd(pool.balance_cents ?? 0)} left to spend of {usd(pool.raised_cents)}.{" "}
          {pool.is_creator
            ? `You post the jobs. People who chipped in approve the work, and any money still unspent after ${left} ${left === 1 ? "day" : "days"} goes back to them.`
            : "The starter posts cleaning jobs. People who chipped in approve the finished work, and unspent money goes back to them."}
        </p>
      )}
      {closed && <p className="text-sm text-zinc-300">Unspent money was returned to contributors in proportion to what each gave.</p>}
      {pool.jobs_frozen && <Note tone="warn">An admin paused this pool while something is looked into. No jobs or payouts until it is cleared.</Note>}
      {pool.is_creator && !closed && !pool.jobs_frozen && (
        <Link
          href={`/fund/pools/${pool.id}/post`}
          className="flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-bold text-zinc-950 touch-manipulation"
        >
          Post a job
        </Link>
      )}
      {jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} pool={pool} send={send} busy={busy} />
          ))}
        </ul>
      )}
      {jobs.length === 0 && !closed && <p className="text-xs text-zinc-500">No jobs posted yet.</p>}
      {pool.is_creator && !closed &&
        (confirmClose ? (
          <div className="space-y-2">
            <Button variant="destructive" className="w-full" loading={busy === "close"} onClick={() => send("close", "close")}>
              Yes, close and refund what is left
            </Button>
            <Button variant="ghost" className="w-full" disabled={busy === "close"} onClick={() => setConfirmClose(false)}>
              Keep the pool open
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setConfirmClose(true)}>
            Close the pool and refund what is left
          </Button>
        ))}
      {error && <Note tone="warn">{error}</Note>}
    </Card>
  );
}
