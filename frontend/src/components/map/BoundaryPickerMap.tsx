"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LngLat } from "@/lib/areaShape";
import { ExpandIcon, mapIconBtn, newGeolocateControl } from "./sponsorMapControls";
import { cn } from "@/lib/cn";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const SRC = "boundary-picker";
const FILL = "boundary-picker-fill";
const LINE = "boundary-picker-line";
const SOURCE_LAYER = "boundaries";
const COLOR = "#34d399";

const BASEMAPS = [
  { value: "outdoor", label: "Terrain" },
  { value: "streets", label: "Streets" },
  { value: "hybrid", label: "Satellite" },
] as const;
type Basemap = (typeof BASEMAPS)[number]["value"];
const styleUrl = (id: Basemap) => `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;

/** Zoom below which a type has too many shapes to draw (tens of thousands of zips). */
const MIN_ZOOM_BY_TYPE: Record<string, number> = { zip: 8, uk_postcode_district: 7 };
const DEFAULT_ZOOM_BY_TYPE: Record<string, number> = { zip: 9, uk_postcode_district: 8 };
const CENTER_BY_TYPE: Record<string, LngLat> = {
  nyc_neighborhood: [-73.95, 40.7],
  chicago_neighborhood: [-87.65, 41.85],
  la_neighborhood: [-118.3, 34.05],
  philadelphia_neighborhood: [-75.15, 39.95],
  zip: [-73.95, 40.7],
  uk_postcode_district: [-0.12, 51.5],
};

export interface PickedBoundary {
  id: string;
  label: string;
}

/**
 * Tap-to-pick boundary map for sponsored areas. Shows every boundary of one type, tap to add or
 * remove it. Fully controlled: the parent owns the selected ids and the boundary type.
 */
export default function BoundaryPickerMap({
  unitType,
  selectedIds,
  onToggle,
  atLimit,
  flyTo,
}: {
  unitType: string;
  selectedIds: string[];
  onToggle: (b: PickedBoundary) => void;
  /** True when no more boundaries can be added; taps can still remove. */
  atLimit: boolean;
  /** Change this to pan the map to a searched place. */
  flyTo?: LngLat | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [basemap, setBasemap] = useState<Basemap>("outdoor");
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(11);
  const appliedIds = useRef<Set<string>>(new Set());
  const [limitNote, setLimitNote] = useState(false);

  const live = useRef({ unitType, selectedIds, onToggle, atLimit });
  live.current = { unitType, selectedIds, onToggle, atLimit };

  const minZoom = MIN_ZOOM_BY_TYPE[unitType] ?? 0;

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const start = live.current.unitType;
    const m = new maplibregl.Map({
      container: container.current,
      style: styleUrl("outdoor"),
      center: CENTER_BY_TYPE[start] ?? [-73.95, 40.7],
      zoom: DEFAULT_ZOOM_BY_TYPE[start] ?? 10.5,
      attributionControl: false,
      cooperativeGestures: true,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(newGeolocateControl(), "top-right");
    m.on("style.load", () => {
      setReady(true);
      setStyleVersion((v) => v + 1);
    });
    m.on("zoom", () => setZoom(m.getZoom()));
    m.on("click", (e) => {
      if (!m.getLayer(FILL)) return;
      const f = m.queryRenderedFeatures(e.point, { layers: [FILL] })[0];
      if (!f || f.id === undefined) return;
      const id = String(f.id);
      const { selectedIds: ids, atLimit: full, onToggle: toggle } = live.current;
      if (!ids.includes(id) && full) {
        setLimitNote(true);
        return;
      }
      const props = f.properties as { display_name?: string };
      toggle({ id, label: props.display_name ?? "Area" });
    });
    m.on("mousemove", FILL, () => {
      m.getCanvas().style.cursor = "pointer";
    });
    m.on("mouseleave", FILL, () => {
      m.getCanvas().style.cursor = "";
    });
    mapRef.current = m;
    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, []);

  // (Re)build the boundary layers when the type changes or a basemap switch wipes the style.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    if (m.getLayer(LINE)) m.removeLayer(LINE);
    if (m.getLayer(FILL)) m.removeLayer(FILL);
    if (m.getSource(SRC)) m.removeSource(SRC);
    appliedIds.current = new Set();
    m.addSource(SRC, {
      type: "vector",
      tiles: [`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/boundaries/${unitType}/{z}/{x}/{y}.mvt`],
      minzoom: 0,
      maxzoom: 14,
      promoteId: "geo_unit_id",
    });
    const sel: maplibregl.ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];
    m.addLayer({
      id: FILL,
      type: "fill",
      source: SRC,
      "source-layer": SOURCE_LAYER,
      minzoom: minZoom,
      paint: {
        "fill-color": ["case", sel, COLOR, "#a1a1aa"],
        "fill-opacity": ["case", sel, 0.5, 0.12],
      },
    });
    m.addLayer({
      id: LINE,
      type: "line",
      source: SRC,
      "source-layer": SOURCE_LAYER,
      minzoom: minZoom,
      paint: {
        "line-color": ["case", sel, COLOR, "#a1a1aa"],
        "line-width": ["case", sel, 2.5, 1],
        "line-opacity": 0.9,
      },
    });
  }, [ready, styleVersion, unitType, minZoom]);

  // Highlight the picked ids. Feature state is keyed by id, so ids that are off screen light up
  // as soon as their tile loads.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !m.getSource(SRC)) return;
    const next = new Set(selectedIds);
    for (const id of appliedIds.current) {
      if (!next.has(id)) m.setFeatureState({ source: SRC, sourceLayer: SOURCE_LAYER, id }, { selected: false });
    }
    for (const id of next) {
      m.setFeatureState({ source: SRC, sourceLayer: SOURCE_LAYER, id }, { selected: true });
    }
    appliedIds.current = next;
    setLimitNote(false);
  }, [ready, styleVersion, unitType, selectedIds]);

  // Jump to a sensible spot when the type changes (a zip layer is useless zoomed out).
  const lastType = useRef(unitType);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || lastType.current === unitType) return;
    lastType.current = unitType;
    const c = m.getCenter();
    const near = CENTER_BY_TYPE[unitType];
    const target: LngLat = near && Math.abs(c.lng - near[0]) + Math.abs(c.lat - near[1]) > 3 ? near : [c.lng, c.lat];
    m.flyTo({ center: target, zoom: Math.max(m.getZoom(), DEFAULT_ZOOM_BY_TYPE[unitType] ?? 10.5), duration: 800 });
  }, [ready, unitType]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !flyTo) return;
    m.flyTo({ center: flyTo, zoom: Math.max(m.getZoom(), 12), duration: 800 });
  }, [ready, flyTo]);

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

        {zoom < minZoom && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-14">
            <p className="rounded-full bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-200 shadow-elevation-3 backdrop-blur-sm">
              Zoom in to see these boundaries
            </p>
          </div>
        )}
        {limitNote && (
          <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center px-3">
            <p className="rounded-full bg-amber-500/20 px-3 py-1.5 text-xs text-amber-200 shadow-elevation-3 backdrop-blur-sm">
              That is the most boundaries one area can combine. Tap a green one to remove it.
            </p>
          </div>
        )}

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
      </div>
    </div>
  );
}
