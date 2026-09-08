"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Avatar from "@/components/ui/Avatar";
import { formatDistance } from "@/lib/nearbyPartners";
import type { EventAttendeeRoute } from "@/lib/cleanupEvents";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const STYLE_URL = `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`;

// Distinct, colorblind-friendlyish palette so overlapping routes stay tellable apart.
// Cycles if there are more submitted routes than colors.
const ROUTE_COLORS = [
  "#38bdf8", // sky
  "#f97316", // orange
  "#a3e635", // lime
  "#e879f9", // fuchsia
  "#facc15", // yellow
  "#fb7185", // rose
  "#2dd4bf", // teal
  "#c084fc", // violet
  "#4ade80", // green
  "#f472b6", // pink
];

export default function EventRoutesMap({ routes }: { routes: EventAttendeeRoute[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || routes.length === 0) return;

    const allCoords = routes.flatMap((r) => r.route.coordinates as [number, number][]);
    if (allCoords.length === 0) return;

    const bounds = allCoords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
    );

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      attributionControl: false,
      bounds,
      fitBoundsOptions: { padding: 50 },
    });
    mapRef.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");

    m.on("load", () => {
      m.addSource("event-routes", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: routes.map((r, i) => ({
            type: "Feature",
            properties: { color: ROUTE_COLORS[i % ROUTE_COLORS.length] },
            geometry: r.route,
          })),
        },
      });
      m.addLayer({
        id: "event-routes-casing",
        type: "line",
        source: "event-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 8],
          "line-opacity": 0.8,
        },
      });
      m.addLayer({
        id: "event-routes-line",
        type: "line",
        source: "event-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 5],
        },
      });

      routes.forEach((r, i) => {
        const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
        const coords = r.route.coordinates as [number, number][];
        new maplibregl.Marker({ color }).setLngLat(coords[0]).addTo(m);
        new maplibregl.Marker({ color }).setLngLat(coords[coords.length - 1]).addTo(m);
      });
    });

    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (routes.length === 0) {
    return <p className="text-sm text-zinc-500 text-center py-10">No routes tracked for this event yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="w-full h-[320px] rounded-lg overflow-hidden border border-zinc-700/50" />
      <ul className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1">
        {routes.map((route, i) => {
          const submitterName = route.submitted_by.display_name ?? route.submitted_by.username ?? "A volunteer";
          const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
          return (
            <Link
              key={route.id}
              href={`/routes/${route.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/60 active:bg-zinc-900/60 transition-colors duration-150 touch-manipulation"
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
              <Avatar avatarUrl={route.submitted_by.avatar_url} name={submitterName} username={route.submitted_by.username} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 truncate">{submitterName}</p>
                <div className="flex gap-3 text-xs text-zinc-500 flex-wrap">
                  {route.route_distance_meters != null && route.route_distance_meters > 0 && (
                    <span>{formatDistance(route.route_distance_meters)}</span>
                  )}
                  {route.metrics_small_bags != null && route.metrics_small_bags > 0 && (
                    <span>{route.metrics_small_bags} small bag{route.metrics_small_bags === 1 ? "" : "s"}</span>
                  )}
                  {route.metrics_large_bags != null && route.metrics_large_bags > 0 && (
                    <span>{route.metrics_large_bags} large bag{route.metrics_large_bags === 1 ? "" : "s"}</span>
                  )}
                  {route.metrics_pounds != null && route.metrics_pounds > 0 && <span>{route.metrics_pounds} lbs</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </ul>
    </div>
  );
}
