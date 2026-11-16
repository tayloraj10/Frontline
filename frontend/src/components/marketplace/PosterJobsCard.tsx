import Link from "next/link";
import { ChevronRight, ClipboardList, Hourglass } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { usd, type Job, type MoneySummary } from "@/lib/marketplace";

const ACTIVE = new Set(["requested", "open", "accepted", "in_progress"]);
const DONE = new Set(["confirmed", "released"]);

/** At-a-glance view of the jobs a person has posted, with a prompt when work is waiting for their approval. */
export default function PosterJobsCard({ jobs, spent }: { jobs: Job[]; spent: MoneySummary }) {
  if (jobs.length === 0) return null;
  const awaiting = jobs.filter((j) => j.status === "completed");
  const active = jobs.filter((j) => ACTIVE.has(j.status)).length;
  const done = jobs.filter((j) => DONE.has(j.status)).length;
  const stats = [
    { label: "Active", value: active },
    { label: "Awaiting you", value: awaiting.length, hot: awaiting.length > 0 },
    { label: "Complete", value: done },
    { label: "Spent", value: usd(spent.paid_cents) },
  ];

  return (
    <Card className="mb-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-zinc-100">Your posted jobs</h2>
        <Link href="/fund/jobs" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-sky-300">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
          My bookings
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <dl className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-xl px-2 py-2 text-center ${s.hot ? "bg-amber-400/15 ring-1 ring-inset ring-amber-400/40" : "bg-zinc-900/60"}`}
          >
            <dd className={`text-lg font-extrabold leading-none ${s.hot ? "text-amber-200" : "text-zinc-100"}`}>{s.value}</dd>
            <dt className="mt-1 text-[11px] text-zinc-400">{s.label}</dt>
          </div>
        ))}
      </dl>
      {awaiting.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-amber-400/10 p-3 ring-1 ring-inset ring-amber-400/30">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-200">
            <Hourglass className="h-4 w-4 shrink-0" aria-hidden="true" />
            {awaiting.length === 1 ? "1 job is waiting for your approval" : `${awaiting.length} jobs are waiting for your approval`}
          </p>
          <ul className="space-y-1.5">
            {awaiting.slice(0, 3).map((j) => (
              <li key={j.id}>
                <Link
                  href={`/fund/jobs/${j.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-amber-300 px-3 text-sm font-bold text-amber-950 touch-manipulation active:scale-[0.98]"
                >
                  <span className="min-w-0 truncate">Review: {j.title}</span>
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {awaiting.length > 3 && (
            <Link href="/fund/jobs" className="inline-flex min-h-11 items-center text-xs font-semibold text-amber-200 underline-offset-2 hover:underline">
              See all {awaiting.length} in My bookings
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
