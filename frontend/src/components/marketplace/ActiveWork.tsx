"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Hammer, MapPin } from "lucide-react";
import { SPONSORED_CHANGED_EVENT } from "@/components/map/useSponsoredMapLayer";
import type { Job } from "@/lib/marketplace";

interface Work {
  kind: "job" | "site";
  href: string;
  title: string;
  /** Short next step, like "Take your starting photo". */
  next: string;
  /** Deadline for that step, if there is one. */
  due: string | null;
}

function left(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins <= 0) return "time is up";
  return mins >= 90 ? `${Math.round(mins / 60)} h left` : `${mins} min left`;
}

/** What the viewer is working right now: an accepted or in-progress job, or a claimed sponsored site. Only one can be active at a time. */
async function loadActive(): Promise<Work | null> {
  const [jobsRes, sitesRes] = await Promise.all([
    fetch("/api/marketplace/jobs?role=cleaner", { cache: "no-store" }).catch(() => null),
    fetch("/api/sponsored/sites", { cache: "no-store" }).catch(() => null),
  ]);
  if (jobsRes?.ok) {
    const jobs = (await jobsRes.json().catch(() => [])) as Job[];
    const job = Array.isArray(jobs) ? jobs.find((j) => j.status === "accepted" || j.status === "in_progress") : undefined;
    if (job) {
      const arriving = job.status === "accepted";
      return {
        kind: "job",
        href: `/fund/jobs/${job.id}`,
        title: job.title,
        next: arriving ? "Get there and start" : "Finish up and mark it complete",
        due: arriving ? left(job.arrive_by ?? null) : null,
      };
    }
  }
  if (sitesRes?.ok) {
    const sites = ((await sitesRes.json().catch(() => ({}))).sites ?? []) as {
      id: string;
      label: string;
      my_claim: { status: "claimed" | "in_progress"; before_deadline_at: string | null; after_deadline_at: string | null } | null;
    }[];
    const site = sites.find((s) => s.my_claim);
    if (site?.my_claim) {
      const starting = site.my_claim.status === "claimed";
      return {
        kind: "site",
        href: `/earn/sites/${site.id}`,
        title: site.label,
        next: starting ? "Take your starting photo" : "Clean up, then take your after photo",
        due: left(starting ? site.my_claim.before_deadline_at : site.my_claim.after_deadline_at),
      };
    }
  }
  return null;
}

/** Fetches the viewer's active job or claimed site. Renders nothing for logged-out viewers or when nothing is active. */
export default function ActiveWork({ variant, className = "" }: { variant: "card" | "chip"; className?: string }) {
  const [work, setWork] = useState<Work | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      loadActive()
        .then((w) => alive && setWork(w))
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener(SPONSORED_CHANGED_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(SPONSORED_CHANGED_EVENT, refresh);
    };
  }, []);

  if (!work) return null;
  const Icon = work.kind === "job" ? Hammer : MapPin;

  if (variant === "chip") {
    return (
      <Link
        href={work.href}
        className={`inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-emerald-950/90 px-3 text-xs font-bold text-emerald-300 shadow-elevation-2 ring-1 ring-inset ring-emerald-400/50 backdrop-blur-sm touch-manipulation active:scale-[0.97] ${className}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{work.kind === "job" ? "Active job" : "Claimed site"}{work.due ? `: ${work.due}` : ""}</span>
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <Link
      href={work.href}
      className={`flex min-h-14 items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm touch-manipulation active:scale-[0.99] ${className}`}
    >
      <Icon className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-300">
          {work.kind === "job" ? "Your active job" : "Your claimed site"}
        </span>
        <span className="block break-words font-bold text-zinc-100">{work.title}</span>
        <span className="block text-zinc-300">
          Next: {work.next}
          {work.due ? ` (${work.due})` : ""}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
    </Link>
  );
}
