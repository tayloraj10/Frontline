"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RouteLineString } from "@/lib/cleanupRoutes";
import type { NearbyReport } from "@/lib/cleanupEvents";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

// Non-interactive preview map: shows the event's own location (point or route) plus a
// pin for every nearby open trash report, so an organizer can see at a glance what the
// log-team-total form's "clear nearby reports" toggle would close before submitting.
export default function NearbyReportsMap({
  eventLat,
  eventLng,
  eventRoute,
  reports,
  heightClassName = "h-[180px]",
}: {
  eventLat: number;
  eventLng: number;
  eventRoute: RouteLineString | null;
  reports: NearbyReport[];
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
      interactive: false,
      attributionControl: false,
      center: [eventLng, eventLat],
      zoom: 14,
    });
    mapRef.current = m;

    m.on("load", () => {
      const bounds = new maplibregl.LngLatBounds([eventLng, eventLat], [eventLng, eventLat]);

      if (eventRoute) {
        m.addSource("nearby-reports-route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: eventRoute },
        });
        m.addLayer({
          id: "nearby-reports-route-line",
          type: "line",
          source: "nearby-reports-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0284c7", "line-width": 4 },
        });
        for (const c of eventRoute.coordinates) bounds.extend(c as [number, number]);
      } else {
        new maplibregl.Marker({ color: "#0284c7" }).setLngLat([eventLng, eventLat]).addTo(m);
      }

      // Matches CampaignMap's report-dots layer (orange fill/stroke) so a report reads the
      // same way here as it does on the main trash-war map.
      for (const r of reports) {
        const el = document.createElement("div");
        el.style.width = "12px";
        el.style.height = "12px";
        el.style.borderRadius = "50%";
        el.style.background = "#f97316";
        el.style.border = "1.5px solid #ea580c";
        el.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.15)";
        new maplibregl.Marker({ element: el }).setLngLat([r.longitude, r.latitude]).addTo(m);
        bounds.extend([r.longitude, r.latitude]);
      }

      if (reports.length > 0 || eventRoute) {
        m.fitBounds(bounds, { padding: 40, maxZoom: 17 });
      }
    });

    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative w-full ${heightClassName}`}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden border border-zinc-700/50" />
    </div>
  );
}
