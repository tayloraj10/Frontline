"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl() {
  return `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`;
}

export interface TerritoryMapArea {
  geoUnitId: string;
  displayName: string;
  color: string;
}

export default function TerritoryMapModal({
  title,
  areas,
  onClose,
}: {
  title: string;
  areas: TerritoryMapArea[];
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || areas.length === 0) return;
    let cancelled = false;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      center: [-98, 39],
      zoom: 3,
      attributionControl: false,
    });
    m.addControl(new maplibregl.NavigationControl(), "top-right");

    m.on("load", async () => {
      try {
        const base = process.env.NEXT_PUBLIC_FASTAPI_URL;
        const boundaries = await Promise.all(
          areas.map(async (a) => {
            const res = await fetch(`${base}/api/geo-units/${a.geoUnitId}/boundary`);
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as { geometry: GeoJSON.Geometry };
            return { area: a, geometry: data.geometry };
          })
        );
        if (cancelled) return;

        m.addSource("territory-areas", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: boundaries.map(({ area, geometry }) => ({
              type: "Feature",
              geometry,
              properties: { geoUnitId: area.geoUnitId, displayName: area.displayName, color: area.color },
            })),
          } as GeoJSON.FeatureCollection,
        });

        m.addLayer({
          id: "territory-fill",
          type: "fill",
          source: "territory-areas",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.35 },
        });
        m.addLayer({
          id: "territory-border",
          type: "line",
          source: "territory-areas",
          paint: { "line-color": ["get", "color"], "line-width": 2 },
        });

        const ids = areas.map((a) => a.geoUnitId).join(",");
        const bboxRes = await fetch(`${base}/api/geo-units/bbox?ids=${encodeURIComponent(ids)}`);
        if (bboxRes.ok && !cancelled) {
          const { bbox } = (await bboxRes.json()) as { bbox: [number, number, number, number] };
          m.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]],
            ],
            { padding: 40, duration: 0 }
          );
        }
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load area boundaries");
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      m.remove();
    };
  }, [areas]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 w-full max-w-lg space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="relative w-full h-[320px] rounded-lg overflow-hidden border border-zinc-700/50">
          <div ref={containerRef} className="w-full h-full" />
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 text-sm text-zinc-400">
              Loading map...
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 text-sm text-red-400 px-4 text-center">
              {error}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {areas.map((a) => (
            <span key={a.geoUnitId} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
              {a.displayName}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
