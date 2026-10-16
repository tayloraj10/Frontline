"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Section } from "@/components/ui/PageShell";
import BodyPortal from "@/components/ui/BodyPortal";
import { useSponsoredMapLayer } from "@/components/map/useSponsoredMapLayer";
import { ExpandIcon, mapIconBtn, newGeolocateControl } from "@/components/map/sponsorMapControls";
import { cn } from "@/lib/cn";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const BASEMAPS = [
  { value: "outdoor", label: "Terrain" },
  { value: "streets", label: "Streets" },
  { value: "hybrid", label: "Satellite" },
] as const;
type Basemap = (typeof BASEMAPS)[number]["value"];

const styleUrl = (id: Basemap) => `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;

/** Overview map of every funded site and group area, so sponsors and workers can see where money is. */
export default function SponsoredMap() {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <Section
      title="Sponsored map"
      description="Every funded cleanup site and group area. Tap a pin to see the payout and claim it."
    >
      <div id="sponsored-map" className="h-[26rem] scroll-mt-20 sm:h-[32rem]">
        <MapFrame expanded={false} onToggleExpand={() => setExpanded(true)} />
      </div>
      {/* Portaled to the body like the app's other modals, so no ancestor can clip or offset it. */}
      {expanded && (
        <BodyPortal>
          <div className="fixed inset-0 z-[60] bg-black/90 p-3 sm:p-8">
            <MapFrame expanded onToggleExpand={() => setExpanded(false)} />
          </div>
        </BodyPortal>
      )}
    </Section>
  );
}

function MapFrame({ expanded, onToggleExpand }: { expanded: boolean; onToggleExpand: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("outdoor");
  const [showSites, setShowSites] = useState(true);
  const [showAreas, setShowAreas] = useState(true);
  const [openOnly, setOpenOnly] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const { count, siteCount, areaCount, openSiteCount, points } = useSponsoredMapLayer(map, true, {
    sites: showSites,
    areas: showAreas,
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
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.current = m;
    m.on("load", () => setReady(true));
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  const fitAll = (animate: boolean) => {
    const m = map.current;
    if (!m || points.length === 0) return;
    const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
    points.forEach((p) => bounds.extend(p));
    m.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: animate ? 500 : 0 });
  };

  // Frame every funded site and area once they load.
  useEffect(() => {
    if (ready) fitAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points]);

  const changeBasemap = (next: Basemap) => {
    setBasemap(next);
    map.current?.setStyle(styleUrl(next));
  };

  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center min-h-9 px-3.5 text-[13px] font-semibold rounded-full cursor-pointer touch-manipulation transition-[background-color,color,transform] duration-150 active:scale-[0.96]",
      active ? "bg-emerald-400 text-emerald-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100",
    );

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {/* maplibre's own CSS forces position: relative on its container, so the sizing lives on this parent. */}
        <div className="absolute inset-0">
          <div ref={container} className="h-full w-full" />
        </div>

        {/* Basemap switcher, same segmented pill as the campaign map. */}
        <div className="absolute bottom-3 left-3 z-10 flex gap-0.5 rounded-full bg-zinc-900/90 p-1 shadow-elevation-3 backdrop-blur-sm">
          {BASEMAPS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => changeBasemap(b.value)}
              aria-pressed={basemap === b.value}
              className={cn(
                "min-h-8 rounded-full px-3 text-xs font-medium touch-manipulation transition-[background-color,color,transform] duration-150 active:scale-[0.95]",
                basemap === b.value ? "bg-zinc-600 text-zinc-100" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>

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
            "absolute bottom-12 flex w-[min(88vw,18rem)] flex-col items-end gap-2 text-xs",
            layersOpen ? "right-3 z-40" : "right-3 z-10",
          )}
        >
          <button
            type="button"
            onClick={() => setLayersOpen((v) => !v)}
            aria-expanded={layersOpen}
            className="flex h-11 items-center gap-2 rounded-full bg-zinc-900/90 pl-3.5 pr-4 text-sm font-semibold text-zinc-100 shadow-elevation-3 backdrop-blur-md transition-[background-color,transform] duration-150 hover:bg-zinc-800/90 active:scale-[0.96] touch-manipulation"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m12 3 9 5-9 5-9-5 9-5Z" />
              <path d="m3 13 9 5 9-5" />
            </svg>
            <span>Layers</span>
          </button>
          {layersOpen && (
            <div className="flex max-h-[60%] w-full flex-col gap-0.5 overflow-y-auto rounded-[20px] bg-zinc-900/95 p-2 pt-0 shadow-elevation-4 ring-1 ring-inset ring-white/5 backdrop-blur-md">
              <div className="sticky top-0 z-10 -mx-2 mb-1 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 pb-2 pt-2.5">
                <span className="text-sm font-semibold text-zinc-100">Layers</span>
                <button
                  type="button"
                  onClick={() => setLayersOpen(false)}
                  aria-label="Close layers"
                  className="-mr-2 grid h-9 w-9 place-items-center rounded-full bg-zinc-800 text-zinc-300 transition-[background-color,color,transform] duration-150 hover:bg-zinc-700 hover:text-zinc-100 active:scale-[0.92] touch-manipulation"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
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
              <div className="mx-2 my-1 border-t border-zinc-800" />
              <div className="flex min-h-9 items-center gap-2.5 px-3 text-[13px]">
                <span className="h-3 w-3 shrink-0 rounded-full border border-white bg-emerald-600" />
                <span className="text-zinc-300">Cleanup site, open to claim</span>
              </div>
              <div className="flex min-h-9 items-center gap-2.5 px-3 text-[13px]">
                <span className="h-3 w-3 shrink-0 rounded-full border border-white bg-zinc-500" />
                <span className="text-zinc-300">Site someone is working</span>
              </div>
              <div className="flex min-h-9 items-center gap-2.5 px-3 text-[13px]">
                <span className="h-3 w-3 shrink-0 rounded-sm border border-dashed border-emerald-400 bg-emerald-400/15" />
                <span className="text-zinc-300">Group area for hosted events</span>
              </div>
            </div>
          )}
        </div>

        {count === 0 && ready && (
          <p className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-zinc-900/80 px-3 py-1 text-xs text-zinc-300 backdrop-blur-sm">
            No funded sites or areas yet.
          </p>
        )}
    </div>
  );
}
