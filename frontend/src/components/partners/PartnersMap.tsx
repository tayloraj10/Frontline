"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

export type PartnerMapPoint = {
  businessId: string;
  businessSlug: string;
  businessName: string;
  hasEventOffer: boolean;
  lat: number;
  lng: number;
};

// Interactive overview map for the partner offers browse page -- clicking a pin scrolls the
// list below to that business's card (same #business-{slug} anchors the list already renders)
// rather than duplicating offer details in a popup.
export default function PartnersMap({
  points,
  userLocation,
}: {
  points: PartnerMapPoint[];
  userLocation: { lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
      center: userLocation ? [userLocation.lng, userLocation.lat] : [-74.006, 40.7128],
      zoom: userLocation ? 13 : 10,
      attributionControl: false,
    });
    mapRef.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    if (points.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    if (userLocation) {
      const el = document.createElement("div");
      el.style.position = "relative";
      el.style.width = "16px";
      el.style.height = "16px";
      el.innerHTML =
        '<span style="position:absolute;inset:-8px;border-radius:50%;background:rgba(59,130,246,0.35);animation:partners-map-pulse 2s ease-out infinite;"></span>' +
        '<span style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.25);"></span>';
      el.title = "Your location";
      new maplibregl.Marker({ element: el }).setLngLat([userLocation.lng, userLocation.lat]).addTo(m);
      bounds.extend([userLocation.lng, userLocation.lat]);
    }

    for (const point of points) {
      const el = document.createElement("div");
      el.style.width = "16px";
      el.style.height = "16px";
      el.style.borderRadius = "50%";
      el.style.cursor = "pointer";
      el.style.background = point.hasEventOffer ? "#f59e0b" : "#10b981";
      el.style.border = "2px solid #fff";
      el.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.25)";
      el.title = point.businessName;
      el.addEventListener("click", () => {
        document.getElementById(`business-${point.businessSlug}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      const marker = new maplibregl.Marker({ element: el }).setLngLat([point.lng, point.lat]).addTo(m);
      markersRef.current.push(marker);
      bounds.extend([point.lng, point.lat]);
    }

    if (!bounds.isEmpty()) {
      m.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
    }
  }, [points, userLocation]);

  return (
    <div className="relative w-full h-[360px] rounded-xl overflow-hidden border border-zinc-800">
      <style>{`
        @keyframes partners-map-pulse {
          0% { transform: scale(0.4); opacity: 1; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 flex items-center gap-3 px-2.5 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          Event offers
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Partner
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
