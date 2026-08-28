"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl(id: string) {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

interface ColoredPoint {
  latitude: number;
  longitude: number;
  color: string;
}

interface ColoredRoute {
  geojson: string;
  color: string;
}

interface LegendItem {
  color: string;
  label: string;
}

const POINTS_SOURCE_ID = "campaign-dashboard-map-points";
const POINTS_LAYER_ID = "campaign-dashboard-map-point-dots";
const ROUTES_SOURCE_ID = "campaign-dashboard-map-routes";
const ROUTES_LAYER_ID = "campaign-dashboard-map-route-lines";

function parseRouteGeometry(geojson: string): GeoJSON.Geometry | null {
  try {
    return JSON.parse(geojson) as GeoJSON.Geometry;
  } catch {
    return null;
  }
}

function routeCoords(geom: GeoJSON.Geometry): [number, number][] {
  if (geom.type === "LineString") return geom.coordinates as [number, number][];
  if (geom.type === "MultiLineString") return (geom.coordinates as [number, number][][]).flat();
  return [];
}

export default function CampaignDashboardMap({
  points = [],
  routes = [],
  legend,
  heightClassName = "h-[360px]",
}: {
  points?: ColoredPoint[];
  routes?: ColoredRoute[];
  legend: LegendItem[];
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

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
      map.addSource(ROUTES_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: ROUTES_LAYER_ID,
        type: "line",
        source: ROUTES_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 3, "line-opacity": 0.85 },
      });
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
          "circle-color": ["get", "color"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "rgba(9,9,11,0.6)",
          "circle-opacity": 0.85,
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function apply() {
      if (!map) return;
      const pointsSource = map.getSource(POINTS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (pointsSource) {
        pointsSource.setData({
          type: "FeatureCollection",
          features: points.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
            properties: { color: p.color },
          })),
        });
      }
      const routesSource = map.getSource(ROUTES_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (routesSource) {
        const features: GeoJSON.Feature[] = routes
          .map((r): GeoJSON.Feature | null => {
            const geometry = parseRouteGeometry(r.geojson);
            if (!geometry) return null;
            return { type: "Feature", geometry, properties: { color: r.color } };
          })
          .filter((f): f is GeoJSON.Feature => f !== null);
        routesSource.setData({ type: "FeatureCollection", features });
      }
    }

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [points, routes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function fit() {
      if (!map) return;
      const coords: [number, number][] = points.map((p): [number, number] => [p.longitude, p.latitude]);
      for (const r of routes) {
        const geometry = parseRouteGeometry(r.geojson);
        if (geometry) coords.push(...routeCoords(geometry));
      }
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
  }, [points, routes]);

  return (
    <div>
      <div ref={containerRef} className={`w-full ${heightClassName} rounded-xl overflow-hidden border border-zinc-800`} />
      {legend.length > 0 && (
        <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500 flex-wrap">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
