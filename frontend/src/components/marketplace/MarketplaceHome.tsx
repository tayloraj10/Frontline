"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  Banknote,
  Briefcase,
  ChevronRight,
  Crosshair,
  Fence,
  Footprints,
  MapPin,
  Plus,
  Sprout,
  Trash2,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/PageShell";
import { getPosition } from "@/lib/getPosition";
import {
  JOB_TYPE_LABELS,
  TIME_MODE_LABELS,
  usd,
  whenLabel,
  type Job,
} from "@/lib/marketplace";

export { Rating } from "@/components/marketplace/CleanerRow";

const JobsMap = dynamic(() => import("@/components/marketplace/JobsMap"), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full animate-pulse rounded-2xl bg-zinc-900 sm:h-96" />
  ),
});

const CATEGORY_TILES = [
  { id: "litter", label: "Litter", Icon: Trash2 },
  { id: "lot_cleanup", label: "Lot", Icon: Fence },
  { id: "sidewalk", label: "Sidewalk", Icon: Footprints },
  { id: "light_yard_work", label: "Yard", Icon: Sprout },
];

const MI_PER_KM = 0.621371;

function distanceKm(from: [number, number], lat: number, lng: number) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((lat - from[0]) * r) / 2) ** 2 +
    Math.cos(from[0] * r) *
      Math.cos(lat * r) *
      Math.sin(((lng - from[1]) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * Hire home: open jobs on a map and a list for everyone, with buttons that point each person where
 * they need to go. Not a cleaner yet means they probably want to post a job, so that is the main button.
 */
export default function MarketplaceHome({
  board,
  profileStatus,
  payoutsEnabled,
}: {
  board: Job[];
  profileStatus: string | null;
  payoutsEnabled: boolean;
}) {
  const isCleaner = profileStatus === "active";
  const needsPayouts = profileStatus !== null && !payoutsEnabled;
  const [service, setService] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const jobs = useMemo(() => {
    const list = board
      .filter((j) => !service || j.job_type === service)
      .map((j) => ({
        ...j,
        distance_km:
          me && j.latitude != null && j.longitude != null
            ? distanceKm(me, j.latitude, j.longitude)
            : j.distance_km ?? null,
      }));
    return me
      ? list.sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9))
      : list;
  }, [board, service, me]);

  async function nearMe() {
    setLocating(true);
    setLocError(null);
    try {
      const pos = await getPosition();
      setMe([pos.coords.latitude, pos.coords.longitude]);
    } catch (e) {
      setLocError(
        e instanceof Error ? e.message : "Could not get your location."
      );
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-4">
      {needsPayouts && (
        <Link
          href="/marketplace/become-a-cleaner"
          className="flex items-center gap-3 rounded-2xl bg-amber-400/10 p-4 ring-1 ring-inset ring-amber-400/40 touch-manipulation active:scale-[0.98]"
        >
          <Banknote className="h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-amber-100">Set up payouts to take jobs</span>
            <span className="block text-sm text-amber-100/70">
              You can browse, but you cannot take a job until Stripe has your bank details. It takes a few minutes.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
        </Link>
      )}

      {isCleaner ? (
        <Card className="flex items-center gap-3 border-emerald-400/30 bg-emerald-400/5">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-zinc-100">
              Pick a job below and take it
            </p>
            <p className="text-sm text-zinc-400">
              You get a notification when a job is posted near you.
            </p>
          </div>
          <Link
            href="/marketplace/jobs"
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-zinc-800 px-3 text-sm font-semibold text-zinc-100 active:scale-[0.97]"
          >
            <Briefcase className="h-4 w-4" aria-hidden="true" />
            My jobs
          </Link>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/marketplace/post"
          className={`flex min-h-20 flex-col justify-center gap-0.5 rounded-2xl px-4 touch-manipulation active:scale-[0.98] ${
            isCleaner
              ? "bg-zinc-900 ring-1 ring-inset ring-zinc-800"
              : "bg-emerald-400 text-emerald-950"
          }`}
        >
          <span className="inline-flex items-center gap-1.5 text-[15px] font-extrabold">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Post a job
          </span>
          <span
            className={`text-xs ${
              isCleaner ? "text-zinc-400" : "text-emerald-950/70"
            }`}
          >
            Free. A neighbor takes it at your price.
          </span>
        </Link>
        <Link
          href="/marketplace/become-a-cleaner"
          className="flex min-h-20 flex-col justify-center gap-0.5 rounded-2xl bg-zinc-900 px-4 ring-1 ring-inset ring-sky-400/40 touch-manipulation active:scale-[0.98]"
        >
          <span className="text-[15px] font-extrabold text-zinc-100">
            {profileStatus ? "My cleaner profile" : "Earn as a cleaner"}
          </span>
          <span className="text-xs text-zinc-400">
            {profileStatus
              ? "Your area, rate and status."
              : "Pick jobs near you. Get paid."}
          </span>
        </Link>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <h2 className="text-sm font-bold text-zinc-100">
          Open jobs ({jobs.length})
        </h2>
        <button
          type="button"
          onClick={nearMe}
          disabled={locating}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-zinc-900 px-3 text-xs font-semibold text-sky-300 ring-1 ring-inset ring-zinc-800 disabled:opacity-60"
        >
          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
          {locating
            ? "Finding you..."
            : me
            ? "Sorted by distance"
            : "Closest to me"}
        </button>
      </div>
      {locError && <p className="text-xs text-amber-300">{locError}</p>}

      <div className="grid grid-cols-4 gap-2">
        {CATEGORY_TILES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={service === id}
            onClick={() => setService(service === id ? "" : id)}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold touch-manipulation transition-[background-color,transform] active:scale-[0.97] ${
              service === id
                ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/30"
                : "bg-zinc-900 text-zinc-300 ring-1 ring-inset ring-zinc-800"
            }`}
          >
            <Icon className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div id="jobs-map" className="scroll-mt-20">
        <JobsMap
          jobs={jobs}
          selectedId={selected}
          onSelect={setSelected}
          onSeeInList={(id) => {
            document
              .getElementById(`job-${id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title={board.length === 0 ? "No open jobs yet" : "No jobs match"}
          body={
            board.length === 0
              ? "Jobs show up here as neighbors post them."
              : "Try clearing the filter."
          }
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {jobs.map((j) => (
            <li key={j.id} id={`job-${j.id}`} className="scroll-mt-24">
              <Link href={`/marketplace/jobs/${j.id}`}>
                <Card
                  interactive
                  className={`space-y-3 border-l-4 ${
                    selected === j.id ? "!bg-sky-500/20 !ring-2 !ring-sky-400" : ""
                  } ${
                    selected === j.id
                      ? "border-l-sky-400"
                      : j.is_mine
                      ? "border-l-amber-300 border-dashed"
                      : "border-l-emerald-400/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-bold text-zinc-100">{j.title}</p>
                    <p className="shrink-0 text-lg font-extrabold leading-none text-emerald-300">
                      {usd(j.price_cents)}
                      <span className="text-xs font-semibold text-emerald-300/70">
                        {j.price_type === "hourly" ? "/hr" : ""}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="info">
                      {TIME_MODE_LABELS[j.time_mode]}
                    </Badge>
                    <Badge>{JOB_TYPE_LABELS[j.job_type] ?? j.job_type}</Badge>
                    {j.is_mine && <Badge variant="pending">Your job</Badge>}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                    <span className="truncate">
                      {whenLabel(j)}
                      {j.distance_km != null
                        ? ` · ${(j.distance_km * MI_PER_KM).toFixed(1)} mi`
                        : ""}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-3">
                      {j.latitude != null && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setSelected(j.id);
                            document
                              .getElementById("jobs-map")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                          }}
                          className="inline-flex min-h-8 items-center gap-1 rounded-full bg-zinc-800 px-2.5 font-semibold text-sky-300"
                        >
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          Map
                        </button>
                      )}
                      <span className="inline-flex items-center font-semibold text-emerald-300">
                        {isCleaner && !j.is_mine ? "View and take" : "View"}
                        <ChevronRight
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      </span>
                    </span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
