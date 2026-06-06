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

// ─── Choropleth (state partisan-lean) helpers ────────────────────────────────

// D = positive, R = negative, 0 = swing. Based on 2024 presidential results.
const US_STATE_LEAN: Record<string, number> = {
  Alabama: -1.0, Alaska: -0.4, Arizona: -0.1, Arkansas: -0.9,
  California: 0.9, Colorado: 0.5, Connecticut: 0.6, Delaware: 0.6,
  Florida: -0.5, Georgia: -0.1, Hawaii: 0.9, Idaho: -0.9,
  Illinois: 0.6, Indiana: -0.7, Iowa: -0.6, Kansas: -0.8,
  Kentucky: -0.9, Louisiana: -0.8, Maine: 0.3, Maryland: 0.8,
  Massachusetts: 0.8, Michigan: 0.1, Minnesota: 0.3, Mississippi: -0.8,
  Missouri: -0.8, Montana: -0.6, Nebraska: -0.6, Nevada: 0.0,
  "New Hampshire": 0.1, "New Jersey": 0.5, "New Mexico": 0.4, "New York": 0.7,
  "North Carolina": -0.1, "North Dakota": -0.9, Ohio: -0.6, Oklahoma: -0.9,
  Oregon: 0.6, Pennsylvania: 0.0, "Rhode Island": 0.7, "South Carolina": -0.6,
  "South Dakota": -0.9, Tennessee: -0.9, Texas: -0.5, Utah: -0.5,
  Vermont: 0.9, Virginia: 0.4, Washington: 0.7, "West Virginia": -0.9,
  Wisconsin: 0.0, Wyoming: -1.0, "District of Columbia": 0.95,
};

const CHOROPLETH_THRESHOLD = 500;

function choroplethFillColor(lean: number, totalRegistrations: number): string {
  const progress = Math.min(Math.max(totalRegistrations, 0) / CHOROPLETH_THRESHOLD, 1);
  const isR = lean < 0;
  const s = Math.abs(lean);
  const rS = isR ? Math.round(lerp(180, 220, s)) : 100;
  const gS = isR ? 38 : Math.round(lerp(100, 38, s));
  const bS = isR ? 38 : Math.round(lerp(180, 235, s));
  return `rgb(${Math.round(lerp(rS, 113, progress))},${Math.round(lerp(gS, 113, progress))},${Math.round(lerp(bS, 122, progress))})`;
}

function choroplethBorderColor(lean: number, totalRegistrations: number): string {
  const progress = Math.min(Math.max(totalRegistrations, 0) / CHOROPLETH_THRESHOLD, 1);
  const isR = lean < 0;
  const s = Math.abs(lean);
  const rS = isR ? Math.round(lerp(160, 200, s)) : 80;
  const gS = isR ? 60 : Math.round(lerp(80, 50, s));
  const bS = isR ? 60 : Math.round(lerp(160, 210, s));
  return `rgb(${Math.round(lerp(rS, 82, progress))},${Math.round(lerp(gS, 82, progress))},${Math.round(lerp(bS, 91, progress))})`;
}

function getChoroplethLeanLookup(m: maplibregl.Map): Record<string, number> {
  const features = m.querySourceFeatures("territory", { sourceLayer: "territories" });
  const lookup: Record<string, number> = {};
  for (const f of features) {
    if (!f.id) continue;
    const dn = (f.properties as { display_name?: string }).display_name ?? "";
    lookup[String(f.id)] = US_STATE_LEAN[dn] ?? 0;
  }
  return lookup;
}

function initializeChoroplethColors(m: maplibregl.Map): void {
  const features = m.querySourceFeatures("territory", { sourceLayer: "territories" });
  for (const f of features) {
    if (!f.id) continue;
    const dn = (f.properties as { display_name?: string }).display_name ?? "";
    const lean = US_STATE_LEAN[dn] ?? 0;
    const color = choroplethFillColor(lean, 0);
    const borderColor = choroplethBorderColor(lean, 0);
    m.setFeatureState(
      { source: "territory", sourceLayer: "territories", id: f.id },
      { color, border_color: borderColor, opacity: 0.55, border_width: 1.5, border_opacity: 0.85 },
    );
  }
}

// ─── Territory heat helpers ───────────────────────────────────────────────────

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
  isChoropleth = false,
): void {
  if (isChoropleth) {
    const leanLookup = getChoroplethLeanLookup(map);
    for (const claim of claims) {
      if (!claim.geo_unit_id) continue;
      const lean = leanLookup[claim.geo_unit_id] ?? 0;
      const totalValue = claim.total_value ?? 0;
      map.setFeatureState(
        { source: "territory", sourceLayer: "territories", id: claim.geo_unit_id },
        {
          color: choroplethFillColor(lean, totalValue),
          border_color: choroplethBorderColor(lean, totalValue),
          opacity: 0.55,
          border_width: 1.5,
          border_opacity: 0.9,
          total_value: totalValue,
        },
      );
    }
    return;
  }

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
    <div className="absolute top-auto bottom-28 sm:top-[200px] sm:bottom-auto right-2 left-2 sm:left-auto z-20 sm:w-60 overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/95 shadow-2xl backdrop-blur-sm">
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

// ─── State detail panel (choropleth campaigns) ────────────────────────────────

function StatePanel({
  geoUnitId,
  displayName,
  totalRegistrations,
  onClose,
}: {
  geoUnitId: string;
  displayName: string;
  totalRegistrations: number;
  onClose: () => void;
}) {
  const lean = US_STATE_LEAN[displayName] ?? 0;
  const progress = Math.min(totalRegistrations / CHOROPLETH_THRESHOLD, 1);
  const isR = lean < 0;
  const accentColor = isR ? "#ef4444" : "#3b82f6";
  const party = Math.abs(lean) < 0.15 ? "Swing" : isR ? "Republican" : "Democrat";

  return (
    <div className="absolute top-auto bottom-28 sm:top-[200px] sm:bottom-auto right-2 left-2 sm:left-auto z-20 sm:w-64 overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/95 shadow-2xl backdrop-blur-sm">
      <div className="absolute inset-y-0 left-0 w-[2px]" style={{ background: accentColor }} />
      <div className="border-b border-zinc-800 pb-2.5 pl-4 pr-3 pt-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">State</p>
            <p className="text-xl font-black leading-none tracking-tight text-zinc-100">{displayName}</p>
            <p className="mt-1 text-xs" style={{ color: accentColor }}>{party}</p>
          </div>
          <button onClick={onClose} className="ml-2 mt-0.5 text-xl leading-none text-zinc-600 hover:text-zinc-300">×</button>
        </div>
      </div>
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs text-zinc-500">Registrations</span>
          <span className="text-sm font-bold text-zinc-200 tabular-nums">
            {totalRegistrations.toLocaleString()} / {CHOROPLETH_THRESHOLD.toLocaleString()}
          </span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress * 100}%`, background: accentColor }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          {progress >= 1 ? "Fully neutralized ✓" : `${Math.round((1 - progress) * CHOROPLETH_THRESHOLD - totalRegistrations + 1)} more to neutralize`}
        </p>
      </div>
    </div>
  );
}

function pulseClaim(m: maplibregl.Map, geoUnitId: string): void {
  const obj = { v: 0.45 };
  gsap.to(obj, {
    v: 0,
    duration: 0.9,
    ease: "power2.out",
    onUpdate: () => {
      m.setFeatureState(
        { source: "territory", sourceLayer: "territories", id: geoUnitId },
        { pulse_extra: obj.v },
      );
    },
  });
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
  const isChoropleth = campaignType === "choropleth";

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

      const entranceTween = gsap.from(el, { scale: 0, duration: 0.55, ease: "back.out(1.7)" });
      const pulseTween = isBoss
        ? gsap.to(el, { scale: 1.25, duration: 0.85, repeat: -1, yoyo: true, ease: "power1.inOut", delay: 0.55 })
        : gsap.to(el, { scale: 1.1, duration: 1.2, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 0.55 });
      eventTweensRef.current.push(entranceTween, pulseTween);
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
        "fill-opacity": [
          "min",
          ["+",
            ["coalesce", ["feature-state", "opacity"], 0.22],
            ["coalesce", ["feature-state", "pulse_extra"], 0],
          ],
          0.95,
        ],
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

    if (isChoropleth) {
      // Initialize partisan lean colors; re-apply after source tiles load
      const applyInitial = () => {
        if (!m.isSourceLoaded("territory")) return;
        initializeChoroplethColors(m);
        applyClaimsAsFeatureState(m, claimsRef.current, claimLabelsRef.current, true);
        m.off("sourcedata", applyInitial as unknown as Parameters<typeof m.on>[1]);
      };
      if (m.isSourceLoaded("territory")) {
        initializeChoroplethColors(m);
        applyClaimsAsFeatureState(m, claimsRef.current, claimLabelsRef.current, true);
      } else {
        m.on("sourcedata", applyInitial);
      }
    } else {
      applyClaimsAsFeatureState(m, claimsRef.current, claimLabelsRef.current);
    }
    updateEventMarkers(activeEventsRef.current);
  }, [campaign.id, isCollage, isChoropleth, updateEventMarkers]); // eslint-disable-line react-hooks/exhaustive-deps

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
          const featureState = e.features[0].state as {
            total_value?: number;
            claimed_label?: string | null;
            claim_is_group?: boolean;
          };
          const displayName = props.display_name ?? "—";
          const totalVal = featureState.total_value ?? 0;
          if (isChoropleth) {
            const lean = US_STATE_LEAN[displayName] ?? 0;
            const isR = lean < 0;
            const party = Math.abs(lean) < 0.15 ? "Swing" : isR ? "Republican" : "Democrat";
            const pct = Math.min(Math.round((totalVal / CHOROPLETH_THRESHOLD) * 100), 100);
            hoverDiv.innerHTML =
              `<div style="font-weight:700;font-size:13px;color:#f4f4f5">${displayName}</div>` +
              `<div style="color:${isR ? "#f87171" : "#60a5fa"};font-size:11px;margin-top:4px">${party}</div>` +
              `<div style="color:#a1a1aa;font-size:11px;margin-top:2px">${totalVal.toLocaleString()} registrations · ${pct}% neutralized</div>`;
          } else {
            const bags = totalVal;
            const claimerHtml = featureState.claimed_label
              ? `<div style="color:${featureState.claim_is_group ? "#34d399" : "#60a5fa"};font-size:11px;margin-top:4px">` +
              `${featureState.claim_is_group ? "👥" : "👤"} ${featureState.claimed_label}</div>` +
              `<div style="color:#a1a1aa;font-size:11px;margin-top:1px">${bags} bag${bags !== 1 ? "s" : ""}</div>`
              : `<div style="color:#52525b;font-size:11px;margin-top:4px">Unclaimed</div>`;
            hoverDiv.innerHTML =
              `<div style="font-weight:700;font-size:13px;color:#f4f4f5">ZIP ${displayName}</div>` + claimerHtml;
          }
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
      applyClaimsAsFeatureState(map.current, claims, claimLabelsRef.current, isChoropleth);
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
      gsap.from(marker.getElement(), { y: -40, opacity: 0, duration: 0.5, ease: "bounce.out" });
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
          const totalValue = claim.total_value ?? 0;
          if (isChoropleth) {
            const leanLookup = getChoroplethLeanLookup(map.current);
            const lean = leanLookup[claim.geo_unit_id] ?? 0;
            map.current.setFeatureState(
              { source: "territory", sourceLayer: "territories", id: claim.geo_unit_id },
              {
                color: choroplethFillColor(lean, totalValue),
                border_color: choroplethBorderColor(lean, totalValue),
                opacity: 0.55,
                border_width: 1.5,
                border_opacity: 0.9,
                total_value: totalValue,
              },
            );
          } else {
            const owned = !!(claim.claimed_by_group || claim.claimed_by_user);
            const isGroup = !!claim.claimed_by_group;
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
          }
          pulseClaim(map.current, claim.geo_unit_id);
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
        isChoropleth ? (
          <StatePanel
            geoUnitId={selectedZip.geoUnitId}
            displayName={selectedZip.displayName}
            totalRegistrations={claimsRef.current.find((c) => c.geo_unit_id === selectedZip.geoUnitId)?.total_value ?? 0}
            onClose={() => setSelectedZip(null)}
          />
        ) : (
          <TerritoryPanel
            geoUnitId={selectedZip.geoUnitId}
            displayName={selectedZip.displayName}
            claim={claimsRef.current.find((c) => c.geo_unit_id === selectedZip.geoUnitId) ?? null}
            claimLabel={claimLabelsRef.current[selectedZip.geoUnitId] ?? null}
            onClose={() => setSelectedZip(null)}
          />
        )
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
        <div className="absolute bottom-14 right-4 z-10 flex flex-col gap-1.5 text-xs">
          {isChoropleth ? (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 rounded-sm bg-blue-600/80" />
                <span className="text-zinc-300">Democrat lean</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 rounded-sm bg-red-600/80" />
                <span className="text-zinc-300">Republican lean</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 rounded-sm bg-zinc-500/80" />
                <span className="text-zinc-300">Neutralized</span>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
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
