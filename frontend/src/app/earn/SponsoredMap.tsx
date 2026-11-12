"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Section } from "@/components/ui/PageShell";
import BodyPortal from "@/components/ui/BodyPortal";
import { useSponsoredMapLayer } from "@/components/map/useSponsoredMapLayer";
import { ExpandIcon, mapIconBtn, newGeolocateControl } from "@/components/map/sponsorMapControls";
import { Briefcase, ListOrdered, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { JOB_TYPE_LABELS, mk, usd, whenLabel, type BoardPin } from "@/lib/marketplace";

export type MapView = "all" | "sites" | "jobs";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const BASEMAPS = [
  { value: "outdoor", label: "Terrain" },
  { value: "streets", label: "Streets" },
  { value: "hybrid", label: "Satellite" },
] as const;
type Basemap = (typeof BASEMAPS)[number]["value"];

const styleUrl = (id: Basemap) => `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;

/** Overview map of every funded site and group area, so sponsors and workers can see where money is. */
export default function SponsoredMap({
  compact = false,
  fill = false,
  withJobs = false,
  view = "all",
  onViewChange,
  onSeeJobInList,
}: {
  compact?: boolean;
  /** Fill the parent (a FitScreen flex column) instead of using a fixed height. */
  fill?: boolean;
  /** Also plot open neighbor jobs on the map (Earn page, when the marketplace is on). */
  withJobs?: boolean;
  /** Which kinds of pins to show. Only meaningful with withJobs. */
  view?: MapView;
  /** With withJobs, the map shows a small All / Sites / Jobs switcher and reports taps here. */
  onViewChange?: (v: MapView) => void;
  /** Selected job card gets a "Show in list" button that calls this. */
  onSeeJobInList?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pins, setPins] = useState<BoardPin[]>([]);
  useEffect(() => {
    if (!withJobs) return;
    let live = true;
    mk<{ pins: BoardPin[] }>("/board/pins")
      .then((r) => live && setPins(r.pins))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [withJobs]);
  const effectiveView: MapView = withJobs ? view : "sites";
  const mapProps = { view: effectiveView, pins: withJobs ? pins : [], onViewChange: withJobs ? onViewChange : undefined, onSeeJobInList: withJobs ? onSeeJobInList : undefined };

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (fill) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div id="sponsored-map" className="min-h-0 flex-1 scroll-mt-20">
          <MapFrame expanded={false} onToggleExpand={() => setExpanded(true)} {...mapProps} />
        </div>
        {expanded && (
          <BodyPortal>
            <div className="fixed inset-0 z-[60] bg-black/90 p-3 sm:p-8">
              <MapFrame expanded onToggleExpand={() => setExpanded(false)} {...mapProps} />
            </div>
          </BodyPortal>
        )}
      </div>
    );
  }

  return (
    <Section
      title={compact ? undefined : "Sponsored map"}
      description={compact ? undefined : "Every funded cleanup site and group area. Tap a pin to see the payout and claim it."}
      className={compact ? "mb-4" : undefined}
    >
      <div id="sponsored-map" className={compact ? "h-[52vh] min-h-[20rem] max-h-[34rem] scroll-mt-20" : "h-[26rem] scroll-mt-20 sm:h-[32rem]"}>
        <MapFrame expanded={false} onToggleExpand={() => setExpanded(true)} {...mapProps} />
      </div>
      {/* Portaled to the body like the app's other modals, so no ancestor can clip or offset it. */}
      {expanded && (
        <BodyPortal>
          <div className="fixed inset-0 z-[60] bg-black/90 p-3 sm:p-8">
            <MapFrame expanded onToggleExpand={() => setExpanded(false)} {...mapProps} />
          </div>
        </BodyPortal>
      )}
    </Section>
  );
}

function MapFrame({
  expanded,
  onToggleExpand,
  view,
  pins,
  onViewChange,
  onSeeJobInList,
}: {
  expanded: boolean;
  onToggleExpand: () => void;
  view: MapView;
  pins: BoardPin[];
  onViewChange?: (v: MapView) => void;
  onSeeJobInList?: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("outdoor");
  const [showSites, setShowSites] = useState(true);
  const [showAreas, setShowAreas] = useState(true);
  const [openOnly, setOpenOnly] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const { count, siteCount, areaCount, openSiteCount, points } = useSponsoredMapLayer(map, true, {
    sites: showSites && view !== "jobs",
    areas: showAreas && view !== "jobs",
    availableOnly: openOnly,
    listenForFocus: !expanded,
  });

  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: styleUrl("outdoor"),
      center: [-73.95, 40.7],
      zoom: 10,
      attributionControl: false,
      cooperativeGestures: true,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(newGeolocateControl(), "top-right");
    map.current = m;
    m.on("load", () => setReady(true));
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  const jobPins = view === "sites" ? [] : pins.filter((j) => j.latitude != null && j.longitude != null);
  const allPoints = (): [number, number][] => [
    ...(view === "jobs" ? [] : (points as [number, number][])),
    ...jobPins.map((j) => [j.longitude as number, j.latitude as number] as [number, number]),
  ];
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const selectedJob = selectedJobId ? pins.find((j) => j.id === selectedJobId) : null;

  // Open jobs as sky price pills (amber when they are the viewer's own), so they read apart from the green site pins.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const made: maplibregl.Marker[] = [];
    for (const j of jobPins) {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = usd(j.price_cents);
      el.setAttribute("aria-label", `Job: ${j.title}, ${usd(j.price_cents)}`);
      el.className = cn(
        "rounded-full px-2.5 py-1 text-xs font-extrabold shadow-lg ring-2",
        j.is_mine ? "bg-amber-300 text-amber-950 ring-amber-100/80" : "bg-sky-400 text-sky-950 ring-white/80",
      );
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelectedJobId(j.id);
      });
      made.push(new maplibregl.Marker({ element: el }).setLngLat([j.longitude as number, j.latitude as number]).addTo(m));
    }
    return () => made.forEach((x) => x.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pins, view]);

  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center min-h-9 px-3 text-xs font-semibold rounded-full cursor-pointer touch-manipulation transition-[background-color,color,transform] duration-150 active:scale-[0.96]",
      active ? "bg-emerald-400 text-emerald-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100",
    );

  const fitAll = (animate: boolean) => {
    const m = map.current;
    if (!m) return;
    const all = allPoints();
    if (all.length === 0) return;
    const bounds = new maplibregl.LngLatBounds(all[0], all[0]);
    all.forEach((p) => bounds.extend(p));
    // Keep every pin clear of the map controls: buttons down the left and right edges, the type filter and Layers along the bottom, labels above pins.
    m.fitBounds(bounds, { padding: { top: 72, bottom: 80, left: 72, right: 72 }, maxZoom: 15, duration: animate ? 500 : 0 });
  };

  // Frame every funded site and area once they load.
  useEffect(() => {
    if (ready) fitAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points, pins, view]);

  const changeBasemap = (next: Basemap) => {
    setBasemap(next);
    map.current?.setStyle(styleUrl(next));
  };

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {/* maplibre's own CSS forces position: relative on its container, so the sizing lives on this parent. */}
        <div className="absolute inset-0">
          <div ref={container} className="h-full w-full" />
        </div>

        {/* Condensed type filter: All / Sites / Jobs. Only when the page passes a handler (Earn with jobs on). */}
        {onViewChange && (
          <div className={cn("absolute bottom-3 left-3 z-10 flex gap-0.5 rounded-full bg-zinc-900/90 p-1 shadow-elevation-3 backdrop-blur-sm", selectedJob && "hidden")}>
            {(
              [
                { v: "all", label: "All", icon: null },
                { v: "sites", label: "Sites", icon: MapPin },
                { v: "jobs", label: "Jobs", icon: Briefcase },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => onViewChange(o.v)}
                aria-pressed={view === o.v}
                aria-label={o.label}
                title={o.label}
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-semibold touch-manipulation transition-[background-color,color,transform] duration-150 active:scale-[0.95]",
                  view === o.v ? "bg-zinc-600 text-zinc-100" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200",
                )}
              >
                {o.icon ? <o.icon className="h-4 w-4" aria-hidden="true" /> : o.label}
              </button>
            ))}
          </div>
        )}

        {/* Same round-rect buttons as the event map's enlarge button. */}
        <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
          <button
            type="button"
            onClick={onToggleExpand}
            title={expanded ? "Close expanded map" : "Expand map"}
            aria-label={expanded ? "Close expanded map" : "Expand map"}
            className={mapIconBtn}
          >
            <ExpandIcon open={expanded} />
          </button>
          <button
            type="button"
            onClick={() => fitAll(true)}
            disabled={points.length === 0}
            title="Zoom to everything"
            aria-label="Zoom to everything"
            className={mapIconBtn}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
            </svg>
          </button>
        </div>

        {/* Single Layers menu bottom-right: one small button, panel grows upward. */}
        <div
          className={cn(
            "pointer-events-none absolute bottom-3 flex w-[min(88vw,18rem)] flex-col items-end justify-end gap-2 text-xs",
            layersOpen ? "right-3 top-3 z-40" : "right-3 top-20 z-10",
          )}
        >
          <button
            type="button"
            onClick={() => setLayersOpen((v) => !v)}
            aria-expanded={layersOpen}
            className="pointer-events-auto flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-zinc-900/90 pl-3 pr-3.5 text-xs font-semibold text-zinc-100 shadow-elevation-3 backdrop-blur-md transition-[background-color,transform] duration-150 hover:bg-zinc-800/90 active:scale-[0.96] touch-manipulation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m12 3 9 5-9 5-9-5 9-5Z" />
              <path d="m3 13 9 5 9-5" />
            </svg>
            <span>Layers</span>
          </button>
          {layersOpen && (
            <div className="pointer-events-auto order-first flex min-h-0 w-full flex-col gap-0.5 overflow-y-auto rounded-[20px] bg-zinc-900/95 p-2 pt-0 shadow-elevation-4 ring-1 ring-inset ring-white/5 backdrop-blur-md">
              <div className="sticky top-0 z-10 -mx-2 mb-1 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 pb-1.5 pt-1.5">
                <span className="text-sm font-semibold text-zinc-100">Layers</span>
                <button
                  type="button"
                  onClick={() => setLayersOpen(false)}
                  aria-label="Close layers"
                  className="-mr-1 grid h-8 w-8 place-items-center rounded-full bg-zinc-800 text-zinc-300 transition-[background-color,color,transform] duration-150 hover:bg-zinc-700 hover:text-zinc-100 active:scale-[0.92] touch-manipulation"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
              <p className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Legend</p>
              <div className="flex min-h-7 items-center gap-2.5 px-3 text-[13px]">
                <span className="h-3 w-3 shrink-0 rounded-full border border-white bg-emerald-600" />
                <span className="text-zinc-300">Cleanup site, open to claim</span>
              </div>
              <div className="flex min-h-7 items-center gap-2.5 px-3 text-[13px]">
                <span className="h-3 w-3 shrink-0 rounded-full border border-white bg-zinc-500" />
                <span className="text-zinc-300">Site someone is working</span>
              </div>
              <div className="flex min-h-7 items-center gap-2.5 px-3 text-[13px]">
                <span className="h-3 w-3 shrink-0 rounded-sm border border-dashed border-emerald-400 bg-emerald-400/15" />
                <span className="text-zinc-300">Group area for hosted events</span>
              </div>
              {view !== "sites" && pins.length > 0 && (
                <div className="flex min-h-7 items-center gap-2.5 px-3 text-[13px]">
                  <span className="shrink-0 rounded-full bg-sky-400 px-1.5 text-[10px] font-extrabold leading-4 text-sky-950">$</span>
                  <span className="text-zinc-300">Neighbor job (amber is yours)</span>
                </div>
              )}
              <div className="flex min-h-7 items-center gap-2.5 px-3 text-[13px]">
                <span className="shrink-0 rounded bg-emerald-600 px-1 text-[10px] font-bold leading-4 text-white">$ +</span>
                <span className="text-zinc-300">Open to additions: tap to chip in</span>
              </div>
              <div className="mx-2 my-1 border-t border-zinc-800" />
              <p className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Show on map</p>
              <div className="flex flex-wrap gap-1.5 px-2 pb-1.5">
                <button type="button" onClick={() => setShowSites((v) => !v)} aria-pressed={showSites} className={chip(showSites)}>
                  Cleanup sites ({siteCount})
                </button>
                <button type="button" onClick={() => setShowAreas((v) => !v)} aria-pressed={showAreas} className={chip(showAreas)}>
                  Group areas ({areaCount})
                </button>
                <button type="button" onClick={() => setOpenOnly((v) => !v)} aria-pressed={openOnly} className={chip(openOnly)}>
                  Unclaimed only ({openSiteCount})
                </button>
              </div>
              <p className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Basemap</p>
              <div className="mx-2 mb-1.5 flex gap-0.5 rounded-full bg-zinc-800 p-1">
                {BASEMAPS.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => changeBasemap(b.value)}
                    aria-pressed={basemap === b.value}
                    className={cn(
                      "min-h-9 flex-1 rounded-full px-2 text-xs font-semibold touch-manipulation transition-[background-color,color,transform] duration-150 active:scale-[0.96]",
                      basemap === b.value ? "bg-zinc-600 text-zinc-100" : "text-zinc-400 hover:text-zinc-100",
                    )}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedJob && (
          <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl bg-zinc-900/95 p-3 shadow-elevation-3 ring-1 ring-inset ring-zinc-700 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setSelectedJobId(null)}
              aria-label="Close job"
              className="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full bg-zinc-700 text-zinc-200 touch-manipulation active:scale-[0.92]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
            <p className="truncate text-sm font-bold text-zinc-100">{selectedJob.title}</p>
            <p className="truncate text-xs text-zinc-400">
              <span className="font-extrabold text-sky-300">
                {usd(selectedJob.price_cents)}
                {selectedJob.price_type === "hourly" ? "/hr" : ""}
              </span>{" "}
              · {selectedJob.is_mine ? "Your job · " : ""}
              {JOB_TYPE_LABELS[selectedJob.job_type] ?? selectedJob.job_type} · {whenLabel(selectedJob)}
            </p>
            <div className="mt-2 flex gap-2">
              {onSeeJobInList && !expanded && (
                <button
                  type="button"
                  onClick={() => onSeeJobInList(selectedJob.id)}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-zinc-800 px-3 text-sm font-bold text-zinc-100 touch-manipulation active:scale-[0.96]"
                >
                  <ListOrdered className="h-4 w-4" aria-hidden="true" />
                  Show in list
                </button>
              )}
              <Link
                href={`/fund/jobs/${selectedJob.id}`}
                className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-sky-400 px-4 text-sm font-bold text-sky-950 touch-manipulation active:scale-[0.96]"
              >
                View job
              </Link>
            </div>
          </div>
        )}

        {count === 0 && jobPins.length === 0 && ready && (
          <p className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-zinc-900/80 px-3 py-1 text-xs text-zinc-300 backdrop-blur-sm">
            No funded sites or areas yet.
          </p>
        )}
    </div>
  );
}
