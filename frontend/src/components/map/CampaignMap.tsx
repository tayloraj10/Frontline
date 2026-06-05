"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import gsap from "gsap";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { ClaimLabel } from "./CampaignMapWrapper";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface ContributionPoint {
  id: string;
  user_id: string | null;
  value: number | null;
  submitted_at: string | null;
  latitude: number;
  longitude: number;
}

interface SelectedZip {
  geoUnitId: string;
  displayName: string;
}

interface Props {
  campaign: Campaign;
  claims: TerritoryClaim[];
  activeEvents: CampaignEvent[];
  claimLabels: Record<string, ClaimLabel>;
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
  claimLabels: Record<string, ClaimLabel> = {},
): void {
  for (const claim of claims) {
    if (!claim.geo_unit_id) continue;
    const color = claim.claimed_by_group
      ? "#10b981"
      : claim.claimed_by_user
        ? "#3b82f6"
        : "#1f2937";
    const label = claimLabels[claim.geo_unit_id] ?? null;
    map.setFeatureState(
      { source: "territory", sourceLayer: "territories", id: claim.geo_unit_id },
      {
        color,
        total_value: claim.total_value ?? 0,
        claimed_label: label?.name ?? null,
        claim_is_group: label?.isGroup ?? false,
      },
    );
  }
}

// ─── Territory detail panel ───────────────────────────────────────────────────

type ContribRow = { value: number | null; submitted_at: string | null };

function TerritoryPanel({
  geoUnitId,
  displayName,
  claim,
  claimLabel,
  onClose,
}: {
  geoUnitId: string;
  displayName: string;
  claim: TerritoryClaim | null;
  claimLabel: ClaimLabel | null;
  onClose: () => void;
}) {
  const [contribs, setContribs] = useState<ContribRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("contributions")
      .select("value, submitted_at")
      .eq("geo_unit_id", geoUnitId)
      .order("submitted_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        setContribs((data ?? []) as ContribRow[]);
        setLoading(false);
      });
  }, [geoUnitId]);

  const bags = claim?.total_value ?? 0;
  const isGroup = claimLabel?.isGroup ?? false;

  return (
    <div className="absolute top-20 right-2 z-20 w-56 bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-0.5">ZIP Code</p>
            <p className="text-zinc-100 font-bold text-lg leading-none">{displayName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-300 text-xl leading-none mt-0.5 transition-colors"
          >
            ×
          </button>
        </div>

        <div className="mt-2.5">
          {claimLabel ? (
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{isGroup ? "👥" : "👤"}</span>
              <span className={`text-sm font-semibold ${isGroup ? "text-emerald-400" : "text-blue-400"}`}>
                {claimLabel.name}
              </span>
            </div>
          ) : (
            <span className="text-zinc-600 text-sm">Unclaimed</span>
          )}
          {bags > 0 && (
            <p className="text-zinc-500 text-xs mt-1">{bags} bag{bags !== 1 ? "s" : ""} collected</p>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Recent Cleanups</p>
        {loading ? (
          <p className="text-zinc-700 text-xs">Loading…</p>
        ) : contribs.length === 0 ? (
          <p className="text-zinc-700 text-xs">No cleanups logged yet</p>
        ) : (
          <div className="space-y-1.5">
            {contribs.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-zinc-300 text-xs">
                  🗑️ {c.value ?? 1} bag{(c.value ?? 1) !== 1 ? "s" : ""}
                </span>
                <span className="text-zinc-600 text-xs">
                  {c.submitted_at
                    ? new Date(c.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main map component ───────────────────────────────────────────────────────

export default function CampaignMap({ campaign, claims, activeEvents, claimLabels }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [tilesLoading, setTilesLoading] = useState(true);
  const [selectedZip, setSelectedZip] = useState<SelectedZip | null>(null);

  const claimsRef = useRef(claims);
  const activeEventsRef = useRef(activeEvents);
  const claimLabelsRef = useRef(claimLabels);
  const eventMarkersRef = useRef<maplibregl.Marker[]>([]);
  const eventTweensRef = useRef<gsap.core.Tween[]>([]);
  const hoverDivRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { claimsRef.current = claims; }, [claims]);
  useEffect(() => { activeEventsRef.current = activeEvents; }, [activeEvents]);
  useEffect(() => { claimLabelsRef.current = claimLabels; }, [claimLabels]);

  const updateEventMarkers = useCallback((events: CampaignEvent[]) => {
    if (!map.current) return;

    eventTweensRef.current.forEach((t) => t.kill());
    eventTweensRef.current = [];
    eventMarkersRef.current.forEach((m) => m.remove());
    eventMarkersRef.current = [];

    for (const event of events) {
      if (!event.geo_unit_id) continue;

      const features = map.current.querySourceFeatures("territory", {
        sourceLayer: "territories",
        filter: ["==", ["id"], event.geo_unit_id],
      });
      if (!features.length) continue;

      const geom = features[0].geometry;
      if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") continue;

      const ring =
        geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0][0];
      const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
      const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;

      const isBoss = event.event_type === "boss_spawn";

      const el = document.createElement("div");
      el.style.cssText = isBoss
        ? "display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:rgba(120,20,20,0.95);border:2px solid #ef4444;font-size:24px;box-shadow:0 0 16px rgba(239,68,68,0.5);cursor:pointer;transform-origin:center"
        : "display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:rgba(127,29,29,0.9);border:2px solid #ef4444;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:pointer;transform-origin:center";
      el.textContent = isBoss ? "🗑️" : "⚡";
      el.title = event.title;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      eventMarkersRef.current.push(marker);

      const tween = isBoss
        ? gsap.to(el, { scale: 1.25, duration: 0.85, repeat: -1, yoyo: true, ease: "power1.inOut" })
        : gsap.to(el, { scale: 1.1, duration: 1.2, repeat: -1, yoyo: true, ease: "sine.inOut" });
      eventTweensRef.current.push(tween);
    }
  }, []);

  // Map initialization
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Custom hover tooltip div — bypasses MapLibre's CSS entirely
    const hoverDiv = document.createElement("div");
    hoverDiv.style.cssText =
      "position:fixed;display:none;pointer-events:none;z-index:9999;" +
      "background:#18181b;border:1px solid #3f3f46;border-radius:8px;" +
      "padding:10px 12px;color:#f4f4f5;box-shadow:0 4px 20px rgba(0,0,0,0.7);" +
      "min-width:130px;max-width:200px;font-family:inherit";
    document.body.appendChild(hoverDiv);
    hoverDivRef.current = hoverDiv;

    const tileUrl = `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/${campaign.id}/{z}/{x}/{y}.mvt`;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [-98.5795, 39.8283],
      zoom: 4,
      attributionControl: false,
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    if (navigator.geolocation) {
      map.current.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
        }),
        "top-right",
      );
    }
    map.current.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    const ro = new ResizeObserver(() => map.current?.resize());
    ro.observe(mapContainer.current);

    map.current.on("dataloading", () => setTilesLoading(true));
    map.current.on("idle", () => setTilesLoading(false));

    map.current.on("load", async () => {
      if (!map.current) return;

      // Territory vector tiles
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
          "fill-color": ["coalesce", ["feature-state", "color"], "#1f2937"],
          "fill-opacity": 0.5,
        },
      });

      map.current.addLayer({
        id: "territory-border",
        type: "line",
        source: "territory",
        "source-layer": "territories",
        paint: {
          "line-color": ["coalesce", ["feature-state", "color"], "#374151"],
          "line-width": 1.5,
          "line-opacity": 0.8,
        },
      });

      // Contribution point dots
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/${campaign.id}/locations`,
        );
        if (res.ok) {
          const locations = (await res.json()) as ContributionPoint[];
          map.current.addSource("contribution-pts", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: locations.map((loc) => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [loc.longitude, loc.latitude] },
                properties: {
                  value: loc.value ?? 1,
                  submitted_at: loc.submitted_at ?? "",
                },
              })),
            },
          });

          map.current.addLayer({
            id: "contribution-dots",
            type: "circle",
            source: "contribution-pts",
            paint: {
              "circle-radius": 6,
              "circle-color": "#22c55e",
              "circle-opacity": 0.9,
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#fff",
              "circle-stroke-opacity": 0.7,
            },
          });

          // Hover on contribution dots
          map.current.on("mouseenter", "contribution-dots", () => {
            if (map.current) map.current.getCanvas().style.cursor = "pointer";
          });
          map.current.on("mousemove", "contribution-dots", (e) => {
            if (!e.features?.[0]) return;
            const props = e.features[0].properties as { value?: number; submitted_at?: string };
            const date = props.submitted_at
              ? new Date(props.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "";
            hoverDiv.style.display = "block";
            hoverDiv.style.left = `${e.originalEvent.clientX + 14}px`;
            hoverDiv.style.top = `${e.originalEvent.clientY - 10}px`;
            hoverDiv.innerHTML =
              `<span style="font-size:13px">🗑️</span>` +
              `<span style="font-weight:600;font-size:12px;color:#f4f4f5;margin-left:6px">${props.value ?? 1} bag${(props.value ?? 1) !== 1 ? "s" : ""}</span>` +
              (date ? `<span style="color:#71717a;font-size:11px;margin-left:6px">${date}</span>` : "");
          });
          map.current.on("mouseleave", "contribution-dots", () => {
            if (map.current) map.current.getCanvas().style.cursor = "";
            hoverDiv.style.display = "none";
          });
        }
      } catch {
        // contribution dots are non-critical
      }

      // Territory hover tooltip
      let lastHoveredId: string | number | null = null;

      map.current.on("mousemove", "territory-fill", (e) => {
        if (!map.current || !e.features?.[0]) return;
        map.current.getCanvas().style.cursor = "pointer";
        hoverDiv.style.display = "block";
        hoverDiv.style.left = `${e.originalEvent.clientX + 14}px`;
        hoverDiv.style.top = `${e.originalEvent.clientY - 10}px`;

        const featId = e.features[0].id ?? null;
        if (featId !== lastHoveredId) {
          lastHoveredId = featId;
          const props = e.features[0].properties as { display_name?: string };
          const state = e.features[0].state as {
            total_value?: number;
            claimed_label?: string | null;
            claim_is_group?: boolean;
          };
          const zip = props.display_name ?? "—";
          const bags = state.total_value ?? 0;
          const claimerHtml = state.claimed_label
            ? `<div style="color:${state.claim_is_group ? "#34d399" : "#60a5fa"};font-size:11px;margin-top:4px">` +
              `${state.claim_is_group ? "👥" : "👤"} ${state.claimed_label}</div>` +
              `<div style="color:#a1a1aa;font-size:11px;margin-top:1px">${bags} bag${bags !== 1 ? "s" : ""}</div>`
            : `<div style="color:#52525b;font-size:11px;margin-top:4px">Unclaimed</div>`;
          hoverDiv.innerHTML =
            `<div style="font-weight:700;font-size:13px;color:#f4f4f5">ZIP ${zip}</div>` + claimerHtml;
        }
      });

      map.current.on("mouseleave", "territory-fill", () => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = "";
        hoverDiv.style.display = "none";
        lastHoveredId = null;
      });

      // Territory click → open panel
      map.current.on("click", "territory-fill", (e) => {
        if (!e.features?.[0]) return;
        const props = e.features[0].properties as { display_name?: string; geo_unit_id?: string };
        const geoUnitId = String(e.features[0].id ?? props.geo_unit_id ?? "");
        const displayName = props.display_name ?? geoUnitId;
        setSelectedZip({ geoUnitId, displayName });
      });

      // Apply initial state
      applyClaimsAsFeatureState(map.current, claimsRef.current, claimLabelsRef.current);
      updateEventMarkers(activeEventsRef.current);
    });

    return () => {
      if (hoverDivRef.current) {
        document.body.removeChild(hoverDivRef.current);
        hoverDivRef.current = null;
      }
      eventTweensRef.current.forEach((t) => t.kill());
      ro.disconnect();
      eventMarkersRef.current.forEach((m) => m.remove());
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync claims via feature-state when prop changes
  useEffect(() => {
    if (map.current?.isStyleLoaded()) {
      applyClaimsAsFeatureState(map.current, claims, claimLabelsRef.current);
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
          const label = claimLabelsRef.current[claim.geo_unit_id] ?? null;
          map.current.setFeatureState(
            { source: "territory", sourceLayer: "territories", id: claim.geo_unit_id },
            {
              color,
              total_value: claim.total_value ?? 0,
              claimed_label: label?.name ?? null,
              claim_is_group: label?.isGroup ?? false,
            },
          );
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaign.id]);

  return (
    <div className="relative flex flex-col flex-1 min-h-[500px]">
      <div ref={mapContainer} className="flex-1 w-full" />

      {selectedZip && (
        <TerritoryPanel
          geoUnitId={selectedZip.geoUnitId}
          displayName={selectedZip.displayName}
          claim={claimsRef.current.find((c) => c.geo_unit_id === selectedZip.geoUnitId) ?? null}
          claimLabel={claimLabelsRef.current[selectedZip.geoUnitId] ?? null}
          onClose={() => setSelectedZip(null)}
        />
      )}

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

      {tilesLoading && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
          <div className="w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
          <span className="text-zinc-400 text-xs">Loading map…</span>
        </div>
      )}

      <div className="absolute bottom-8 right-4 z-10 flex flex-col gap-1.5 text-xs">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
          <span className="w-3 h-3 rounded-full bg-emerald-500/90" />
          <span className="text-zinc-300">Cleanup logged</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
          <span className="w-3 h-3 rounded-sm bg-emerald-500/70" />
          <span className="text-zinc-300">Group territory</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
          <span className="w-3 h-3 rounded-sm bg-blue-500/70" />
          <span className="text-zinc-300">Individual territory</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
          <span className="w-3 h-3 rounded-sm bg-zinc-700/70" />
          <span className="text-zinc-300">Unclaimed</span>
        </div>
      </div>
    </div>
  );
}
