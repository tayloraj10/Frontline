"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { formatPoints } from "@/lib/formatPoints";
import type { TeamEventGeoEntry } from "@/lib/teamEvents";
import { resolveTeamColor } from "@/lib/teamColors";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl() {
  return `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`;
}

export default function EventTerritoryMap({ entries }: { entries: TeamEventGeoEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || entries.length === 0) return;
    let cancelled = false;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      center: [-98, 39],
      zoom: 3,
      attributionControl: false,
    });
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });

    m.on("load", async () => {
      try {
        const base = process.env.NEXT_PUBLIC_FASTAPI_URL;
        const boundaries = await Promise.all(
          entries.map(async (e) => {
            const res = await fetch(`${base}/api/geo-units/${e.geo_unit_id}/boundary`);
            if (!res.ok) throw new Error(await res.text());
            const data = (await res.json()) as { geometry: GeoJSON.Geometry };
            return { entry: e, geometry: data.geometry };
          })
        );
        if (cancelled) return;

        m.addSource("event-territories", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: boundaries.map(({ entry, geometry }) => ({
              type: "Feature",
              geometry,
              properties: {
                geoUnitId: entry.geo_unit_id,
                displayName: entry.geo_display_name ?? entry.geo_unit_id,
                teamName: entry.team_name,
                totalValue: entry.total_value,
                submissionCount: entry.submission_count,
                color: resolveTeamColor(entry.team_color),
              },
            })),
          } as GeoJSON.FeatureCollection,
        });

        m.addLayer({
          id: "territory-fill",
          type: "fill",
          source: "event-territories",
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.35 },
        });
        m.addLayer({
          id: "territory-border",
          type: "line",
          source: "event-territories",
          paint: { "line-color": ["get", "color"], "line-width": 2 },
        });

        m.on("mousemove", "territory-fill", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          m.getCanvas().style.cursor = "pointer";
          const p = f.properties as Record<string, string | number>;
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font:12px system-ui;color:#e4e4e7;background:#18181b;">` +
                `<div style="font-weight:600;">${p.displayName}</div>` +
                `<div style="color:#a1a1aa;">${p.teamName}</div>` +
                `<div style="margin-top:2px;">${formatPoints(Number(p.totalValue))} pts · ${p.submissionCount} logs</div>` +
                `</div>`
            )
            .addTo(m);
        });
        m.on("mouseleave", "territory-fill", () => {
          m.getCanvas().style.cursor = "";
          popup.remove();
        });

        const ids = entries.map((e) => e.geo_unit_id).join(",");
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
      popup.remove();
      m.remove();
    };
  }, [entries]);

  const teams = Array.from(new Map(entries.map((e) => [e.team_id, e])).values());

  return (
    <div className="space-y-2">
      <div className="relative w-full h-[280px] rounded-lg overflow-hidden border border-zinc-800">
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
        {teams.map((t) => (
          <span key={t.team_id} className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: resolveTeamColor(t.team_color) }}
            />
            {t.team_name}
          </span>
        ))}
      </div>
    </div>
  );
}
