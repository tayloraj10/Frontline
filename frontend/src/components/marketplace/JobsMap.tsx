"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, ListOrdered, X } from "lucide-react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ExpandIcon, mapIconBtn, newGeolocateControl } from "@/components/map/sponsorMapControls";
import { cn } from "@/lib/cn";
import { JOB_TYPE_LABELS, usd, whenLabel, type Job } from "@/lib/marketplace";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const BASEMAPS = [
  { value: "outdoor", label: "Terrain" },
  { value: "streets", label: "Streets" },
  { value: "hybrid", label: "Satellite" },
] as const;
type Basemap = (typeof BASEMAPS)[number]["value"];
const styleUrl = (id: Basemap) => `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;

/** Open jobs as price pins. Positions on the board are rounded server side, so this never shows an exact address. */
export default function JobsMap({
  jobs,
  selectedId,
  onSelect,
  onSeeInList,
}: {
  jobs: Job[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSeeInList?: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, { marker: maplibregl.Marker; el: HTMLButtonElement }>>(new Map());
  const select = useRef(onSelect);
  const [basemap, setBasemap] = useState<Basemap>("outdoor");
  const [expanded, setExpanded] = useState(false);
  const selectedJob = selectedId ? jobs.find((j) => j.id === selectedId) : null;
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
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
    mapRef.current = m;
    const current = markers.current;
    return () => {
      current.forEach((v) => v.marker.remove());
      current.clear();
      m.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    markers.current.forEach((v) => v.marker.remove());
    markers.current.clear();
    const located = jobs.filter((j) => j.latitude != null && j.longitude != null);
    for (const j of located) {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = usd(j.price_cents);
      el.setAttribute("aria-label", `${j.title}, ${usd(j.price_cents)}`);
      el.className = "rounded-full bg-emerald-400 px-2.5 py-1 text-xs font-extrabold text-emerald-950 shadow-lg ring-2 ring-white/80";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        select.current(j.id);
      });
      const marker = new maplibregl.Marker({ element: el }).setLngLat([j.longitude as number, j.latitude as number]).addTo(m);
      markers.current.set(j.id, { marker, el });
    }
    if (located.length) {
      const b = new maplibregl.LngLatBounds();
      located.forEach((j) => b.extend([j.longitude as number, j.latitude as number]));
      m.fitBounds(b, { padding: 48, maxZoom: 14, duration: 0 });
    }
  }, [jobs]);

  useEffect(() => {
    markers.current.forEach(({ el }, id) => {
      const on = id === selectedId;
      el.style.transform = on ? "scale(1.2)" : "";
      el.style.zIndex = on ? "2" : "";
      el.classList.toggle("bg-sky-400", on);
      el.classList.toggle("bg-emerald-400", !on);
    });
    const sel = selectedId ? markers.current.get(selectedId) : null;
    if (sel && mapRef.current) {
      mapRef.current.easeTo({ center: sel.marker.getLngLat(), padding: { bottom: 110, top: 0, left: 0, right: 0 }, duration: 300 });
    } else {
      mapRef.current?.easeTo({ padding: { bottom: 0, top: 0, left: 0, right: 0 }, duration: 0 });
    }
  }, [selectedId]);

  // The expanded map is the same instance in a larger box, so tell it to re-measure.
  useEffect(() => {
    mapRef.current?.resize();
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const changeBasemap = (next: Basemap) => {
    setBasemap(next);
    mapRef.current?.setStyle(styleUrl(next));
  };

  return (
    <div className={cn(expanded ? "fixed inset-0 z-[60] bg-black/90 p-3 sm:p-8" : "relative")}>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900",
          expanded ? "h-full" : "h-72 w-full sm:h-96",
        )}
      >
        {/* maplibre's CSS forces position: relative on its container, so sizing lives on this parent. */}
        <div className="absolute inset-0">
          <div ref={container} className="h-full w-full" />
        </div>
        <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Close expanded map" : "Expand map"}
            aria-label={expanded ? "Close expanded map" : "Expand map"}
            className={mapIconBtn}
          >
            <ExpandIcon open={expanded} />
          </button>
        </div>
        {selectedJob && (
          <div className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-3 rounded-2xl bg-zinc-900/95 p-3 shadow-elevation-3 ring-1 ring-inset ring-zinc-700 backdrop-blur-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-zinc-100">{selectedJob.title}</p>
              <p className="truncate text-xs text-zinc-400">
                <span className="font-extrabold text-emerald-300">
                  {usd(selectedJob.price_cents)}
                  {selectedJob.price_type === "hourly" ? "/hr" : ""}
                </span>{" "}
                · {JOB_TYPE_LABELS[selectedJob.job_type] ?? selectedJob.job_type} · {whenLabel(selectedJob)}
              </p>
            </div>
            {onSeeInList && !expanded && (
              <button
                type="button"
                onClick={() => onSeeInList(selectedJob.id)}
                aria-label="Show in list"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200 active:scale-[0.95]"
              >
                <ListOrdered className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <Link
              href={`/marketplace/jobs/${selectedJob.id}`}
              className="inline-flex min-h-10 shrink-0 items-center gap-0.5 rounded-xl bg-emerald-400 px-3 text-sm font-extrabold text-emerald-950 active:scale-[0.97]"
            >
              View
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => onSelect(null)}
              aria-label="Clear selection"
              className="absolute -right-1 -top-1 inline-flex size-6 items-center justify-center rounded-full bg-zinc-700 text-zinc-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className={cn("absolute bottom-3 left-3 z-10 flex gap-0.5 rounded-full bg-zinc-900/90 p-1 shadow-elevation-3 backdrop-blur-sm", selectedJob && "hidden")}>
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
      </div>
    </div>
  );
}
