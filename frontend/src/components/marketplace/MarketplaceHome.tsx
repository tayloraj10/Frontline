"use client";

import PayoutSetupCard from "@/app/earn/PayoutSetupCard";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  ChevronRight,
  Crosshair,
  MapPin,
  ShieldAlert,
  Sprout,
  UserRound,
} from "lucide-react";
import ActionTile from "@/components/ui/ActionTile";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/PageShell";
import { getPosition } from "@/lib/getPosition";
import { categoryColor, categoryIcon, useCategories } from "@/lib/categories";
import { flashRow } from "@/lib/flashRow";
import { BusinessIconBadge, CategoryDescription,CategoryChip, CategoryGuideButton, SizeBadge } from "./CategoryBits";
import {
  JOB_FOCUS_EVENT,
  mk,
  TIME_MODE_LABELS,
  usd,
  whenLabel,
  type BoardPin,
  type Job,
} from "@/lib/marketplace";

export { Rating } from "@/components/marketplace/CleanerRow";

const JobsMap = dynamic(() => import("@/components/marketplace/JobsMap"), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full animate-pulse rounded-2xl bg-zinc-900 sm:h-96" />
  ),
});

const PAGE_SIZE = 20;
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
 * Earn side of the marketplace: open jobs on a map and a list, with buttons that point each person to
 * their cleaner profile and payouts. Posting a job lives on the Hire tab.
 */
export default function MarketplaceHome({
  board,
  profileStatus,
  payoutsBlocked,
  embedded = false,
}: {
  board: Job[];
  profileStatus: string | null;
  payoutsBlocked: boolean;
  /** Inside the Earn page, which already shows the payouts card and profile tiles. */
  embedded?: boolean;
}) {
  const isCleaner = profileStatus === "active";
  const suspended = profileStatus === "suspended";
  const cats = useCategories();
  const [service, setService] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  // The server pages the board (nearest first once we know where the viewer is, with no radius cutoff).
  const [items, setItems] = useState(board);
  const [hasMore, setHasMore] = useState(board.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const first = useRef(true);

  async function fetchPage(offset: number) {
    const q = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (service) q.set("job_type", service);
    if (me) {
      q.set("latitude", String(me[0]));
      q.set("longitude", String(me[1]));
    }
    return mk<Job[]>(`/board?${q}`);
  }

  // The map shows a pin for every open job, so looking around is not limited to the pages loaded in the list.
  const [pins, setPins] = useState<BoardPin[]>(board);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    const q = new URLSearchParams();
    if (service) q.set("job_type", service);
    if (me) {
      q.set("latitude", String(me[0]));
      q.set("longitude", String(me[1]));
    }
    mk<{ total: number; pins: BoardPin[] }>(`/board/pins?${q}`)
      .then((r) => {
        if (!live) return;
        setPins(r.pins);
        setTotal(r.total);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [service, me]);

  // A new filter or a new location starts the list over.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let live = true;
    setPageError(null);
    fetchPage(0)
      .then((rows) => {
        if (!live) return;
        setItems(rows);
        setHasMore(rows.length >= PAGE_SIZE);
      })
      .catch((e) => live && setPageError(e instanceof Error ? e.message : "Could not load jobs."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, me]);

  async function showMore() {
    setLoadingMore(true);
    setPageError(null);
    try {
      const rows = await fetchPage(items.length);
      setItems((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
      setHasMore(rows.length >= PAGE_SIZE);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Could not load more jobs.");
    } finally {
      setLoadingMore(false);
    }
  }

  const jobs = useMemo(() => {
    const list = items
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
  }, [items, me]);

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
      {suspended && (
        <Link
          href="/earn/profile"
          className="flex items-center gap-3 rounded-2xl bg-red-500/10 p-4 ring-2 ring-inset ring-red-400/60 touch-manipulation active:scale-[0.98]"
        >
          <ShieldAlert className="h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-red-100">Your cleaner profile is suspended</span>
            <span className="block text-sm text-red-100/70">
              You can browse, but you cannot take jobs. See your strikes and how to appeal.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
        </Link>
      )}
      {payoutsBlocked && (
        <Link
          href="/earn/profile"
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

      {!embedded && isCleaner && !payoutsBlocked && <PayoutSetupCard />}

      {!embedded && (
      <div className="grid grid-cols-1 gap-3">
        <ActionTile
          tone={suspended ? "red" : "sky"}
          href="/earn/profile"
          icon={suspended ? ShieldAlert : profileStatus ? UserRound : Sprout}
          title={suspended ? "Profile suspended" : profileStatus ? "Cleaner profile" : "Start earning"}
          sub={suspended ? "Tap to see why." : profileStatus ? "Your area, rate and status." : "Pick jobs near you."}
        />
      </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-zinc-100">
            Open jobs ({total != null && total > jobs.length ? `${jobs.length} of ${total}` : (total ?? jobs.length)})
          </h2>
          {isCleaner ? (
            <p className="text-xs font-bold text-emerald-300">Pick a job below and take it</p>
          ) : null}
          <CategoryGuideButton className="-ml-3 -mb-2" />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={nearMe}
            disabled={locating}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-zinc-900 px-3 text-xs font-semibold text-sky-300 ring-1 ring-inset ring-zinc-800 disabled:opacity-60"
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
            {locating
              ? "Finding you..."
              : me
              ? "Sorted by distance"
              : "Closest to me"}
          </button>
        </div>
      </div>
      {locError && <p className="text-xs text-amber-300">{locError}</p>}

      <div className="grid grid-cols-4 gap-1.5">
        {cats.categories.map((c) => ({ id: c.key, label: c.short_label, Icon: categoryIcon(c.icon), color: categoryColor(c.color), hazard: c.hazard_risk, badge: c.badge })).map(({ id, label, Icon, color, hazard, badge }) => (
          <button
            key={id}
            type="button"
            aria-pressed={service === id}
            onClick={() => setService(service === id ? "" : id)}
            className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 text-[11px] font-semibold touch-manipulation transition-[background-color,transform] active:scale-[0.97] ${
              service === id
                ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/30"
                : "bg-zinc-900 text-zinc-300 ring-1 ring-inset ring-zinc-800"
            }`}
          >
            <Icon className={`h-4 w-4 ${color.icon}`} aria-hidden="true" />
            {label}
            {hazard && <span className="sr-only"> (hazard risk)</span>}
            {badge && <BusinessIconBadge text={badge} className="absolute -right-1 -top-1" />}
          </button>
        ))}
      </div>
      {service && cats.get(service) && (
        <p className="-mt-1 rounded-xl bg-zinc-900 px-3 py-2 text-xs text-zinc-400 ring-1 ring-inset ring-zinc-800">
          <span className="font-semibold text-zinc-200">{cats.get(service)!.label}.</span> <CategoryDescription text={cats.get(service)!.description ?? ""} />{" "}
          {cats.get(service)!.rule_note}
        </p>
      )}

      {!embedded && (
      <div id="jobs-map" className="scroll-mt-20">
        <JobsMap
          jobs={pins}
          inList={(id) => jobs.some((j) => j.id === id)}
          selectedId={selected}
          onSelect={setSelected}
          onSeeInList={(id) => {
            flashRow(`job-${id}`);
          }}
        />
      </div>
      )}

      {jobs.length === 0 ? (
        <EmptyState
          title={!service && items.length === 0 ? "No open jobs yet" : "No jobs match"}
          body={
            !service && items.length === 0
              ? "Jobs show up here as neighbors post them."
              : "Try clearing the filter."
          }
        />
      ) : (
        <ul className="grid items-center gap-3 sm:grid-cols-2">
          {jobs.map((j) => (
            <li key={j.id} id={`job-${j.id}`} className="scroll-mt-24">
              <Link href={`/fund/jobs/${j.id}`}>
                <Card
                  interactive
                  className={`space-y-3 ${
                    selected === j.id
                      ? "!bg-sky-500/20 !ring-2 !ring-sky-400"
                      : j.is_mine
                      ? "!ring-2 !ring-amber-300/70"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-bold text-zinc-100">{j.title}</p>
                    <p className="shrink-0 text-lg font-extrabold leading-none text-emerald-300">
                      {usd(j.price_cents)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="info">
                      {TIME_MODE_LABELS[j.time_mode]}
                    </Badge>
                    <CategoryChip type={j.job_type} />
                    <SizeBadge size={j.size} />
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
                            if (embedded) {
                              // The Earn page map lives outside this component; ask it to select and fly to the pin.
                              window.dispatchEvent(new CustomEvent(JOB_FOCUS_EVENT, { detail: { id: j.id } }));
                              document.getElementById("sponsored-map")?.scrollIntoView({ behavior: "smooth", block: "center" });
                              return;
                            }
                            document
                              .getElementById("jobs-map")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                          }}
                          className="inline-flex min-h-11 items-center gap-1 rounded-full bg-zinc-800 px-2.5 font-semibold text-sky-300"
                        >
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          Map
                        </button>
                      )}
                      <span
                        className={`inline-flex min-h-11 items-center gap-0.5 rounded-full px-4 font-bold ${j.is_mine ? "bg-amber-300 text-amber-950" : "bg-sky-400 text-sky-950"}`}
                      >
                        View
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

      {pageError && <p role="alert" className="text-sm text-red-300">{pageError}</p>}
      {hasMore && (
        <Button variant="secondary" className="w-full" onClick={() => void showMore()} disabled={loadingMore}>
          {loadingMore ? "Loading..." : me ? "Show more, farther away" : "Show more"}
        </Button>
      )}
    </div>
  );
}
