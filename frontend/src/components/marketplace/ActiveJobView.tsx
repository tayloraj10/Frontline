import Link from "next/link";
import { Hammer, MapPin, MessageSquare, User, Wallet } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { STATUS_LABELS, usd, whenLabel, type Job } from "@/lib/marketplace";
import BackOutButton from "./BackOutButton";
import JobSiteCard from "./JobSiteCard";
import LocalTime from "./LocalTime";

/** Hire home while the viewer is working a job: just that job, what to do next, and the way back to it. */
export default function ActiveJobView({ job }: { job: Job }) {
  const s = STATUS_LABELS[job.status] ?? { label: job.status, tone: "neutral" as const };
  const arriving = job.status === "accepted";
  const payout = job.cleaner_payout_cents ?? job.price_cents - job.platform_fee_cents;
  return (
    <Card className="space-y-4 border border-emerald-400/30 bg-emerald-400/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-300">
            <Hammer className="h-4 w-4" aria-hidden="true" />
            Your active job
          </p>
          <h2 className="mt-1 break-words font-display text-xl font-extrabold text-zinc-50">{job.title}</h2>
        </div>
        <Badge variant={s.tone}>{s.label}</Badge>
      </div>

      <div className="rounded-2xl bg-zinc-900/70 p-3 text-sm">
        <p className="font-bold text-zinc-100">{arriving ? "Next: get to the site and start" : "Next: finish up and mark it complete"}</p>
        {arriving && job.arrive_by && (
          <p className="mt-0.5 font-semibold text-amber-200">
            Start by <LocalTime iso={job.arrive_by} />, or it goes back on the board.
          </p>
        )}
      </div>

      <JobSiteCard job={job} />

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Row Icon={MapPin} label="Where" value={job.address_label ?? "See the job"} />
        <Row Icon={Wallet} label="You receive" value={usd(payout)} />
        <Row Icon={User} label="Customer" value={job.customer_username ?? "Customer"} />
        <Row Icon={Hammer} label="When" value={whenLabel(job) || "To be agreed"} />
      </dl>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/marketplace/jobs/${job.id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-400 px-4 text-sm font-bold text-emerald-950 touch-manipulation active:scale-[0.97]"
        >
          {arriving ? "Open and start" : "Open job"}
        </Link>
        <Link
          href={`/marketplace/jobs/${job.id}#messages`}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-zinc-800 px-4 text-sm font-bold text-zinc-100 touch-manipulation active:scale-[0.97]"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Message
        </Link>
      </div>
      {arriving && <BackOutButton jobId={job.id} direct={job.origin === "direct"} />}
      <p className="text-xs text-zinc-500">You can hold one job at a time. Finish or back out of this one to see the board again.</p>
    </Card>
  );
}

function Row({ Icon, label, value }: { Icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
        <dd className="break-words text-zinc-200">{value}</dd>
      </div>
    </div>
  );
}
