"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl(id: string) {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface GroupStatsEvent {
  id: string;
  title: string;
  description: string | null;
  scheduled_start: string;
  scheduled_end: string | null;
  status: string;
  image_url: string | null;
  lat: number;
  lng: number;
  max_attendees: number | null;
  going_count: number;
  is_past: boolean;
  is_ongoing: boolean;
  is_cohosted: boolean;
}

function formatEventDateTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function createEventMarkerEl(event: GroupStatsEvent): HTMLDivElement {
  const el = document.createElement("div");
  const size = 26;
  const color = event.is_past ? "#52525b" : event.is_ongoing ? "#f59e0b" : "#3b82f6";
  const glow = event.is_past ? "none" : `0 0 0 4px ${color}33`;
  el.style.cssText =
    `width:${size}px;height:${size}px;border-radius:9999px;cursor:pointer;` +
    `background:${color};border:2px solid rgba(255,255,255,0.85);box-shadow:${glow};` +
    "display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1;";
  el.textContent = "🧹";
  const cohostSuffix = event.is_cohosted ? " (co-hosted)" : "";
  el.title = event.is_past
    ? `${event.title}${cohostSuffix} (ended)`
    : `${event.title}${cohostSuffix} — ${event.going_count} going`;
  return el;
}

function createDateLabelMarker(
  map: maplibregl.Map,
  lngLat: [number, number],
  text: string,
  aboveOffsetPx: number,
): maplibregl.Marker {
  const el = document.createElement("div");
  el.style.cssText =
    "pointer-events:none;white-space:nowrap;font-size:10px;font-weight:600;color:#e4e4e7;" +
    "background:rgba(24,24,27,0.85);border:1px solid rgba(255,255,255,0.15);border-radius:4px;" +
    "padding:1px 6px;box-shadow:0 1px 4px rgba(0,0,0,0.5);";
  el.textContent = text;
  return new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -aboveOffsetPx] })
    .setLngLat(lngLat)
    .addTo(map);
}

const POINTS_SOURCE_ID = "group-events-map-contribution-points";
const POINTS_LAYER_ID = "group-events-map-contribution-dots";

export default function GroupEventsMap({
  points,
  events,
}: {
  points: GeoPoint[];
  events: GroupStatsEvent[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const eventMarkersRef = useRef<maplibregl.Marker[]>([]);
  const dateLabelsRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl("outdoor"),
      center: [-73.98, 40.72],
      zoom: 10,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(POINTS_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: POINTS_LAYER_ID,
        type: "circle",
        source: POINTS_SOURCE_ID,
        paint: {
          "circle-radius": 5,
          "circle-color": "#22c55e",
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(9,9,11,0.6)",
          "circle-opacity": 0.85,
        },
      });
    });

    return () => {
      popupRef.current?.remove();
      eventMarkersRef.current.forEach((m) => m.remove());
      dateLabelsRef.current.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function apply() {
      if (!map) return;
      const source = map.getSource(POINTS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData({
          type: "FeatureCollection",
          features: points.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
            properties: {},
          })),
        });
      }
    }

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function apply() {
      if (!map) return;
      eventMarkersRef.current.forEach((m) => m.remove());
      eventMarkersRef.current = [];
      dateLabelsRef.current.forEach((m) => m.remove());
      dateLabelsRef.current = [];

      for (const event of events) {
        const el = createEventMarkerEl(event);
        const marker = new maplibregl.Marker({ element: el }).setLngLat([event.lng, event.lat]).addTo(map);
        el.onclick = () => {
          if (!popupRef.current) {
            popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 16 });
          }
          const dateText = formatEventDateTime(event.scheduled_start) ?? "";
          const statusText = event.is_past ? "Ended" : event.is_ongoing ? "Happening now" : `${event.going_count} going`;
          popupRef.current
            .setLngLat([event.lng, event.lat])
            .setHTML(
              `<div style="font-size:12px;max-width:200px;">` +
                `<div style="font-weight:700;margin-bottom:2px;">${escapeHtml(event.title)}</div>` +
                `<div style="color:#a1a1aa;">${escapeHtml(dateText)}</div>` +
                `<div style="color:#a1a1aa;">${escapeHtml(statusText)}</div>` +
                `</div>`,
            )
            .addTo(map);
        };
        eventMarkersRef.current.push(marker);

        if (!event.is_past) {
          const dateText = formatEventDateTime(event.scheduled_start);
          if (dateText) {
            dateLabelsRef.current.push(createDateLabelMarker(map, [event.lng, event.lat], dateText, 17));
          }
        }
      }
    }

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [events]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function fit() {
      if (!map) return;
      const coords: [number, number][] = [
        ...points.map((p): [number, number] => [p.longitude, p.latitude]),
        ...events.map((e): [number, number] => [e.lng, e.lat]),
      ];
      if (coords.length === 0) return;
      if (coords.length === 1) {
        map.flyTo({ center: coords[0], zoom: 14, duration: 500 });
        return;
      }
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 48, duration: 500 },
      );
    }

    if (map.isStyleLoaded()) fit();
    else map.once("load", fit);
  }, [points, events]);

  return (
    <div>
      <div
        ref={containerRef}
        className="w-full h-[420px] rounded-xl overflow-hidden border border-zinc-800"
      />
      <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#22c55e" }} />
          Contribution
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#3b82f6" }} />
          Upcoming event
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#f59e0b" }} />
          Happening now
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#52525b" }} />
          Past event
        </span>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
