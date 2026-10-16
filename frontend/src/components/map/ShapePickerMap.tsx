"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { circleRing, type LngLat } from "@/lib/areaShape";
import { ExpandIcon, mapIconBtn, newGeolocateControl } from "./sponsorMapControls";
import { cn } from "@/lib/cn";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const SRC = "shape-picker";
const FILL = "shape-picker-fill";
const LINE = "shape-picker-line";
const COLOR = "#34d399";

const BASEMAPS = [
  { value: "outdoor", label: "Terrain" },
  { value: "streets", label: "Streets" },
  { value: "hybrid", label: "Satellite" },
] as const;
type Basemap = (typeof BASEMAPS)[number]["value"];
const styleUrl = (id: Basemap) => `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;

/**
 * Tap-to-place map used by sponsors (payments v2) to define a place.
 *  - mode "point": one draggable pin plus a ground-accurate radius circle.
 *  - mode "polygon": tap to add corners, drag a corner to adjust it. The outline closes
 *    itself once there are 3+ corners. Corners are plain draggable markers, which is the
 *    most reliable way to edit a shape with a finger.
 * It is fully controlled: the parent owns the point, radius and vertices.
 */
export default function ShapePickerMap({
  mode,
  point,
  radiusMeters,
  onPoint,
  vertices,
  onVertices,
  flyTo,
  invalid,
}: {
  mode: "point" | "polygon";
  point: LngLat | null;
  radiusMeters: number;
  onPoint: (p: LngLat) => void;
  vertices: LngLat[];
  onVertices: (v: LngLat[]) => void;
  /** Change this to pan the map (e.g. after "Use my location"). */
  flyTo?: LngLat | null;
  /** Draws the shape red instead of green while the parent says it is not valid. */
  invalid?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  // Bumped every time a style finishes loading, because switching basemaps wipes our shape layers.
  const [styleVersion, setStyleVersion] = useState(0);
  const [basemap, setBasemap] = useState<Basemap>("outdoor");
  const [expanded, setExpanded] = useState(false);
  const pinRef = useRef<maplibregl.Marker | null>(null);
  const cornerRefs = useRef<maplibregl.Marker[]>([]);

  // Latest props for the long-lived map handlers.
  const live = useRef({ mode, vertices, onPoint, onVertices });
  live.current = { mode, vertices, onPoint, onVertices };

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: styleUrl("outdoor"),
      center: point ?? [-73.95, 40.7],
      zoom: point ? 15 : 11,
      attributionControl: false,
      cooperativeGestures: true,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(newGeolocateControl(), "top-right");
    // Runs on the first load and again after every basemap switch.
    m.on("style.load", () => {
      if (!m.getSource(SRC)) {
        m.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: FILL, type: "fill", source: SRC, paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18 } });
        m.addLayer({
          id: LINE,
          type: "line",
          source: SRC,
          paint: { "line-color": ["get", "color"], "line-width": 2.5 },
        });
      }
      setReady(true);
      setStyleVersion((v) => v + 1);
    });
    m.on("click", (e) => {
      const { mode: md, vertices: vs, onPoint: setPoint, onVertices: setVertices } = live.current;
      const p: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (md === "point") setPoint(p);
      else setVertices([...vs, p]);
    });
    mapRef.current = m;
    return () => {
      pinRef.current?.remove();
      cornerRefs.current.forEach((c) => c.remove());
      cornerRefs.current = [];
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once
  }, []);

  // Shape overlay.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    const color = invalid ? "#f87171" : COLOR;
    const features: GeoJSON.Feature[] = [];
    if (mode === "point" && point) {
      features.push({
        type: "Feature",
        properties: { color },
        geometry: { type: "Polygon", coordinates: [circleRing(point, radiusMeters)] },
      });
    } else if (mode === "polygon" && vertices.length >= 2) {
      features.push(
        vertices.length >= 3
          ? {
              type: "Feature",
              properties: { color },
              geometry: { type: "Polygon", coordinates: [[...vertices, vertices[0]]] },
            }
          : { type: "Feature", properties: { color }, geometry: { type: "LineString", coordinates: vertices } },
      );
    }
    (m.getSource(SRC) as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
  }, [ready, styleVersion, mode, point, radiusMeters, vertices, invalid]);

  // Point-mode pin.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    if (mode !== "point" || !point) {
      pinRef.current?.remove();
      pinRef.current = null;
      return;
    }
    if (!pinRef.current) {
      const pin = new maplibregl.Marker({ color: COLOR, draggable: true }).setLngLat(point).addTo(m);
      pin.on("dragend", () => {
        const ll = pin.getLngLat();
        live.current.onPoint([ll.lng, ll.lat]);
      });
      pinRef.current = pin;
    } else {
      pinRef.current.setLngLat(point);
    }
  }, [ready, mode, point]);

  // Polygon corners as draggable numbered dots.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    cornerRefs.current.forEach((c) => c.remove());
    cornerRefs.current = [];
    if (mode !== "polygon") return;
    cornerRefs.current = vertices.map((v, i) => {
      const dot = document.createElement("div");
      dot.style.cssText =
        "width:26px;height:26px;border-radius:999px;background:#059669;color:#fff;border:2px solid #fff;" +
        "display:flex;align-items:center;justify-content:center;font:700 12px system-ui;" +
        "box-shadow:0 1px 4px rgba(0,0,0,.5);cursor:grab;touch-action:none";
      dot.textContent = String(i + 1);
      // A tap on a corner must not also add a new corner underneath it.
      dot.addEventListener("click", (ev) => ev.stopPropagation());
      const mk = new maplibregl.Marker({ element: dot, draggable: true }).setLngLat(v).addTo(m);
      mk.on("dragend", () => {
        const ll = mk.getLngLat();
        const next = live.current.vertices.slice();
        next[i] = [ll.lng, ll.lat];
        live.current.onVertices(next);
      });
      return mk;
    });
  }, [ready, mode, vertices]);

  // Pan on request.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !flyTo) return;
    m.flyTo({ center: flyTo, zoom: Math.max(m.getZoom(), 16), duration: 800 });
  }, [ready, flyTo]);

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
