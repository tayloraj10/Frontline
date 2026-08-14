"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl(id: string) {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

// Max/preferred porthole diameter — the actual rendered size (measured via ResizeObserver
// below) can be smaller on narrow viewports, since the wrapper is styled to shrink to fit.
const CONTAINER_PX = 400;
// Radius circle fills this fraction of the porthole diameter, leaving a margin so points
// right at the edge of the tier aren't clipped by the circular mask.
const FILL_FACTOR = 0.8;

function zoomForRadius(radiusMeters: number, lat: number, containerPx: number): number {
  const metersPerPixel = radiusMeters / ((containerPx / 2) * FILL_FACTOR);
  // 156543.03392 is meters-per-pixel at zoom 0 for the classic 256px-tile slippy-map
  // convention (Leaflet/Google/OSM). MapLibre GL JS uses 512px base tiles, so its zoom
  // numbering is offset by exactly 1 from that formula — the "- 1" corrects for it.
  // Without it the map renders at double the intended zoom (half the intended radius).
  const z = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / metersPerPixel) - 1;
  return Math.max(1, Math.min(20, z));
}

function circlePolygon(lat: number, lng: number, radiusMeters: number): GeoJSON.Feature {
  const points: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * 2 * Math.PI;
    const dLat = (radiusMeters * Math.cos(angle)) / 111320;
    const dLng = (radiusMeters * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));
    points.push([lng + dLng, lat + dLat]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [points] },
  };
}

type PointKind = "contribution" | "group_event" | "cleanup_event" | "trash_report";
type RadiusPoint = { id: string; lat: number; lng: number; kind: PointKind };

const LEGEND_ITEMS: { kind: PointKind | "business"; label: string; color: string }[] = [
  { kind: "business", label: "Your location", color: "#f59e0b" },
  { kind: "contribution", label: "Cleanups", color: "#22c55e" },
  { kind: "group_event", label: "Group cleanup contribution", color: "#38bdf8" },
  { kind: "cleanup_event", label: "Cleanup event", color: "#a855f7" },
  { kind: "trash_report", label: "Trash report", color: "#f97316" },
];

export default function RadiusRadarMap({
  businessId,
  locationId,
  campaignId,
  centerLat,
  centerLng,
  radiusTier,
  fastapiUrl,
  viewerUserId,
}: {
  businessId: string;
  locationId: string;
  campaignId: string;
  centerLat: number;
  centerLng: number;
  radiusTier: "block" | "neighborhood" | "wide";
  fastapiUrl: string;
  viewerUserId: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [radiusMeters, setRadiusMeters] = useState<number | null>(null);
  const [points, setPoints] = useState<RadiusPoint[]>([]);
  // Explicit pixel size of the porthole, measured off the row wrapper (which always has a
  // definite width from normal block layout) rather than expressed as a percentage on the
  // map div itself — the map div sits in an auto-sized grid/flex track, so a percentage
  // width on it has nothing definite to resolve against and collapses to 0.
  const [mapPx, setMapPx] = useState(CONTAINER_PX);
  // Radius of the visible porthole clip, matched to wherever MapLibre actually projects the
  // dashed boundary line — not a separately hand-derived pixel value — so the clip can never
  // drift out of sync with what the green line is really showing.
  const [clipRadiusPx, setClipRadiusPx] = useState<number>((CONTAINER_PX / 2) * FILL_FACTOR);

  useEffect(() => {
    if (!rowRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setMapPx(Math.min(CONTAINER_PX, width));
    });
    ro.observe(rowRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl("outdoor"),
      center: [centerLng, centerLat],
      zoom: 14,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = m;
    m.on("error", (e) => console.error("RadiusRadarMap error:", e.error));
    m.on("load", () => {
      m.addSource("radar-boundary", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "radar-boundary-fill",
        type: "fill",
        source: "radar-boundary",
        paint: { "fill-color": "#22c55e", "fill-opacity": 0.06 },
      });
      m.addLayer({
        id: "radar-boundary-line",
        type: "line",
        source: "radar-boundary",
        paint: { "line-color": "#22c55e", "line-width": 1.5, "line-dasharray": [2, 2], "line-opacity": 0.6 },
      });
      m.addSource("radar-pts", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "radar-dots-halo",
        type: "circle",
        source: "radar-pts",
        filter: ["==", ["get", "kind"], "group_event"],
        paint: {
          "circle-radius": 9,
          "circle-color": "#38bdf8",
          "circle-opacity": 0.55,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#38bdf8",
          "circle-stroke-opacity": 0.9,
        },
      });
      m.addLayer({
        id: "radar-dots-cleanup-event",
        type: "circle",
        source: "radar-pts",
        filter: ["==", ["get", "kind"], "cleanup_event"],
        paint: {
          "circle-radius": 7,
          "circle-color": "#a855f7",
          "circle-opacity": 0.85,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
          "circle-stroke-opacity": 0.8,
        },
      });
      m.addLayer({
        id: "radar-dots-trash-report",
        type: "circle",
        source: "radar-pts",
        filter: ["==", ["get", "kind"], "trash_report"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#f97316",
          "circle-opacity": 0.85,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
          "circle-stroke-opacity": 0.8,
        },
      });
      m.addLayer({
        id: "radar-dots",
        type: "circle",
        source: "radar-pts",
        filter: ["==", ["get", "kind"], "contribution"],
        paint: {
          "circle-radius": 5,
          "circle-color": "#22c55e",
          "circle-opacity": 0.9,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#fff",
          "circle-stroke-opacity": 0.7,
        },
      });
      markerRef.current = new maplibregl.Marker({ color: "#f59e0b" }).setLngLat([centerLng, centerLat]).addTo(m);
      setMapLoaded(true);
    });

    // The container can measure 0 height at mount time (layout inside the tab card hasn't
    // settled yet), which leaves MapLibre's tile requests computed for a degenerate viewport.
    // Non-tiled GeoJSON layers redraw fine regardless, but base tiles never get re-requested
    // without an explicit resize once the container reaches its real size.
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      m.remove();
      mapRef.current = null;
      markerRef.current = null;
      setMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Business locations can switch under this component (multi-location businesses); the pin
  // needs to follow, independent of the radius-points fetch below.
  useEffect(() => {
    markerRef.current?.setLngLat([centerLng, centerLat]);
  }, [centerLat, centerLng]);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    const params = new URLSearchParams({
      campaign_id: campaignId,
      viewer_user_id: viewerUserId,
      radius_tier: radiusTier,
    });
    fetch(`${fastapiUrl}/api/partners/businesses/${businessId}/locations/${locationId}/radius-points?${params}`)
      .then((res) => res.json())
      .then((json: { radius_meters: number; points: RadiusPoint[] }) => {
        if (cancelled) return;
        setRadiusMeters(json.radius_meters);
        setPoints(json.points);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [businessId, locationId, campaignId, radiusTier, fastapiUrl, viewerUserId]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapLoaded || radiusMeters === null) return;
    m.jumpTo({ center: [centerLng, centerLat], zoom: zoomForRadius(radiusMeters, centerLat, mapPx) });
    (m.getSource("radar-boundary") as maplibregl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: [circlePolygon(centerLat, centerLng, radiusMeters)],
    });
    (m.getSource("radar-pts") as maplibregl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        properties: { kind: p.kind },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    });
    // Same north-point formula circlePolygon uses for its angle=0 vertex — project it and the
    // center through MapLibre's own projection to get the boundary line's actual on-screen
    // radius, so the clip mask always hugs the drawn line exactly.
    const centerPx = m.project([centerLng, centerLat]);
    const northPx = m.project([centerLng, centerLat + radiusMeters / 111320]);
    setClipRadiusPx(Math.hypot(northPx.x - centerPx.x, northPx.y - centerPx.y));
  }, [mapLoaded, radiusMeters, points, centerLat, centerLng, mapPx]);

  const presentKinds = new Set(points.map((p) => p.kind));

  return (
    <div
      ref={rowRef}
      className="flex flex-col items-center gap-2 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4"
    >
      <div className="hidden sm:block" aria-hidden="true" />
      <div className="relative" style={{ width: mapPx, height: mapPx }}>
        <div
          ref={containerRef}
          style={{ width: mapPx, height: mapPx, clipPath: `circle(${clipRadiusPx}px at center)` }}
        />
        <div
          className="pointer-events-none absolute rounded-full border-2 border-emerald-700/60 ring-1 ring-inset ring-emerald-500/20 shadow-elevation-2"
          style={{
            width: clipRadiusPx * 2,
            height: clipRadiusPx * 2,
            left: mapPx / 2 - clipRadiusPx,
            top: mapPx / 2 - clipRadiusPx,
          }}
        />
      </div>
      <div className="shrink-0 flex flex-wrap justify-center gap-x-3 gap-y-1 sm:flex-col sm:justify-self-start sm:gap-1.5 text-xs text-zinc-500">
        {LEGEND_ITEMS.filter(
          (item) => item.kind === "business" || presentKinds.has(item.kind)
        ).map((item) =>
          item.kind === "business" ? (
            <span key={item.kind} className="flex items-center gap-1.5">
              <svg
                width="10"
                height="14"
                viewBox="0 0 10 14"
                className="shrink-0"
                aria-hidden="true"
              >
                <path
                  d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z"
                  fill={item.color}
                />
                <circle cx="5" cy="5" r="1.8" fill="#fff" />
              </svg>
              {item.label}
            </span>
          ) : (
            <span key={item.kind} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          )
        )}
      </div>
    </div>
  );
}
