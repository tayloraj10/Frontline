"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"] & {
  geo_units: { geojson: unknown; unit_id: string; display_name: string | null } | null;
};
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface Props {
  campaign: Campaign;
  claims: TerritoryClaim[];
  activeEvents: CampaignEvent[];
}

// Total War-inspired dark terrain style using free tiles
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
        "raster-opacity": 0.3,
        "raster-saturation": -0.8,
        "raster-brightness-max": 0.3,
      },
    },
  ],
};

function claimColor(claim: TerritoryClaim): string {
  if (claim.claimed_by_group) return "#10b981"; // emerald — group claimed
  if (claim.claimed_by_user) return "#3b82f6";  // blue — individual claimed
  return "#6b7280"; // gray — unclaimed
}

export default function CampaignMap({ campaign, claims, activeEvents }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  const updateClaimsLayer = useCallback((claimsData: TerritoryClaim[]) => {
    if (!map.current) return;

    const features = claimsData
      .filter((c) => c.geo_units?.geojson)
      .map((c) => ({
        type: "Feature" as const,
        properties: {
          geo_unit_id: c.geo_unit_id,
          color: claimColor(c),
          total_value: c.total_value,
          display_name: c.geo_units?.display_name ?? c.geo_units?.unit_id ?? "",
        },
        geometry: c.geo_units!.geojson as GeoJSON.Geometry,
      }));

    const source = map.current.getSource("territory") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: "FeatureCollection", features });
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [-98.5795, 39.8283], // US center
      zoom: 4,
      attributionControl: false,
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.current.on("load", () => {
      if (!map.current) return;

      // Territory fill layer
      map.current.addSource("territory", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.current.addLayer({
        id: "territory-fill",
        type: "fill",
        source: "territory",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.5,
        },
      });

      map.current.addLayer({
        id: "territory-border",
        type: "line",
        source: "territory",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.5,
          "line-opacity": 0.8,
        },
      });

      // Tooltip on hover
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

      map.current.on("mouseenter", "territory-fill", (e) => {
        if (!map.current || !e.features?.[0]) return;
        map.current.getCanvas().style.cursor = "pointer";
        const props = e.features[0].properties;
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="text-xs font-medium">${props.display_name}</div>
             <div class="text-xs text-zinc-400">${props.total_value} pts</div>`
          )
          .addTo(map.current);
      });

      map.current.on("mouseleave", "territory-fill", () => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = "";
        popup.remove();
      });

      updateClaimsLayer(claims);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync claims when prop updates
  useEffect(() => {
    if (map.current?.isStyleLoaded()) {
      updateClaimsLayer(claims);
    }
  }, [claims, updateClaimsLayer]);

  // Supabase Realtime — live territory updates
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
        async () => {
          // Re-fetch full claims on any change (keeps geojson joins intact)
          const { data } = await supabase
            .from("territory_claims")
            .select("*, geo_units(geojson, unit_id, display_name)")
            .eq("campaign_id", campaign.id);

          if (data) updateClaimsLayer(data as TerritoryClaim[]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaign.id, updateClaimsLayer]);

  return (
    <div className="relative w-full h-full min-h-[500px]">
      <div ref={mapContainer} className="absolute inset-0" />

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
    </div>
  );
}
