"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface Props {
  campaign: Campaign;
  claims: TerritoryClaim[];
  activeEvents: CampaignEvent[];
}

const MAP_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm-tiles",
      type: "raster" as const,
      source: "osm",
      paint: {
        "raster-opacity": 0.7,
        "raster-saturation": -0.5,
        "raster-brightness-max": 0.8,
      },
    },
  ],
};

function applyClaimsAsFeatureState(
  map: maplibregl.Map,
  claims: TerritoryClaim[],
): void {
  for (const claim of claims) {
    if (!claim.geo_unit_id) continue;
    const color = claim.claimed_by_group
      ? "#10b981"
      : claim.claimed_by_user
        ? "#3b82f6"
        : "#1f2937";
    map.setFeatureState(
      { source: "territory", sourceLayer: "territories", id: claim.geo_unit_id },
      { color, total_value: claim.total_value ?? 0 },
    );
  }
}

export default function CampaignMap({ campaign, claims, activeEvents }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const claimsRef = useRef(claims);
  const activeEventsRef = useRef(activeEvents);
  const eventMarkersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => { claimsRef.current = claims; }, [claims]);
  useEffect(() => { activeEventsRef.current = activeEvents; }, [activeEvents]);

  const updateEventMarkers = useCallback((events: CampaignEvent[]) => {
    if (!map.current) return;
    eventMarkersRef.current.forEach((m) => m.remove());
    eventMarkersRef.current = [];

    for (const event of events) {
      if (!event.geo_unit_id) continue;

      // Fetch centroid of the geo_unit from the map's rendered features
      const features = map.current.querySourceFeatures("territory", {
        sourceLayer: "territories",
        filter: ["==", ["id"], event.geo_unit_id],
      });
      if (!features.length) continue;

      const geom = features[0].geometry;
      if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") continue;

      // Compute rough center from first ring
      const coords =
        geom.type === "Polygon"
          ? geom.coordinates[0]
          : geom.coordinates[0][0];
      const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
      const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;

      const el = document.createElement("div");
      el.style.cssText =
        "display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:rgba(127,29,29,0.9);border:2px solid #ef4444;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:pointer;animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite";
      el.textContent = "⚡";
      el.title = event.title;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(
          new maplibregl.Popup({ offset: 20 }).setHTML(
            `<div style="font-weight:600;font-size:12px;color:#fca5a5">${event.title}</div>
             ${event.description ? `<div style="color:#a1a1aa;font-size:11px;margin-top:2px">${event.description}</div>` : ""}`,
          ),
        )
        .addTo(map.current!);

      eventMarkersRef.current.push(marker);
    }
  }, []);

  // Map initialization
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const tileUrl = `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/${campaign.id}/{z}/{x}/{y}.mvt`;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [-98.5795, 39.8283],
      zoom: 4,
      attributionControl: false,
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    const ro = new ResizeObserver(() => map.current?.resize());
    ro.observe(mapContainer.current);

    map.current.on("load", () => {
      if (!map.current) return;

      map.current.addSource("territory", {
        type: "vector",
        tiles: [tileUrl],
        minzoom: 0,
        maxzoom: 14,
        promoteId: "geo_unit_id",
      });

      map.current.addLayer({
        id: "territory-fill",
        type: "fill",
        source: "territory",
        "source-layer": "territories",
        paint: {
          "fill-color": [
            "coalesce",
            ["feature-state", "color"],
            "#1f2937",
          ],
          "fill-opacity": 0.5,
        },
      });

      map.current.addLayer({
        id: "territory-border",
        type: "line",
        source: "territory",
        "source-layer": "territories",
        paint: {
          "line-color": [
            "coalesce",
            ["feature-state", "color"],
            "#374151",
          ],
          "line-width": 1.5,
          "line-opacity": 0.8,
        },
      });

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
      });

      map.current.on("mouseenter", "territory-fill", (e) => {
        if (!map.current || !e.features?.[0]) return;
        map.current.getCanvas().style.cursor = "pointer";
        const props = e.features[0].properties;
        const state = e.features[0].state as { total_value?: number };
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-weight:600;font-size:12px">${props.display_name}</div>
             <div style="color:#a1a1aa;font-size:11px">${state.total_value ?? 0} pts</div>`,
          )
          .addTo(map.current);
      });

      map.current.on("mouseleave", "territory-fill", () => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = "";
        popup.remove();
      });

      // Apply initial claims
      applyClaimsAsFeatureState(map.current, claimsRef.current);
      updateEventMarkers(activeEventsRef.current);
    });

    return () => {
      ro.disconnect();
      eventMarkersRef.current.forEach((m) => m.remove());
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync claims via feature-state when prop changes
  useEffect(() => {
    if (map.current?.isStyleLoaded()) {
      applyClaimsAsFeatureState(map.current, claims);
    }
  }, [claims]);

  // Supabase Realtime — surgical feature-state updates
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`territory_claims:${campaign.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "territory_claims",
          filter: `campaign_id=eq.${campaign.id}`,
        },
        (payload) => {
          if (!map.current) return;
          const claim = payload.new as TerritoryClaim;
          if (!claim?.geo_unit_id) return;
          const color = claim.claimed_by_group
            ? "#10b981"
            : claim.claimed_by_user
              ? "#3b82f6"
              : "#1f2937";
          map.current.setFeatureState(
            {
              source: "territory",
              sourceLayer: "territories",
              id: claim.geo_unit_id,
            },
            { color, total_value: claim.total_value ?? 0 },
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaign.id]);

  return (
    <div className="relative flex flex-col flex-1 min-h-[500px]">
      <div ref={mapContainer} className="flex-1 w-full" />

      {activeEvents.length > 0 && (
        <div className="absolute top-4 left-4 z-10 space-y-2 max-w-xs">
          {activeEvents.map((event) => (
            <div
              key={event.id}
              className="px-3 py-2 bg-red-950/90 border border-red-700 rounded-lg backdrop-blur-sm"
            >
              <p className="text-red-300 text-xs font-semibold">{event.title}</p>
              {event.description && (
                <p className="text-red-400 text-xs mt-0.5">{event.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="absolute bottom-8 right-4 z-10 flex flex-col gap-1.5 text-xs">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
          <span className="w-3 h-3 rounded-sm bg-emerald-500/70" />
          <span className="text-zinc-300">Group</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
          <span className="w-3 h-3 rounded-sm bg-blue-500/70" />
          <span className="text-zinc-300">Individual</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
          <span className="w-3 h-3 rounded-sm bg-zinc-700/70" />
          <span className="text-zinc-300">Unclaimed</span>
        </div>
      </div>
    </div>
  );
}
