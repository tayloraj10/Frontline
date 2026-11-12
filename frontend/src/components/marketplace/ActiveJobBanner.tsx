import Link from "next/link";
import { Hammer } from "lucide-react";
import type { Job } from "@/lib/marketplace";
import { mkFetch } from "@/lib/marketplace.server";
import HideOnHome from "./HideOnHome";
import LocalTime from "./LocalTime";

/** Shown on every Hire screen while the viewer is the cleaner on a job that is not finished yet. */
export default async function ActiveJobBanner({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const jobs = await mkFetch<Job[]>(userId, isAdmin, "/jobs?role=cleaner").catch(() => [] as Job[]);
  const job = jobs.find((j) => j.status === "accepted" || j.status === "in_progress");
  if (!job) return null;
  const waiting = job.status === "accepted";
  return (
    <HideOnHome>
    <Link
      href={`/fund/jobs/${job.id}`}
      className="mb-4 flex min-h-11 items-start gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm touch-manipulation active:scale-[0.99]"
    >
      <Hammer className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block font-bold text-emerald-300">{waiting ? "You have an active job" : "Job in progress"}</span>
        <span className="block break-words text-zinc-200">{job.title}</span>
        {waiting && job.arrive_by && (
          <span className="block text-zinc-300">
            Be on site and start by <LocalTime iso={job.arrive_by} />, or it goes back on the board.
          </span>
        )}
      </span>
    </Link>
    </HideOnHome>
  );
}
