"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import gsap from "gsap";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { ClaimLabel } from "./CampaignMapWrapper";
import type { Feature, Point } from "geojson";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface ContributionPoint {
  id: string;
  user_id: string | null;
  value: number | null;
  photo_url: string | null;
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
  campaignType?: string;
  pinPickerActive?: boolean;
  pinPickerInitialCoords?: { latitude: number; longitude: number } | null;
  pinPickerConstrained?: boolean;
  onPinPlaced?: (lat: number, lng: number) => void;
  onPinCancelled?: () => void;
  newContribution?: { lat: number; lng: number; value: number; photoUrl?: string; key: number } | null;
  userLocation?: { latitude: number; longitude: number } | null;
  activeStyle?: StyleId;
}

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const MAP_STYLES = [
  { id: "outdoor", label: "Terrain" },
  { id: "streets", label: "Streets" },
  { id: "hybrid", label: "Satellite" },
] as const;

type StyleId = typeof MAP_STYLES[number]["id"];

function styleUrl(id: StyleId) {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function claimHeatColor(isGroup: boolean, totalValue: number): string {
  const t = Math.min(Math.max(totalValue, 0) / 50, 1);
  if (isGroup) {
    return `rgb(${Math.round(lerp(6, 16, t))},${Math.round(lerp(120, 185, t))},${Math.round(lerp(80, 129, t))})`;
  }
  return `rgb(${Math.round(lerp(30, 59, t))},${Math.round(lerp(80, 130, t))},${Math.round(lerp(180, 246, t))})`;
}

function claimHeatOpacity(owned: boolean, totalValue: number): number {
  if (!owned) return 0.22;
  return lerp(0.32, 0.50, Math.min(totalValue / 50, 1));
}

function claimBorderWidth(owned: boolean, totalValue: number): number {
  if (!owned) return 1.3;
  return lerp(2.5, 4.5, Math.min(totalValue / 50, 1));
}

function claimBorderOpacity(owned: boolean, _totalValue: number): number {
  return owned ? 1.0 : 0.7;
}

function claimBorderColor(owned: boolean, isGroup: boolean, totalValue: number): string {
  if (!owned) return "#a1a1aa";
  return claimHeatColor(isGroup, totalValue);
}

function applyClaimsAsFeatureState(
  map: maplibregl.Map,
  claims: TerritoryClaim[],
  claimLabels: Record<string, ClaimLabel> = {},
): void {
  for (const claim of claims) {
    if (!claim.geo_unit_id) continue;
    const owned = !!(claim.claimed_by_group || claim.claimed_by_user);
    const isGroup = !!claim.claimed_by_group;
    const totalValue = claim.total_value ?? 0;
    const color = owned ? claimHeatColor(isGroup, totalValue) : "#a1a1aa";
    const opacity = claimHeatOpacity(owned, totalValue);
    const borderWidth = claimBorderWidth(owned, totalValue);
    const label = claimLabels[claim.geo_unit_id] ?? null;
    map.setFeatureState(
      { source: "territory", sourceLayer: "territories", id: claim.geo_unit_id },
      {
        color,
        border_color: claimBorderColor(owned, isGroup, totalValue),
        opacity,
        border_width: borderWidth,
        border_opacity: claimBorderOpacity(owned, totalValue),
        total_value: totalValue,
        claimed_label: label?.name ?? null,
        claim_is_group: label?.isGroup ?? false,
      },
    );
  }
}

// ─── Photo marker helper (module-level to avoid stale closure) ───────────────

function addPhotoMarker(
  m: maplibregl.Map,
  loc: { latitude: number; longitude: number; photo_url: string | null; submitted_at?: string | null },
  onSelect: (url: string) => void,
): maplibregl.Marker {
  const el = document.createElement("div");
  el.style.cssText =
    "width:48px;height:48px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,0.7);" +
    "box-shadow:0 2px 10px rgba(0,0,0,0.6);cursor:pointer;flex-shrink:0;background:#27272a";

  if (loc.photo_url) {
    const img = document.createElement("img");
    img.src = loc.photo_url;
    img.style.cssText = "width:100%;height:100%;object-fit:cover";
    el.appendChild(img);
    el.onclick = () => onSelect(loc.photo_url!);
  } else {
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.fontSize = "20px";
    el.textContent = "📷";
  }

  return new maplibregl.Marker({ element: el, anchor: "center" })
    .setLngLat([loc.longitude, loc.latitude])
    .addTo(m);
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
  const isClaimed = !!(claim?.claimed_by_group || claim?.claimed_by_user);

  const accentHex = isClaimed ? (isGroup ? "#10b981" : "#3b82f6") : "#3f3f46";

  return (
    <div className="absolute top-[200px] right-2 z-20 w-60 overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/95 shadow-2xl backdrop-blur-sm">
      {/* Colored left accent strip */}
      <div className="absolute inset-y-0 left-0 w-[2px]" style={{ background: accentHex }} />

      {/* Header */}
      <div className="border-b border-zinc-800 pb-2.5 pl-4 pr-3 pt-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">Territory</p>
            <p className="text-xl font-black leading-none tracking-tight text-zinc-100">ZIP {displayName}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-2 mt-0.5 text-xl leading-none text-zinc-600 transition-colors hover:text-zinc-300"
          >
            ×
          </button>
        </div>

        <div className="mt-2.5">
          {claimLabel ? (
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{isGroup ? "👥" : "👤"}</span>
              <span className={`truncate text-sm font-semibold ${isGroup ? "text-emerald-400" : "text-blue-400"}`}>
                {claimLabel.name}
              </span>
            </div>
          ) : (
            <span className="text-sm text-zinc-600">Unclaimed</span>
          )}
          {isClaimed && (
            <p className="mt-1 text-xs text-zinc-500">{bags} bag{bags !== 1 ? "s" : ""} collected</p>
          )}
        </div>
      </div>

      {/* Recent cleanups */}
      <div className="pb-3 pl-4 pr-3 pt-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-zinc-600">Recent Cleanups</p>
        {loading ? (
          <p className="text-xs text-zinc-700">Loading…</p>
        ) : contribs.length === 0 ? (
          <p className="text-xs text-zinc-700">No cleanups logged yet</p>
        ) : (
          <div className="space-y-1.5">
            {contribs.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-zinc-300">
                  🗑️ {c.value ?? 1} bag{(c.value ?? 1) !== 1 ? "s" : ""}
                </span>
                <span className="text-xs text-zinc-600">
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

export default function CampaignMap({
  campaign,
  claims,
  activeEvents,
  claimLabels,
  campaignType,
  pinPickerActive = false,
  pinPickerInitialCoords,
  pinPickerConstrained = true,
  onPinPlaced,
  onPinCancelled,
  newContribution,
  userLocation,
  activeStyle = "outdoor",
}: Props) {
  const isCollage = campaignType === "collage";

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [tilesLoading, setTilesLoading] = useState(true);
  const [selectedZip, setSelectedZip] = useState<SelectedZip | null>(null);
  const [outOfZoneWarning, setOutOfZoneWarning] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const photoMarkersRef = useRef<maplibregl.Marker[]>([]);

  const claimsRef = useRef(claims);
  const activeEventsRef = useRef(activeEvents);
  const claimLabelsRef = useRef(claimLabels);
  const contributionFeaturesRef = useRef<Feature<Point>[]>([]);
  const eventMarkersRef = useRef<maplibregl.Marker[]>([]);
  const eventTweensRef = useRef<gsap.core.Tween[]>([]);
  const hoverDivRef = useRef<HTMLDivElement | null>(null);
  const pinPickerMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const pinPickerActiveRef = useRef(pinPickerActive);
  const pinPickerConstrainedRef = useRef(pinPickerConstrained);
  const outOfZoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapReadyRef = useRef(false);

  useEffect(() => { claimsRef.current = claims; }, [claims]);
  useEffect(() => { activeEventsRef.current = activeEvents; }, [activeEvents]);
  useEffect(() => { claimLabelsRef.current = claimLabels; }, [claimLabels]);
  useEffect(() => { pinPickerActiveRef.current = pinPickerActive; }, [pinPickerActive]);
  useEffect(() => { pinPickerConstrainedRef.current = pinPickerConstrained; }, [pinPickerConstrained]);

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
        ? "display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;background:radial-gradient(circle,rgba(153,27,27,0.97) 0%,rgba(127,29,29,0.97) 100%);border:2px solid #ef4444;font-size:26px;box-shadow:0 0 0 4px rgba(239,68,68,0.18),0 0 22px rgba(239,68,68,0.45),0 4px 14px rgba(0,0,0,0.85);cursor:pointer;transform-origin:center"
        : "display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:rgba(120,27,27,0.92);border:1.5px solid #f87171;font-size:17px;box-shadow:0 0 10px rgba(239,68,68,0.3),0 2px 8px rgba(0,0,0,0.65);cursor:pointer;transform-origin:center";
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

  // Adds territory + contribution sources/layers. Called on initial load and after every style swap
  // (setStyle wipes all custom sources/layers; event listeners persist and reattach automatically).
  const setupCustomLayers = useCallback(async () => {
    const m = map.current;
    if (!m) return;

    if (isCollage) {
      // Collage campaigns: no territory tiles — render photo markers instead
      photoMarkersRef.current.forEach((mk) => mk.remove());
      photoMarkersRef.current = [];
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/${campaign.id}/locations`,
        );
        if (res.ok) {
          const locations = (await res.json()) as ContributionPoint[];
          for (const loc of locations) {
            const marker = addPhotoMarker(m, loc, setSelectedPhoto);
            photoMarkersRef.current.push(marker);
          }
        }
      } catch {
        // photo markers are non-critical
      }
      return;
    }

    const tileUrl = `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/${campaign.id}/{z}/{x}/{y}.mvt`;

    m.addSource("territory", {
      type: "vector",
      tiles: [tileUrl],
      minzoom: 0,
      maxzoom: 14,
      promoteId: "geo_unit_id",
    });

    m.addLayer({
      id: "territory-fill",
      type: "fill",
      source: "territory",
      "source-layer": "territories",
      paint: {
        "fill-color": ["coalesce", ["feature-state", "color"], "#a1a1aa"],
        "fill-opacity": ["coalesce", ["feature-state", "opacity"], 0.22],
      },
    });

    m.addLayer({
      id: "territory-border",
      type: "line",
      source: "territory",
      "source-layer": "territories",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          "#ea580c",
          ["coalesce", ["feature-state", "border_color"], "#a1a1aa"],
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          ["+", ["coalesce", ["feature-state", "border_width"], 2.0], 2.5],
          ["coalesce", ["feature-state", "border_width"], 2.0],
        ],
        "line-opacity": ["coalesce", ["feature-state", "border_opacity"], 0.85],
      },
    });

    m.addLayer({
      id: "territory-hover",
      type: "fill",
      source: "territory",
      "source-layer": "territories",
      paint: {
        "fill-color": "#fde047",
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.52,
          0,
        ],
      },
    });

    const addDotLayer = () => m.addLayer({
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

    if (contributionFeaturesRef.current.length > 0) {
      m.addSource("contribution-pts", {
        type: "geojson",
        data: { type: "FeatureCollection", features: contributionFeaturesRef.current },
      });
      addDotLayer();
    } else {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/${campaign.id}/locations`,
        );
        if (res.ok) {
          const locations = (await res.json()) as ContributionPoint[];
          const features = locations.map((loc) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [loc.longitude, loc.latitude] },
            properties: {
              value: loc.value ?? 1,
              submitted_at: loc.submitted_at ?? "",
            },
          }));
          contributionFeaturesRef.current = features;
          m.addSource("contribution-pts", {
            type: "geojson",
            data: { type: "FeatureCollection", features },
          });
          addDotLayer();
        }
      } catch {
        // contribution dots are non-critical
      }
    }

    applyClaimsAsFeatureState(m, claimsRef.current, claimLabelsRef.current);
    updateEventMarkers(activeEventsRef.current);
  }, [campaign.id, isCollage, updateEventMarkers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Style switcher — setStyle wipes sources/layers; re-add them on style.load
  useEffect(() => {
    if (!map.current || !mapReadyRef.current) return;
    map.current.once("style.load", () => { setupCustomLayers(); });
    map.current.setStyle(styleUrl(activeStyle));
  }, [activeStyle, setupCustomLayers]);

  // Map initialization
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const hoverDiv = document.createElement("div");
    hoverDiv.style.cssText =
      "position:fixed;display:none;pointer-events:none;z-index:9999;" +
      "background:#18181b;border:1px solid #3f3f46;border-radius:8px;" +
      "padding:10px 12px;color:#f4f4f5;box-shadow:0 4px 20px rgba(0,0,0,0.7);" +
      "min-width:130px;max-width:200px;font-family:inherit";
    document.body.appendChild(hoverDiv);
    hoverDivRef.current = hoverDiv;

    const tileUrl = `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/${campaign.id}/{z}/{x}/{y}.mvt`;
    void tileUrl; // consumed inside setupCustomLayers

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl("outdoor"),
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
      mapReadyRef.current = true;
      await setupCustomLayers();

      // Event listeners are registered once here and persist through style swaps.
      map.current.on("mouseenter", "contribution-dots", () => {
        if (map.current) map.current.getCanvas().style.cursor = "pointer";
      });
      map.current.on("mousemove", "contribution-dots", (e) => {
        if (pinPickerActiveRef.current || !e.features?.[0]) return;
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

      let lastHoveredId: string | number | null = null;

      map.current.on("mousemove", "territory-fill", (e) => {
        if (!map.current || !e.features?.[0] || pinPickerActiveRef.current) return;
        map.current.getCanvas().style.cursor = "pointer";
        hoverDiv.style.display = "block";
        hoverDiv.style.left = `${e.originalEvent.clientX + 14}px`;
        hoverDiv.style.top = `${e.originalEvent.clientY - 10}px`;

        const featId = e.features[0].id ?? null;
        if (featId !== lastHoveredId) {
          if (lastHoveredId !== null) {
            map.current.setFeatureState(
              { source: "territory", sourceLayer: "territories", id: lastHoveredId },
              { hover: false },
            );
          }
          if (featId !== null) {
            map.current.setFeatureState(
              { source: "territory", sourceLayer: "territories", id: featId },
              { hover: true },
            );
          }
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
        if (lastHoveredId !== null) {
          map.current.setFeatureState(
            { source: "territory", sourceLayer: "territories", id: lastHoveredId },
            { hover: false },
          );
        }
        map.current.getCanvas().style.cursor = "";
        hoverDiv.style.display = "none";
        lastHoveredId = null;
      });

      map.current.on("click", "territory-fill", (e) => {
        if (!e.features?.[0] || pinPickerActiveRef.current) return;
        const props = e.features[0].properties as { display_name?: string; geo_unit_id?: string };
        const geoUnitId = String(e.features[0].id ?? props.geo_unit_id ?? "");
        const displayName = props.display_name ?? geoUnitId;
        setSelectedZip({ geoUnitId, displayName });
      });
    });

    return () => {
      if (hoverDivRef.current) {
        document.body.removeChild(hoverDivRef.current);
        hoverDivRef.current = null;
      }
      userLocationMarkerRef.current?.remove();
      userLocationMarkerRef.current = null;
      eventTweensRef.current.forEach((t) => t.kill());
      ro.disconnect();
      eventMarkersRef.current.forEach((m) => m.remove());
      photoMarkersRef.current.forEach((m) => m.remove());
      photoMarkersRef.current = [];
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

  // Pin picker: add/remove draggable marker with ZIP boundary constraint
  useEffect(() => {
    pinPickerMarkerRef.current?.remove();
    pinPickerMarkerRef.current = null;
    if (hoverDivRef.current) hoverDivRef.current.style.display = "none";
    setOutOfZoneWarning(false);

    if (!pinPickerActive || !pinPickerInitialCoords || !map.current) return;

    map.current.flyTo({
      center: [pinPickerInitialCoords.longitude, pinPickerInitialCoords.latitude],
      zoom: 15,
      duration: 700,
    });

    const marker = new maplibregl.Marker({ draggable: true, color: "#22c55e" })
      .setLngLat([pinPickerInitialCoords.longitude, pinPickerInitialCoords.latitude])
      .addTo(map.current);
    pinPickerMarkerRef.current = marker;

    let lastValidLng = pinPickerInitialCoords.longitude;
    let lastValidLat = pinPickerInitialCoords.latitude;
    // undefined = fetch in progress, null = outside any zone (fail open)
    let userGeoUnitId: string | null | undefined = undefined;
    const apiBase = process.env.NEXT_PUBLIC_FASTAPI_URL;

    fetch(
      `${apiBase}/api/contributions/${campaign.id}/geo-unit-at?lat=${pinPickerInitialCoords.latitude}&lng=${pinPickerInitialCoords.longitude}`,
    )
      .then((r) => r.json())
      .then((d: { geo_unit_id: string | null }) => { userGeoUnitId = d.geo_unit_id; })
      .catch(() => { userGeoUnitId = null; });

    marker.on("dragend", () => {
      const pos = marker.getLngLat();
      if (!pinPickerConstrainedRef.current || userGeoUnitId === undefined || userGeoUnitId === null) {
        lastValidLng = pos.lng;
        lastValidLat = pos.lat;
        return;
      }
      fetch(
        `${apiBase}/api/contributions/${campaign.id}/geo-unit-at?lat=${pos.lat}&lng=${pos.lng}`,
      )
        .then((r) => r.json())
        .then((d: { geo_unit_id: string | null }) => {
          if (d.geo_unit_id !== userGeoUnitId) {
            marker.setLngLat([lastValidLng, lastValidLat]);
            setOutOfZoneWarning(true);
            if (outOfZoneTimerRef.current) clearTimeout(outOfZoneTimerRef.current);
            outOfZoneTimerRef.current = setTimeout(() => setOutOfZoneWarning(false), 2500);
          } else {
            lastValidLng = pos.lng;
            lastValidLat = pos.lat;
          }
        })
        .catch(() => {
          lastValidLng = pos.lng;
          lastValidLat = pos.lat;
        });
    });

    return () => {
      marker.remove();
      pinPickerMarkerRef.current = null;
      if (outOfZoneTimerRef.current) clearTimeout(outOfZoneTimerRef.current);
    };
  }, [pinPickerActive, pinPickerInitialCoords, campaign.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // User location marker — auto-dropped when GPS is captured in the contribution panel
  useEffect(() => {
    userLocationMarkerRef.current?.remove();
    userLocationMarkerRef.current = null;

    if (!userLocation || !map.current || pinPickerActive) return;

    const outer = document.createElement("div");
    outer.style.cssText = "width:22px;height:22px;display:flex;align-items:center;justify-content:center;pointer-events:none";
    const ring = document.createElement("div");
    ring.style.cssText = "position:absolute;width:22px;height:22px;border-radius:50%;background:rgba(59,130,246,0.25)";
    const dot = document.createElement("div");
    dot.style.cssText = "width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2px solid white;position:relative";
    outer.appendChild(ring);
    outer.appendChild(dot);

    gsap.to(ring, { scale: 1.6, opacity: 0, duration: 1.6, repeat: -1, ease: "power2.out" });

    userLocationMarkerRef.current = new maplibregl.Marker({ element: outer, anchor: "center" })
      .setLngLat([userLocation.longitude, userLocation.latitude])
      .addTo(map.current);
  }, [userLocation, pinPickerActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Append freshly-submitted contribution to the live map
  useEffect(() => {
    if (!newContribution || !map.current?.isStyleLoaded()) return;

    if (isCollage) {
      const marker = addPhotoMarker(
        map.current,
        {
          latitude: newContribution.lat,
          longitude: newContribution.lng,
          photo_url: newContribution.photoUrl ?? null,
          submitted_at: new Date().toISOString(),
        },
        setSelectedPhoto,
      );
      photoMarkersRef.current.push(marker);
      return;
    }

    const source = map.current.getSource("contribution-pts") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const feature: Feature<Point> = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [newContribution.lng, newContribution.lat] },
      properties: { value: newContribution.value, submitted_at: new Date().toISOString() },
    };
    contributionFeaturesRef.current = [...contributionFeaturesRef.current, feature];
    source.setData({ type: "FeatureCollection", features: contributionFeaturesRef.current });
  }, [newContribution, isCollage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Supabase Realtime
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
          const owned = !!(claim.claimed_by_group || claim.claimed_by_user);
          const isGroup = !!claim.claimed_by_group;
          const totalValue = claim.total_value ?? 0;
          const color = owned ? claimHeatColor(isGroup, totalValue) : "#a1a1aa";
          const label = claimLabelsRef.current[claim.geo_unit_id] ?? null;
          map.current.setFeatureState(
            { source: "territory", sourceLayer: "territories", id: claim.geo_unit_id },
            {
              color,
              border_color: claimBorderColor(owned, isGroup, totalValue),
              opacity: claimHeatOpacity(owned, totalValue),
              border_width: claimBorderWidth(owned, totalValue),
              border_opacity: claimBorderOpacity(owned, totalValue),
              total_value: totalValue,
              claimed_label: label?.name ?? null,
              claim_is_group: label?.isGroup ?? false,
            },
          );
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaign.id]);

  const handleConfirmPin = () => {
    const pos = pinPickerMarkerRef.current?.getLngLat();
    if (pos) onPinPlaced?.(pos.lat, pos.lng);
  };

  return (
    <div className="relative flex flex-col flex-1 min-h-[500px]">
      <div ref={mapContainer} className="flex-1 w-full" />

      {selectedZip && !pinPickerActive && (
        <TerritoryPanel
          geoUnitId={selectedZip.geoUnitId}
          displayName={selectedZip.displayName}
          claim={claimsRef.current.find((c) => c.geo_unit_id === selectedZip.geoUnitId) ?? null}
          claimLabel={claimLabelsRef.current[selectedZip.geoUnitId] ?? null}
          onClose={() => setSelectedZip(null)}
        />
      )}

      {pinPickerActive && (
        <>
          <div className={`absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 border rounded-lg text-sm text-center shadow-xl whitespace-nowrap transition-colors duration-200 ${outOfZoneWarning
              ? "bg-red-950/95 border-red-700 text-red-300"
              : "bg-zinc-900/95 border-zinc-700 text-zinc-200"
            }`}>
            {outOfZoneWarning
              ? "Pin must stay within your ZIP code"
              : "Drag the pin to your exact cleanup location"}
          </div>
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex gap-3">
            <button
              onClick={handleConfirmPin}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow-lg transition-colors"
            >
              Confirm location
            </button>
            <button
              onClick={onPinCancelled}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-300 text-sm rounded-lg shadow-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {activeEvents.length > 0 && !pinPickerActive && (
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

      {!pinPickerActive && !isCollage && (
        <>
          {/* Legend — territory campaigns only */}
          <div className="absolute bottom-14 right-4 z-10 flex flex-col gap-1.5 text-xs">
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
              <span className="w-3 h-3 rounded-sm border border-[#a1a1aa] bg-transparent" />
              <span className="text-zinc-300">Unclaimed</span>
            </div>
          </div>
        </>
      )}

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPhoto}
              alt="Contribution photo"
              className="w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
