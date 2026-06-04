"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type GeoUnit = Omit<Database["public"]["Tables"]["geo_units"]["Row"], "geometry">;
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface Props {
  campaign: Campaign;
  geoUnits: GeoUnit[];
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

function tractColor(claim: TerritoryClaim | undefined): string {
  if (!claim) return "#1f2937"; // dark gray — neutral/unclaimed
  if (claim.claimed_by_group) return "#10b981"; // emerald — group claimed
  if (claim.claimed_by_user) return "#3b82f6"; // blue — individual claimed
  return "#1f2937";
}

function fitBoundsToFeatures(
  map: maplibregl.Map,
  features: { geometry: GeoJSON.Geometry }[]
): void {
  if (!features.length) return;

  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  function walk(coords: unknown): void {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      minLng = Math.min(minLng, coords[0] as number);
      maxLng = Math.max(maxLng, coords[0] as number);
      minLat = Math.min(minLat, coords[1] as number);
      maxLat = Math.max(maxLat, coords[1] as number);
    } else {
      coords.forEach(walk);
    }
  }

  for (const f of features) {
    if ("coordinates" in f.geometry) walk(f.geometry.coordinates);
  }

  if (!isFinite(minLng)) return;
  map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 40, duration: 300 });
}

export default function CampaignMap({ campaign, geoUnits, claims, activeEvents }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const geoUnitsRef = useRef(geoUnits);
  const claimsRef = useRef(claims);
  const hasFit = useRef(false);

  useEffect(() => { geoUnitsRef.current = geoUnits; }, [geoUnits]);
  useEffect(() => { claimsRef.current = claims; }, [claims]);

  const updateLayer = useCallback(
    (allUnits: GeoUnit[], claimsData: TerritoryClaim[]) => {
      if (!map.current) return;

      const claimsByUnit = new Map(claimsData.map((c) => [c.geo_unit_id, c]));

      const features = allUnits
        .filter((u) => u.geojson)
        .map((u) => ({
          type: "Feature" as const,
          properties: {
            geo_unit_id: u.id,
            color: tractColor(claimsByUnit.get(u.id)),
            total_value: claimsByUnit.get(u.id)?.total_value ?? 0,
            display_name: u.display_name ?? u.unit_id,
          },
          geometry: u.geojson as unknown as GeoJSON.Geometry,
        }));

      const source = map.current.getSource("territory") as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData({ type: "FeatureCollection", features });
      }

      if (!hasFit.current && features.length > 0) {
        fitBoundsToFeatures(map.current, features);
        hasFit.current = true;
      }
    },
    []
  );

  // Map initialization
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [-98.5795, 39.8283],
      zoom: 4,
      attributionControl: false,
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    const ro = new ResizeObserver(() => map.current?.resize());
    ro.observe(mapContainer.current);

    map.current.on("load", () => {
      if (!map.current) return;

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

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

      map.current.on("mouseenter", "territory-fill", (e) => {
        if (!map.current || !e.features?.[0]) return;
        map.current.getCanvas().style.cursor = "pointer";
        const props = e.features[0].properties;
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-weight:600;font-size:12px">${props.display_name}</div>
             <div style="color:#a1a1aa;font-size:11px">${props.total_value} pts</div>`
          )
          .addTo(map.current);
      });

      map.current.on("mouseleave", "territory-fill", () => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = "";
        popup.remove();
      });

      updateLayer(geoUnitsRef.current, claimsRef.current);
    });

    return () => {
      ro.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync when props change (e.g. parent re-renders)
  useEffect(() => {
    if (map.current?.isStyleLoaded()) {
      updateLayer(geoUnits, claims);
    }
  }, [geoUnits, claims, updateLayer]);

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
          const { data } = await supabase
            .from("territory_claims")
            .select("*")
            .eq("campaign_id", campaign.id);

          if (data) updateLayer(geoUnitsRef.current, data as TerritoryClaim[]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaign.id, updateLayer]);

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
