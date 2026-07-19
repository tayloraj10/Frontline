"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl(id: string) {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

const LOOP_CLOSE_METERS = 20;

/** Haversine distance in meters between two [lng, lat] points. */
function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Click-to-add-vertex route drawing tool. Standalone map instance (no campaign
 * dependencies), following the same self-contained pattern as RoutePreviewMap. */
export default function RoutePicker({
  centerLat,
  centerLng,
  initialCoordinates = null,
  onChange,
  styleId = "outdoor",
  heightClassName = "h-[360px]",
}: {
  centerLat: number;
  centerLng: number;
  initialCoordinates?: [number, number][] | null;
  onChange: (coordinates: [number, number][] | null) => void;
  styleId?: string;
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const coordsRef = useRef<[number, number][]>(initialCoordinates ?? []);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [coordCount, setCoordCount] = useState(coordsRef.current.length);
  const [justClosedLoop, setJustClosedLoop] = useState(false);

  const redraw = () => {
    const m = mapRef.current;
    if (!m) return;
    const src = m.getSource("route-picker") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const coords = coordsRef.current;
    src.setData({
      type: "FeatureCollection",
      features: [
        ...(coords.length >= 2
          ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } }]
          : []),
        ...coords.map((c) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: c } })),
      ],
    });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initialCenter: [number, number] =
      coordsRef.current.length > 0 ? coordsRef.current[coordsRef.current.length - 1] : [centerLng, centerLat];

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(styleId),
      center: initialCenter,
      zoom: 15,
      attributionControl: false,
    });
    mapRef.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");

    m.on("load", () => {
      m.addSource("route-picker", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "route-picker-casing",
        type: "line",
        source: "route-picker",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
      });
      m.addLayer({
        id: "route-picker-line",
        type: "line",
        source: "route-picker",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f59e0b", "line-width": 4, "line-dasharray": [0.5, 1.5] },
      });
      m.addLayer({
        id: "route-picker-vertices",
        type: "circle",
        source: "route-picker",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#f59e0b",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#451a03",
        },
      });
      redraw();
      if (coordsRef.current.length >= 2) {
        const bounds = coordsRef.current.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(coordsRef.current[0], coordsRef.current[0]),
        );
        m.fitBounds(bounds, { padding: 40 });
      }
    });

    m.on("click", (e) => {
      const clicked: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const start = coordsRef.current[0];
      const shouldSnap = coordsRef.current.length >= 2 && distanceMeters(clicked, start) <= LOOP_CLOSE_METERS;
      const next = shouldSnap ? start : clicked;

      coordsRef.current = [...coordsRef.current, next];
      setCoordCount(coordsRef.current.length);
      setJustClosedLoop(shouldSnap);
      redraw();
      onChangeRef.current(coordsRef.current.length >= 2 ? coordsRef.current : null);
    });

    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undoLast = () => {
    coordsRef.current = coordsRef.current.slice(0, -1);
    setCoordCount(coordsRef.current.length);
    setJustClosedLoop(false);
    redraw();
    onChangeRef.current(coordsRef.current.length >= 2 ? coordsRef.current : null);
  };

  const clearAll = () => {
    coordsRef.current = [];
    setCoordCount(0);
    setJustClosedLoop(false);
    redraw();
    onChangeRef.current(null);
  };

  return (
    <div className={`relative w-full ${heightClassName}`}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden border border-zinc-700/50" />

      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-zinc-900/95 border border-zinc-700 rounded-lg text-xs text-zinc-200 shadow-xl whitespace-nowrap">
        {justClosedLoop
          ? "Route closed — click Undo to reopen"
          : `Click the map to draw your route (${coordCount} point${coordCount === 1 ? "" : "s"})`}
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        <button
          type="button"
          onClick={undoLast}
          disabled={coordCount === 0}
          className="px-3 py-2 text-xs font-medium bg-zinc-900/95 hover:bg-zinc-800 disabled:bg-zinc-900/50 disabled:text-zinc-600 border border-zinc-700 text-zinc-200 rounded-lg shadow-xl transition-colors"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={coordCount === 0}
          className="px-3 py-2 text-xs font-medium bg-zinc-900/95 hover:bg-zinc-800 disabled:bg-zinc-900/50 disabled:text-zinc-600 border border-zinc-700 text-zinc-200 rounded-lg shadow-xl transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
