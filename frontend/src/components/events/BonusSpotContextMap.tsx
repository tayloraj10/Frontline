"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fetchMapContext, type MapContextPoint } from "@/lib/events";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl() {
  return `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`;
}

const LEGEND_ITEMS: { kind: MapContextPoint["kind"] | "pin"; label: string; color: string }[] = [
  { kind: "pin", label: "Bonus spot", color: "#f59e0b" },
  { kind: "cleanup", label: "Cleanups", color: "#22c55e" },
  { kind: "trash_report", label: "Trash report", color: "#f97316" },
  { kind: "partner", label: "Partner business", color: "#a855f7" },
];

const KIND_PAINT: Record<MapContextPoint["kind"], maplibregl.CircleLayerSpecification["paint"]> = {
  cleanup: {
    "circle-radius": 5,
    "circle-color": "#22c55e",
    "circle-opacity": 0.9,
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#fff",
    "circle-stroke-opacity": 0.7,
  },
  trash_report: {
    "circle-radius": 5,
    "circle-color": "#f97316",
    "circle-opacity": 0.85,
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#fff",
    "circle-stroke-opacity": 0.8,
  },
  partner: {
    "circle-radius": 6,
    "circle-color": "#a855f7",
    "circle-opacity": 0.85,
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "#fff",
    "circle-stroke-opacity": 0.8,
  },
};

/**
 * Shared "simplified trash war map" used by both the auto-suggest preview and the
 * manual pin picker in BonusSpotForm -- same layers (cleanups, trash reports,
 * partners, current location), same zoom/pan interactivity, differing only in
 * whether the pin can be moved.
 */
export default function BonusSpotContextMap({
  campaignId,
  lat,
  lng,
  onChange,
  editable,
  initialCenter,
  initialZoom = 12,
  heightClassName = "h-[320px]",
}: {
  campaignId: string;
  lat: number | null;
  lng: number | null;
  onChange?: (lat: number, lng: number) => void;
  editable: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastAppliedRef = useRef<{ lat: number; lng: number } | null>(
    lat !== null && lng !== null ? { lat, lng } : null
  );

  const [mapLoaded, setMapLoaded] = useState(false);
  const [points, setPoints] = useState<MapContextPoint[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      center: lat !== null && lng !== null ? [lng, lat] : initialCenter ?? [-73.95, 40.7],
      zoom: initialZoom,
      attributionControl: false,
      interactive: true,
    });
    mapRef.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    if (navigator.geolocation) {
      m.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: false,
          showUserLocation: true,
        }),
        "top-right"
      );
    }

    m.on("load", () => {
      m.addSource("bonus-spot-ctx-pts", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      for (const kind of Object.keys(KIND_PAINT) as MapContextPoint["kind"][]) {
        m.addLayer({
          id: `bonus-spot-ctx-${kind}`,
          type: "circle",
          source: "bonus-spot-ctx-pts",
          filter: ["==", ["get", "kind"], kind],
          paint: KIND_PAINT[kind],
        });
      }
      setMapLoaded(true);
    });

    const marker = new maplibregl.Marker({ color: "#f59e0b", draggable: editable });
    if (lat !== null && lng !== null) marker.setLngLat([lng, lat]).addTo(m);
    if (editable) {
      marker.on("dragend", () => {
        const { lat: newLat, lng: newLng } = marker.getLngLat();
        onChangeRef.current?.(newLat, newLng);
      });
      m.on("click", (e) => {
        marker.setLngLat(e.lngLat);
        if (!marker.getElement().isConnected) marker.addTo(m);
        onChangeRef.current?.(e.lngLat.lat, e.lngLat.lng);
      });
    }
    markerRef.current = marker;

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
  }, [editable]);

  // Recenter and move the pin when lat/lng change from outside (a re-roll of the
  // suggestion, or an address-driven update), without fighting an in-progress drag.
  useEffect(() => {
    const m = mapRef.current;
    const marker = markerRef.current;
    if (!m || !marker || lat === null || lng === null) return;
    if (lastAppliedRef.current?.lat === lat && lastAppliedRef.current?.lng === lng) return;
    lastAppliedRef.current = { lat, lng };
    marker.setLngLat([lng, lat]);
    if (!marker.getElement().isConnected) marker.addTo(m);
    m.flyTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), 14) });
  }, [lat, lng]);

  useEffect(() => {
    let cancelled = false;
    fetchMapContext(campaignId)
      .then((pts) => {
        if (!cancelled) setPoints(pts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapLoaded) return;
    (m.getSource("bonus-spot-ctx-pts") as maplibregl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        properties: { kind: p.kind },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    });
  }, [mapLoaded, points]);

  const presentKinds = new Set(points.map((p) => p.kind));

  return (
    <div>
      <div ref={containerRef} className={`w-full ${heightClassName} rounded-lg overflow-hidden border border-zinc-700/50 shadow-elevation-1`} />
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px] text-zinc-500">
        {LEGEND_ITEMS.filter((item) => item.kind === "pin" || presentKinds.has(item.kind)).map((item) =>
          item.kind === "pin" ? (
            <span key={item.kind} className="flex items-center gap-1">
              <svg width="8" height="11" viewBox="0 0 10 14" className="shrink-0" aria-hidden="true">
                <path
                  d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z"
                  fill={item.color}
                />
                <circle cx="5" cy="5" r="1.8" fill="#fff" />
              </svg>
              {item.label}
            </span>
          ) : (
            <span key={item.kind} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          )
        )}
      </div>
      <p className="text-xs text-zinc-400 mt-1">
        {editable ? "Click or drag the pin to set the bonus spot location. " : ""}
        {lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "No location set."}
      </p>
    </div>
  );
}
