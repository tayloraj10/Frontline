"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const MAP_STYLES = [
  { id: "outdoor", label: "Terrain" },
  { id: "streets", label: "Streets" },
  { id: "hybrid", label: "Satellite" },
] as const;

type StyleId = (typeof MAP_STYLES)[number]["id"];

function styleUrl(id: StyleId) {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

// Name labels under every pin only show once zoomed in this far, so a wide view doesn't turn
// into a pile of overlapping text. The selected pin always shows its label.
const LABEL_MIN_ZOOM = 13;

export type PartnerMapPoint = {
  businessId: string;
  businessSlug: string;
  locationId: string;
  businessName: string;
  hasEventOffer: boolean;
  adultsOnly: boolean;
  lat: number;
  lng: number;
};

type PinEntry = {
  slug: string;
  dot: HTMLDivElement;
  label: HTMLDivElement;
  point: PartnerMapPoint;
};

// A null locationId means "the business" (any of its pins); otherwise only that one location's pin.
function isPinSelected(point: PartnerMapPoint, slug: string | null, locationId: string | null) {
  return slug !== null && point.businessSlug === slug && (locationId === null || point.locationId === locationId);
}

function stylePin(entry: PinEntry, selected: boolean) {
  const { dot, label, point } = entry;
  const size = selected ? 24 : 16;
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.background = point.hasEventOffer ? "#f59e0b" : "#10b981";
  dot.style.border = point.adultsOnly ? "2px solid #ef4444" : "2px solid #fff";
  dot.style.boxShadow = selected
    ? "0 0 0 3px #fff, 0 0 0 5px rgba(0,0,0,0.45)"
    : point.adultsOnly
      ? "0 0 0 1px #ef4444"
      : "0 0 0 1px rgba(0,0,0,0.25)";
  label.dataset.selected = selected ? "1" : "0";
  label.style.fontWeight = selected ? "700" : "600";
  label.style.zIndex = selected ? "2" : "1";
}

// Interactive overview map for the partner offers browse page. Clicking a pin selects that
// business (pin grows, name label shows) and the parent highlights + scrolls to its card.
export default function PartnersMap({
  points,
  userLocation,
  selectedSlug,
  selectedLocationId,
  onSelect,
}: {
  points: PartnerMapPoint[];
  userLocation: { lat: number; lng: number } | null;
  selectedSlug: string | null;
  selectedLocationId: string | null;
  onSelect: (slug: string | null, locationId: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const pinsRef = useRef<PinEntry[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const selectedRef = useRef({ slug: selectedSlug, locationId: selectedLocationId });
  const onSelectRef = useRef(onSelect);
  const initialLocationRef = useRef(userLocation);
  const [activeStyle, setActiveStyle] = useState<StyleId>("outdoor");

  selectedRef.current = { slug: selectedSlug, locationId: selectedLocationId };
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const loc = initialLocationRef.current;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl("outdoor"),
      center: loc ? [loc.lng, loc.lat] : [-74.006, 40.7128],
      zoom: loc ? 13 : 10,
      attributionControl: false,
    });
    mapRef.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const syncLabels = () => {
      const show = m.getZoom() >= LABEL_MIN_ZOOM;
      for (const pin of pinsRef.current) {
        pin.label.style.display = show || pin.label.dataset.selected === "1" ? "block" : "none";
      }
    };
    m.on("zoom", syncLabels);
    m.on("click", () => onSelectRef.current(null, null));

    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.setStyle(styleUrl(activeStyle));
  }, [activeStyle]);

  // Business pins. Framing uses the businesses only; the user's own location is just a dot.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    pinsRef.current = [];

    if (points.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    for (const point of points) {
      const el = document.createElement("div");
      el.style.display = "flex";
      el.style.flexDirection = "column";
      el.style.alignItems = "center";
      el.style.cursor = "pointer";

      const dot = document.createElement("div");
      dot.style.borderRadius = "50%";
      dot.style.transition = "width 120ms, height 120ms";

      const label = document.createElement("div");
      label.textContent = point.adultsOnly ? `${point.businessName} (21+)` : point.businessName;
      label.style.position = "absolute";
      label.style.top = "100%";
      label.style.marginTop = "3px";
      label.style.whiteSpace = "nowrap";
      label.style.fontSize = "11px";
      label.style.lineHeight = "1.2";
      label.style.color = "#18181b";
      label.style.background = "rgba(255,255,255,0.92)";
      label.style.padding = "1px 5px";
      label.style.borderRadius = "6px";
      label.style.boxShadow = "0 1px 2px rgba(0,0,0,0.3)";
      label.style.pointerEvents = "none";
      label.style.display = "none";

      el.append(dot, label);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current(point.businessSlug, point.locationId);
      });

      const entry: PinEntry = { slug: point.businessSlug, dot, label, point };
      stylePin(entry, isPinSelected(point, selectedRef.current.slug, selectedRef.current.locationId));
      pinsRef.current.push(entry);

      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([point.lng, point.lat]).addTo(m));
      bounds.extend([point.lng, point.lat]);
    }

    const show = m.getZoom() >= LABEL_MIN_ZOOM;
    for (const pin of pinsRef.current) {
      pin.label.style.display = show || pin.label.dataset.selected === "1" ? "block" : "none";
    }

    if (!bounds.isEmpty()) {
      // Extra bottom/top room keeps edge pins clear of the legend and the style toggle overlays.
      m.fitBounds(bounds, { padding: { top: 70, bottom: 120, left: 70, right: 70 }, maxZoom: 15, duration: 0 });
    }
  }, [points]);

  // Selection changes restyle pins in place and center the map on the selected business.
  useEffect(() => {
    const m = mapRef.current;
    const show = (m?.getZoom() ?? 0) >= LABEL_MIN_ZOOM;
    for (const pin of pinsRef.current) {
      const selected = isPinSelected(pin.point, selectedSlug, selectedLocationId);
      stylePin(pin, selected);
      pin.label.style.display = show || selected ? "block" : "none";
    }
    if (m && selectedSlug) {
      const pin = pinsRef.current.find((p) => isPinSelected(p.point, selectedSlug, selectedLocationId));
      if (pin) m.easeTo({ center: [pin.point.lng, pin.point.lat], duration: 400 });
    }
  }, [selectedSlug, selectedLocationId]);

  // Location dot: only ever drawn where the user actually is, never used to frame the view.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    if (!userLocation) return;

    const el = document.createElement("div");
    el.style.width = "16px";
    el.style.height = "16px";
    el.innerHTML =
      '<span style="position:absolute;inset:-8px;border-radius:50%;background:rgba(59,130,246,0.35);animation:partners-map-pulse 2s ease-out infinite;"></span>' +
      '<span style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.25);"></span>';
    el.title = "Your location";
    userMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([userLocation.lng, userLocation.lat]).addTo(m);
  }, [userLocation]);

  return (
    <div className="relative w-full h-[360px] rounded-xl overflow-hidden border border-zinc-800">
      <style>{`
        @keyframes partners-map-pulse {
          0% { transform: scale(0.4); opacity: 1; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-2 left-2 flex rounded-full bg-zinc-950/80 border border-zinc-800 p-0.5 gap-0.5">
        {MAP_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveStyle(s.id)}
            aria-pressed={activeStyle === s.id}
            className={`min-h-7 rounded-full px-2.5 text-[11px] font-medium transition-colors duration-150 touch-manipulation ${
              activeStyle === s.id ? "bg-zinc-600 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="absolute bottom-2 left-2 flex items-center gap-3 px-2.5 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          Event offers
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Partner
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-red-500" />
          21+ only
        </span>
        {userLocation && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            You
          </span>
        )}
      </div>
    </div>
  );
}
