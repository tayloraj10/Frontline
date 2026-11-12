"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Briefcase,ClipboardList, MapPin, ShieldCheck, UserRound } from "lucide-react";
import DoChooser, { type DoChip } from "@/components/ui/DoChooser";
import FitScreen from "@/components/ui/FitScreen";
import SponsoredMap, { type MapView } from "./SponsoredMap";
import SponsoredSites from "./SponsoredSites";
import SponsorshipsHub from "./SponsorshipsHub";

/** Earn page body: sponsored sites (or neighbor jobs behind a toggle), plus a collapsed admin tools section for site admins. */
export default function SponsorshipsPanels({
  businesses,
  currentUserId,
  isAdmin,
  fundOnHire = false,
  jobsView,
  extras,
}: {
  businesses: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
  /** When the Hire tab exists, funding lives there and Earn only shows claiming. */
  fundOnHire?: boolean;
  /** Neighbor job board, shown behind a toggle on the Earn view. */
  jobsView?: ReactNode;
  /** Secondary cards (actions, payouts, guide) shown under the map so the map stays first. */
  extras?: ReactNode;
}) {
  const params = useSearchParams();
  const initialDo = params.get("do");
  const [doId, setDoId] = useState<string | null>(initialDo === "jobs" || initialDo === "sites" ? initialDo : null);
  const [earnView, setEarnView] = useState<MapView>(initialDo === "jobs" ? "jobs" : initialDo === "sites" ? "sites" : "all");
  // A chip picks the map filter and the page view; changing the filter by hand leaves the chip alone.
  // Tapping the active chip again goes back to the combined map.
  const pick = (id: "jobs" | "sites") => {
    const next = doId === id ? null : id;
    setDoId(next);
    setEarnView(next ?? "all");
    window.history.replaceState(null, "", next ? `/earn?do=${next}` : "/earn");
  };
  const setView = (v: MapView) => (v === "all" ? (doId ? pick(doId as "jobs" | "sites") : undefined) : doId === v ? undefined : pick(v));
  // Pin card "Show in list": switch to the jobs view if needed, then scroll that job row to the middle of the screen.
  const seeJobInList = (id: string) => {
    if (doId !== "jobs") pick("jobs");
    setTimeout(() => document.getElementById(`job-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  };
  const onJobs = !!jobsView && doId === "jobs";
  // Returning from Stripe Checkout: keep the default view, just drop the return flag from the URL.
  const [funded, setFunded] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") !== "success") return;
    window.history.replaceState(null, "", window.location.pathname);
    const show = setTimeout(() => setFunded(true), 0);
    const hide = setTimeout(() => setFunded(false), 7000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

    const chips: DoChip[] = jobsView
    ? [
        { id: "jobs", label: "Take a job", color: "emerald", sub: "Open jobs", icon: Briefcase, onSelect: () => pick("jobs") },
        { id: "sites", label: "Claim a site", color: "sky", sub: "Sponsored sites", icon: MapPin, onSelect: () => pick("sites") },
        { id: "profile", label: "Cleaner profile", color: "violet", sub: "Photo, payouts", icon: UserRound, href: "/earn/profile" },
        { id: "mine", label: "My jobs", color: "amber", sub: "Active, past", icon: ClipboardList, href: "/fund/jobs" },
      ]
    : [];

  return (
    <div>
      {funded && (
        <p
          role="status"
          className="mb-4 rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/30"
        >
          Thank you! Your sponsorship is received and will go live shortly.
        </p>
      )}
      <FitScreen>
        <SponsoredMap compact fill withJobs={!!jobsView} view={earnView} onViewChange={setView} onSeeJobInList={seeJobInList} />
        {chips.length > 0 && <DoChooser chips={chips} active={doId} />}
      </FitScreen>
      {onJobs && jobsView}
      {extras}
      {(doId === "sites" || !jobsView) && <SponsoredSites />}
      {!onJobs && !fundOnHire && (
        <div className="mt-6">
          <h2 className="mb-1 text-sm font-bold text-zinc-100">Fund a cleanup</h2>
          <p className="mb-3 text-sm text-zinc-400">Put money behind a cleanup. It is only paid out after the work is verified.</p>
          <SponsorshipsHub businesses={businesses} currentUserId={currentUserId} isAdmin={isAdmin} open="fund" />
        </div>
      )}
      {isAdmin && (
        <Link
          href="/earn/admin"
          className="mt-6 flex w-full flex-col items-center justify-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 text-white shadow-elevation-1 touch-manipulation transition-transform active:scale-[0.98]"
        >
          <span className="flex min-h-8 items-center gap-2 text-base font-extrabold">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            Sponsorship admin
          </span>
        </Link>
      )}
    </div>
  );
}
