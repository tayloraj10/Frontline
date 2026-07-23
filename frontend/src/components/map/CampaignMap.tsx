"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import gsap from "gsap";
import { cellToBoundary } from "h3-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { ClaimLabel } from "./CampaignMapWrapper";
import type { ProblemReports, ProblemReportMapData } from "@/app/campaigns/[slug]/CampaignPageClient";
import type { Feature, Point } from "geojson";
import type { SelectedArea } from "@/app/admin/EventAreaMapPicker";
import { getCleanupRoute, type CampaignCleanupRoute } from "@/lib/cleanupRoutes";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

const CONTINENTAL_US_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-125, 24.5],
  [-66.9, 49.5],
];
const UK_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-8.65, 49.85],
  [1.87, 60.9],
];
const WORLD_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-170, -58],
  [179, 80],
];
// Desktop starting extent for Hex Bloom campaigns — tighter than WORLD_BOUNDS since
// solarpunk's real activity (as opposed to its seeded example hexes scattered
// worldwide) concentrates in North America and Europe. Mobile keeps the full
// WORLD_BOUNDS fit since its narrower aspect ratio already zooms in similarly.
const NORTH_AMERICA_EUROPE_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-130, 15],
  [40, 72],
];

// Mirrors HOTSPOT_PROXIMITY_METERS_UK/US in backend/app/api/routes/contributions.py — the max
// distance a cleanup submission may be from a reported hotspot to claim it as resolved.
const REPORT_CLAIM_RADIUS_METERS_UK = 100;
const REPORT_CLAIM_RADIUS_METERS_US = 91.44; // 300 ft
const EARTH_RADIUS_METERS = 6371000;
// Mirrors FLAG_AUTO_HIDE_THRESHOLD in backend/app/api/routes/problem_reports.py.
const FLAG_AUTO_HIDE_THRESHOLD = 3;

// Mirrors CLEANUP_EVENT_PROXIMITY_METERS in backend/app/api/routes/cleanup_events.py — the
// check-in radius shown as a circle around each group cleanup event, same for every event.
const CLEANUP_EVENT_RADIUS_METERS = 150;

const ROUTE_LOOP_CLOSE_METERS = 20;

/** Haversine distance in meters between two [lng, lat] points. */
function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Approximates a real-world-meter circle as a GeoJSON polygon so it scales correctly
// with zoom (a DOM marker, by contrast, stays a fixed pixel size regardless of zoom).
function circlePolygon(lat: number, lng: number, radiusMeters: number, steps = 48): [number, number][] {
  const latRad = (lat * Math.PI) / 180;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    const dLat = (dy / EARTH_RADIUS_METERS) * (180 / Math.PI);
    const dLng = (dx / (EARTH_RADIUS_METERS * Math.cos(latRad))) * (180 / Math.PI);
    coords.push([lng + dLng, lat + dLat]);
  }
  return coords;
}

// Builds an overlapping row of same-size host-group logo circles (primary + cohosts),
// mirroring the "in partnership with" avatar stack used on the event detail page. Uses
// display:inline-flex so the wrapper shrink-wraps to its actual content width — a plain
// block div here would stretch to the container's full width and throw off maplibre's
// -50%/-50% centering transform on the marker.
function createHostLogoStack(
  hosts: { logo_url?: string | null }[],
  size: number,
  isPast: boolean,
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:inline-flex;align-items:center;cursor:pointer;";

  // Only groups with an actual logo get a circle here — a group without one is skipped
  // rather than shown as a generic placeholder. If nothing has a logo, fall back to a
  // single generic circle so the marker stays visible/clickable on the map.
  const logoHosts = hosts.filter((h) => h.logo_url);
  const renderHosts = logoHosts.length > 0 ? logoHosts : [{ logo_url: null }];

  const overlap = Math.round(size * 0.35);
  renderHosts.forEach((host, i) => {
    const el = document.createElement("div");
    el.style.cssText =
      `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;` +
      `position:relative;z-index:${renderHosts.length - i};` +
      (i > 0 ? `margin-left:-${overlap}px;` : "") +
      (isPast
        ? "border:2px solid #71717a;box-shadow:0 1px 4px rgba(0,0,0,0.6);opacity:0.5;filter:grayscale(60%);"
        : "border:2px solid #38bdf8;box-shadow:0 0 8px rgba(56,189,248,0.7),0 1px 4px rgba(0,0,0,0.6);") +
      "display:flex;align-items:center;justify-content:center;background:rgba(12,74,110,0.9)";

    if (host.logo_url) {
      const img = document.createElement("img");
      img.src = host.logo_url;
      img.style.cssText = "width:100%;height:100%;object-fit:cover";
      el.appendChild(img);
    } else {
      el.textContent = "🧹";
      el.style.fontSize = `${Math.round(size * 0.5)}px`;
    }
    wrapper.appendChild(el);
  });

  return wrapper;
}

// Short "at a glance" date/time text for the small pill shown above a cleanup event's
// marker on the map — same fields as the full detail popup's format, just on one line.
function formatEventDateTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// A small always-visible label anchored above a marker's icon, used for the date/time
// pill on cleanup event markers — a second maplibregl.Marker at the same lnglat rather
// than a Popup, since it needs to stay open (not hover/click triggered) and reposition
// with the map like any other marker.
function createDateTimeLabelMarker(
  map: maplibregl.Map,
  lngLat: [number, number],
  text: string,
  aboveOffsetPx: number,
): maplibregl.Marker {
  const el = document.createElement("div");
  el.style.cssText =
    "pointer-events:none;white-space:nowrap;font-size:10px;font-weight:600;color:#e4e4e7;" +
    "background:rgba(24,24,27,0.85);border:1px solid rgba(255,255,255,0.15);border-radius:4px;" +
    "padding:1px 6px;box-shadow:0 1px 4px rgba(0,0,0,0.5);";
  el.textContent = text;
  return new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -aboveOffsetPx] })
    .setLngLat(lngLat)
    .addTo(map);
}

// Event markers shrink at low zoom so they don't dominate the viewport, and reach full
// size once zoomed in. Campaigns are bounds-fit (not a fixed initial zoom), so this curve
// is generic rather than tuned to any one campaign's natural zoom level.
const EVENT_MARKER_SCALE_MAX_ZOOM = 12;
const EVENT_MARKER_SCALE_MIN_ZOOM = 5;
const EVENT_MARKER_SCALE_MIN = 0.45;

function getEventMarkerScale(zoom: number): number {
  if (zoom >= EVENT_MARKER_SCALE_MAX_ZOOM) return 1;
  if (zoom <= EVENT_MARKER_SCALE_MIN_ZOOM) return EVENT_MARKER_SCALE_MIN;
  const t =
    (zoom - EVENT_MARKER_SCALE_MIN_ZOOM) / (EVENT_MARKER_SCALE_MAX_ZOOM - EVENT_MARKER_SCALE_MIN_ZOOM);
  return EVENT_MARKER_SCALE_MIN + t * (1 - EVENT_MARKER_SCALE_MIN);
}

// Zero-cost, no-permission-prompt signal for a UK vs. US default view. Only consulted
// for campaigns whose geo_unit already covers uk_postcode_district (e.g. Trash War).
function isLikelyUK(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return /^Europe\/(London|Belfast|Jersey|Guernsey|Isle_of_Man)$/.test(tz);
  } catch {
    return false;
  }
}

interface ContributionPoint {
  id: string;
  user_id: string | null;
  value: number | null;
  photo_url: string | null;
  submitted_at: string | null;
  is_group_event?: boolean;
  latitude: number;
  longitude: number;
}

interface SelectedZip {
  geoUnitId: string;
  displayName: string;
  unitLabel: string;
}

interface HexBloomEntry {
  geo_unit_id: string;
  h3_index: string;
  bloom_score: number;
  bloom_stage: number;
  seed_source: string | null;
}

const BLOOM_STAGE_LABELS = [
  "Untouched",    // stage 0 — no contributions
  "Dormant",      // stage 1 — 1–49 pts
  "Germinating",  // stage 2 — 50–199 pts
  "Growing",      // stage 3 — 200–599 pts
  "Thriving",     // stage 4 — 600–1499 pts
  "Flourishing",  // stage 5 — 1500+ pts
];
const BLOOM_STAGE_COLORS = ["#3d4a5c", "#2a3d50", "#1f3a18", "#2d5c24", "#3d7a2e", "#5ca84a"];
const BLOOM_THRESHOLDS = [null, 0, 50, 200, 600, 1500];

// Fixed, visually distinct palette for the NYC neighborhoods overlay. Sized well above the
// observed max adjacency degree (~6) both so greedy coloring never runs out of options and
// so the mosaic reads as varied rather than repetitive across ~200 neighborhoods.
const NYC_NEIGHBORHOOD_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#78716c",
];

// Greedy graph coloring: visits neighborhoods in a randomized order (so the resulting
// palette pattern varies per page load) and assigns each a color picked at random from
// every index not already used by an already-colored neighbor. Picking randomly among
// valid options (rather than always the lowest-indexed one) is what actually spreads
// usage across the full palette — a "lowest available" strategy is a color-minimizing
// algorithm by design and will converge on using only ~chromatic-number colors no
// matter how large the palette is. No two adjacent neighborhoods share a color as long
// as paletteSize > the graph's max node degree.
function computeGraphColoring(
  adjacency: Record<string, string[]>,
  paletteSize: number,
): Record<string, number> {
  const nodes = Object.keys(adjacency);
  for (let i = nodes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
  }

  const colors: Record<string, number> = {};
  for (const node of nodes) {
    const usedByNeighbors = new Set(
      (adjacency[node] ?? []).map((n) => colors[n]).filter((c) => c !== undefined),
    );
    const available: number[] = [];
    for (let c = 0; c < paletteSize; c++) {
      if (!usedByNeighbors.has(c)) available.push(c);
    }
    colors[node] =
      available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : Math.floor(Math.random() * paletteSize); // degree >= paletteSize: extremely unlikely clash
  }
  return colors;
}

function hexEntryToFeature(entry: HexBloomEntry): GeoJSON.Feature<GeoJSON.Polygon> {
  const boundary = cellToBoundary(entry.h3_index);
  const coords = boundary.map(([lat, lng]) => [lng, lat] as [number, number]);
  coords.push(coords[0]);
  return {
    type: "Feature",
    id: entry.geo_unit_id,
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {
      h3_index: entry.h3_index,
      bloom_score: entry.bloom_score,
      bloom_stage: entry.bloom_stage,
      seed_source: entry.seed_source,
    },
  };
}

export type MapBusiness = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  lat: number;
  lng: number;
  activeOfferTitle?: string | null;
};

export type MapCleanupEvent = {
  id: string;
  title: string;
  description: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: string;
  image_url: string | null;
  lat: number;
  lng: number;
  group_id: string;
  group_name: string;
  group_slug: string;
  group_logo_url: string | null;
  cohost_groups?: { group_id: string; group_name: string; group_slug: string; group_logo_url: string | null }[];
  is_past?: boolean;
  total_small_bags?: number;
  total_large_bags?: number;
};

interface Props {
  campaign: Campaign;
  claims: TerritoryClaim[];
  activeEvents: CampaignEvent[];
  claimLabels: Record<string, ClaimLabel>;
  campaignType?: string;
  pinPickerActive?: boolean;
  pinPickerInitialCoords?: { latitude: number; longitude: number } | null;
  pinPickerConstrained?: boolean;
  pinPickerLabel?: string;
  onPinPlaced?: (lat: number, lng: number) => void;
  onPinCancelled?: () => void;
  areaPickerActive?: boolean;
  areaPickerUnitType?: string | null;
  onAreaPickerChange?: (areas: SelectedArea[]) => void;
  onAreaPickerConfirm?: () => void;
  onAreaPickerCancel?: () => void;
  routePickerActive?: boolean;
  onRoutePickerChange?: (coordinates: [number, number][]) => void;
  onRoutePickerFinish?: () => void;
  onRoutePickerCancel?: () => void;
  cleanupRoutes?: CampaignCleanupRoute[];
  newContribution?: { lat: number; lng: number; value: number; photoUrl?: string; isGroupEvent?: boolean; key: number } | null;
  newReport?: { id: string; lat: number; lng: number; severity: string; photoUrl?: string; key: number } | null;
  userLocation?: { latitude: number; longitude: number } | null;
  focusCoords?: { latitude: number; longitude: number } | null;
  activeStyle?: StyleId;
  problemReports?: ProblemReports | null;
  onReportClick?: (report: ProblemReportMapData) => void;
  eventCentroids?: Record<string, { lat: number; lng: number }>;
  eventGeoUnitIds?: Record<string, string[]>;
  partnerBusinesses?: MapBusiness[];
  cleanupEvents?: MapCleanupEvent[];
  onMobileStatsClick?: () => void;
  onUserLocationChange?: (coords: { latitude: number; longitude: number } | null) => void;
  onUserLocationError?: (code: number) => void;
  onGeolocateTrigger?: (trigger: () => boolean) => void;
  nycNeighborhoodsVisible?: boolean;
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

function applyEventAreaHighlights(
  map: maplibregl.Map,
  events: CampaignEvent[],
  eventGeoUnitIds: Record<string, string[]>,
): void {
  for (const event of events) {
    const ids = eventGeoUnitIds[event.id] ?? (event.geo_unit_id ? [event.geo_unit_id] : []);
    for (const id of ids) {
      map.setFeatureState(
        { source: "territory", sourceLayer: "territories", id },
        { event_highlight: true },
      );
    }
  }
}

// ─── Photo marker helper (module-level to avoid stale closure) ───────────────

function addPhotoMarker(
  m: maplibregl.Map,
  loc: { latitude: number; longitude: number; photo_url: string | null; submitted_at?: string | null },
  onSelect: (url: string) => void,
  size = 48,
): maplibregl.Marker {
  const el = document.createElement("div");
  el.style.cssText =
    `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,0.7);` +
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

const GROUP_PALETTE = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6"];

type ContribRow = {
  value: number | null;
  submitted_at: string | null;
  group_id: string | null;
  user_id: string | null;
  cleanup_id: string | null;
  profiles: { display_name: string | null; username: string } | null;
  groups: { name: string } | null;
  cleanups: { metrics_small_bags: number | null; metrics_large_bags: number | null } | null;
};

function TerritoryPanel({
  geoUnitId,
  displayName,
  unitLabel,
  claim,
  claimLabel,
  reportCount,
  reportThreshold,
  reportPhotos,
  onClose,
  onPhotoSelect,
}: {
  geoUnitId: string;
  displayName: string;
  unitLabel: string;
  claim: TerritoryClaim | null;
  claimLabel: ClaimLabel | null;
  reportCount: number;
  reportThreshold: number | null;
  reportPhotos: string[];
  onClose: () => void;
  onPhotoSelect: (url: string) => void;
}) {
  const [contribs, setContribs] = useState<ContribRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleanupPhotos, setCleanupPhotos] = useState<string[]>([]);
  const [showPointsInfo, setShowPointsInfo] = useState(false);
  const [bagTotals, setBagTotals] = useState({ small: 0, large: 0 });

  useEffect(() => {
    const supabase = createClient();
    (supabase
      .from("contributions")
      .select("value, submitted_at, group_id, user_id, cleanup_id, groups(name), cleanups!cleanup_id(metrics_small_bags, metrics_large_bags)")
      .eq("geo_unit_id", geoUnitId)
      .order("submitted_at", { ascending: false })
      .limit(20) as unknown as Promise<{ data: Omit<ContribRow, "profiles">[] | null }>)
      .then(async ({ data }) => {
        const rows = data ?? [];
        const userIds = [...new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id))];
        const profilesById = new Map<string, { display_name: string | null; username: string }>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .schema("public")
            .from("profiles")
            .select("id, display_name, username")
            .in("id", userIds);
          for (const p of profiles ?? []) profilesById.set(p.id, p);
        }
        setContribs(rows.map((r) => ({ ...r, profiles: r.user_id ? profilesById.get(r.user_id) ?? null : null })));
        setLoading(false);
      });

    supabase
      .from("cleanups")
      .select("image_urls")
      .eq("geo_unit_id", geoUnitId)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        const urls = (data ?? []).flatMap((c: { image_urls: string[] | null }) => c.image_urls ?? []);
        setCleanupPhotos(urls);
      });

    supabase
      .from("cleanups")
      .select("metrics_small_bags, metrics_large_bags")
      .eq("geo_unit_id", geoUnitId)
      .then(({ data }) => {
        const totals = (data ?? []).reduce(
          (acc, c: { metrics_small_bags: number | null; metrics_large_bags: number | null }) => {
            acc.small += c.metrics_small_bags ?? 0;
            acc.large += c.metrics_large_bags ?? 0;
            return acc;
          },
          { small: 0, large: 0 },
        );
        setBagTotals(totals);
      });
  }, [geoUnitId]);

  const holdingGroupId = claim?.claimed_by_group ?? null;

  const groupBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; points: number }>();
    for (const c of contribs) {
      if (!c.group_id) continue;
      const name = c.groups?.name ?? "Unknown";
      const points = c.value ?? 1;
      const existing = map.get(c.group_id);
      if (existing) existing.points += points;
      else map.set(c.group_id, { name, points });
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.points - a.points);
  }, [contribs]);

  const groupColors = useMemo(() => {
    const colors: Record<string, string> = {};
    let idx = 1;
    for (const g of groupBreakdown) {
      if (g.id === holdingGroupId) colors[g.id] = GROUP_PALETTE[0];
      else { colors[g.id] = GROUP_PALETTE[idx % GROUP_PALETTE.length]; idx++; }
    }
    return colors;
  }, [groupBreakdown, holdingGroupId]);

  const totalPoints = claim?.total_value ?? 0;
  const totalBagCount = bagTotals.small + bagTotals.large;
  const isContested = groupBreakdown.length > 1;
  const isClaimed = !!(claim?.claimed_by_group || claim?.claimed_by_user);
  const maxGroupPoints = groupBreakdown[0]?.points ?? 1;
  const isGroup = claimLabel?.isGroup ?? false;

  const accentHex = isClaimed
    ? (holdingGroupId ? (groupColors[holdingGroupId] ?? GROUP_PALETTE[0]) : "#3b82f6")
    : "#3f3f46";

  return (
    <>
    <div className="absolute top-auto bottom-28 sm:top-[200px] sm:bottom-auto right-2 left-2 sm:left-auto z-20 sm:w-64 overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/95 shadow-2xl backdrop-blur-sm">
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accentHex }} />

      {/* Header */}
      <div className="border-b border-zinc-800 pb-2.5 pl-4 pr-3 pt-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">Territory</p>
            <p className="text-xl font-black leading-none tracking-tight text-zinc-100">{unitLabel} {displayName}</p>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {isClaimed && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${isContested
                ? "bg-amber-950/80 text-amber-400 border border-amber-800/60"
                : "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                }`}>
                {isContested ? "Contested" : "Claimed"}
              </span>
            )}
            <button onClick={onClose} className="text-xl leading-none text-zinc-600 hover:text-zinc-300">×</button>
          </div>
        </div>

        <div className="mt-2.5">
          {claimLabel ? (
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{isGroup ? "👥" : "👤"}</span>
              {isGroup && claimLabel.groupSlug ? (
                <Link
                  href={`/groups/${claimLabel.groupSlug}`}
                  className="truncate text-sm font-semibold hover:underline"
                  style={{ color: accentHex }}
                >
                  {claimLabel.name}
                </Link>
              ) : (
                <span className="truncate text-sm font-semibold" style={{ color: accentHex }}>
                  {claimLabel.name}
                </span>
              )}
              <span className="ml-auto text-[10px] text-zinc-600 shrink-0">holds</span>
            </div>
          ) : (
            <span className="text-sm text-zinc-600">Unclaimed</span>
          )}
          {isClaimed && (
            <>
              <p className="mt-0.5 text-xs text-zinc-500 flex items-center gap-1">
                {totalPoints} point{totalPoints !== 1 ? "s" : ""} total in {unitLabel}
                <button
                  onClick={() => setShowPointsInfo(true)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-base text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 leading-none"
                  aria-label="What are points?"
                  title="What are points?"
                >
                  ⓘ
                </button>
              </p>
              {totalBagCount > 0 && (
                <p className="text-[11px] text-zinc-600">
                  {totalBagCount} bag{totalBagCount !== 1 ? "s" : ""} picked up
                  {bagTotals.small > 0 && bagTotals.large > 0 && (
                    <span> ({bagTotals.small} small, {bagTotals.large} large)</span>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="overflow-y-auto max-h-80">
        {/* Group battle bars */}
        {isContested && (
          <div className="border-b border-zinc-800 px-4 py-3">
            <p className="mb-2.5 text-[10px] font-medium uppercase tracking-widest text-zinc-600">Group Battle</p>
            <div className="space-y-2.5">
              {groupBreakdown.map((g) => {
                const color = groupColors[g.id] ?? "#71717a";
                const isHolder = g.id === holdingGroupId;
                const pct = (g.points / maxGroupPoints) * 100;
                return (
                  <div key={g.id}>
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-start gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: color }} />
                        <span className={`text-xs break-words ${isHolder ? "font-semibold" : "text-zinc-400"}`}
                          style={isHolder ? { color } : {}}>
                          {g.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {isHolder && <span className="text-[10px] text-zinc-500 leading-none">holds</span>}
                        <span className="text-xs font-mono tabular-nums text-zinc-300">{g.points}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Hotspot progress */}
        {reportThreshold !== null && (
          <div className="px-4 py-3 border-t border-zinc-800">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-zinc-600">Hotspot Status</p>
            {reportCount === 0 ? (
              <p className="text-xs text-zinc-500">No reports yet</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-orange-400">⚠️ {reportCount} open report{reportCount !== 1 ? "s" : ""}</span>
                  <span className="text-xs text-zinc-600 tabular-nums">{reportCount} / {reportThreshold}</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-orange-500"
                    style={{ width: `${Math.min((reportCount / reportThreshold) * 100, 100)}%` }}
                  />
                </div>
                {reportCount >= reportThreshold && (
                  <p className="mt-1.5 text-[10px] text-red-400 font-semibold">Threshold reached — hotspot active!</p>
                )}
                {reportPhotos.length > 0 && (
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    {reportPhotos.slice(0, 4).map((url, i) => (
                      <button
                        key={i}
                        onClick={() => onPhotoSelect(url)}
                        className="w-11 h-11 rounded overflow-hidden border border-zinc-700 flex-shrink-0 hover:border-orange-500 transition-colors"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Report photo" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Cleanup photos */}
        {cleanupPhotos.length > 0 && (
          <div className="px-4 py-3 border-t border-zinc-800">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-zinc-600">Cleanup Photos</p>
            <div className="flex gap-1.5 flex-wrap">
              {cleanupPhotos.slice(0, 4).map((url, i) => (
                <button
                  key={i}
                  onClick={() => onPhotoSelect(url)}
                  className="w-11 h-11 rounded overflow-hidden border border-zinc-700 flex-shrink-0 hover:border-emerald-500 transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Cleanup photo" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent activity */}
        <div className="px-4 py-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-zinc-600">Recent Activity</p>
          {loading ? (
            <p className="text-xs text-zinc-700">Loading…</p>
          ) : contribs.length === 0 ? (
            <p className="text-xs text-zinc-700">No cleanups logged yet</p>
          ) : (
            <div className="space-y-1.5">
              {contribs.slice(0, 7).map((c, i) => {
                const name = c.profiles?.display_name ?? c.profiles?.username ?? "Anonymous";
                const groupName = c.groups?.name;
                const dotColor = c.group_id ? (groupColors[c.group_id] ?? "#71717a") : null;
                const small = c.cleanups?.metrics_small_bags ?? 0;
                const large = c.cleanups?.metrics_large_bags ?? 0;
                const hasBagSplit = small > 0 || large > 0;
                return (
                  <div key={i} className="min-w-0">
                    <div className="flex items-center gap-2">
                      {dotColor
                        ? <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                        : <div className="w-1.5 h-1.5 shrink-0" />}
                      <span className="text-xs text-zinc-300 truncate flex-1 min-w-0">{name}</span>
                      <span className="text-xs text-zinc-400 shrink-0 tabular-nums">{c.value ?? 1} pts</span>
                      <span className="text-xs text-zinc-600 shrink-0">
                        {c.submitted_at
                          ? new Date(c.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : ""}
                      </span>
                    </div>
                    {(groupName || hasBagSplit) && (
                      <p className="pl-3.5 text-[10px] text-zinc-600 leading-tight mt-0.5">
                        {groupName}
                        {groupName && hasBagSplit ? " · " : ""}
                        {hasBagSplit && `${small} small, ${large} large`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
    {showPointsInfo && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
        onClick={() => setShowPointsInfo(false)}
      >
        <div
          className="max-w-xs rounded-xl border border-zinc-700/70 bg-zinc-900 p-4 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-2">
            <p className="text-sm font-semibold text-zinc-100">What are points?</p>
            <button onClick={() => setShowPointsInfo(false)} className="text-lg leading-none text-zinc-600 hover:text-zinc-300">×</button>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            The ranking total is measured in points, not a literal bag count. Small bags are worth 1 point,
            large bags are worth 3 points, and pound-based cleanups convert at 0.5 points per pound. The
            &quot;bags picked up&quot; line below it is the actual physical bag count (small + large), the
            real-world impact this campaign is about, so the two numbers won&apos;t always match.
          </p>
        </div>
      </div>
    )}
    </>
  );
}

// ─── State detail panel (choropleth campaigns) ────────────────────────────────

function StatePanel({
  geoUnitId,
  displayName,
  totalActions,
  onClose,
}: {
  geoUnitId: string;
  displayName: string;
  totalActions: number;
  onClose: () => void;
}) {
  const lean = US_STATE_LEAN[displayName] ?? 0;
  const progress = Math.min(totalActions / CHOROPLETH_THRESHOLD, 1);
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
          <span className="text-xs text-zinc-500">Actions</span>
          <span className="text-sm font-bold text-zinc-200 tabular-nums">
            {totalActions.toLocaleString()} / {CHOROPLETH_THRESHOLD.toLocaleString()}
          </span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress * 100}%`, background: accentColor }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          {progress >= 1 ? "Fully neutralized ✓" : `${Math.round((1 - progress) * CHOROPLETH_THRESHOLD - totalActions + 1)} more to neutralize`}
        </p>
      </div>
    </div>
  );
}

function makeSolarPanelPattern(): ImageData {
  const size = 16;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    data[o] = 13; data[o + 1] = 20; data[o + 2] = 36; data[o + 3] = 255; // #0d1424
  }
  for (let k = 4; k < size; k += 4) {
    for (let i = 0; i < size; i++) {
      const h = (k * size + i) * 4;
      data[h] = 30; data[h + 1] = 53; data[h + 2] = 88; data[h + 3] = 255; // #1e3558
      const v = (i * size + k) * 4;
      data[v] = 30; data[v + 1] = 53; data[v + 2] = 88; data[v + 3] = 255;
    }
  }
  return new ImageData(data, size, size);
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

// ─── Hex bloom detail panel ───────────────────────────────────────────────────

type HexPhoto = { photo_url: string; display_name: string | null; submitted_at: string | null };

function HexPanel({
  entry,
  campaignId,
  onClose,
  onPhotoSelect,
  refreshKey,
}: {
  entry: HexBloomEntry;
  campaignId: string;
  onClose: () => void;
  onPhotoSelect: (url: string) => void;
  refreshKey: number;
}) {
  const stageFloor = BLOOM_THRESHOLDS[entry.bloom_stage] ?? 0;
  const nextThreshold = BLOOM_THRESHOLDS[entry.bloom_stage + 1] ?? null;
  const stageColor = BLOOM_STAGE_COLORS[entry.bloom_stage];
  const stageLabel = BLOOM_STAGE_LABELS[entry.bloom_stage];
  const [photos, setPhotos] = useState<HexPhoto[]>([]);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_FASTAPI_URL;
    fetch(`${base}/api/contributions/${campaignId}/hex/${entry.h3_index}/photos`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setPhotos)
      .catch(() => { });
  }, [campaignId, entry.h3_index, refreshKey]);

  return (
    <div className="absolute top-auto bottom-28 sm:top-[200px] sm:bottom-auto right-2 left-2 sm:left-auto z-20 sm:w-64 overflow-hidden rounded-xl border border-zinc-700/70 bg-zinc-900/95 shadow-2xl backdrop-blur-sm">
      <div className="absolute inset-y-0 left-0 w-[2px]" style={{ background: stageColor }} />
      <div className="border-b border-zinc-800 pb-2.5 pl-4 pr-3 pt-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">H3 Hex · Stage {entry.bloom_stage}</p>
            <p className="text-base font-bold text-zinc-100 leading-tight" style={{ color: stageColor }}>{stageLabel}</p>
          </div>
          <button onClick={onClose} className="ml-2 mt-0.5 text-xl leading-none text-zinc-600 hover:text-zinc-300">×</button>
        </div>
      </div>
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs text-zinc-500">Bloom Score</span>
          <span className="text-sm font-bold text-zinc-200 tabular-nums">
            {Math.round(entry.bloom_score).toLocaleString()}
            {nextThreshold !== null ? ` / ${nextThreshold.toLocaleString()}` : " ✓ Max"}
          </span>
        </div>
        {nextThreshold !== null && (
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(((entry.bloom_score - stageFloor) / (nextThreshold - stageFloor)) * 100, 100)}%`,
                background: stageColor,
              }}
            />
          </div>
        )}
        {entry.seed_source && (
          <p className="mt-3 text-xs text-zinc-500">🌍 {entry.seed_source}</p>
        )}
        {photos.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 mb-1.5">
              Photos ({photos.length})
            </p>
            <div className="grid grid-cols-3 gap-1 max-h-56 overflow-y-auto">
              {photos.map((p, i) => (
                <div
                  key={i}
                  className="aspect-square overflow-hidden rounded-md bg-zinc-800 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => onPhotoSelect(p.photo_url)}
                >
                  <img
                    src={p.photo_url}
                    alt={p.display_name ?? "contribution"}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 text-[10px] text-zinc-700 font-mono break-all">{entry.h3_index}</p>
      </div>
    </div>
  );
}

// ─── Fit-to-extent control ────────────────────────────────────────────────────

class FitExtentControl implements maplibregl.IControl {
  private _map: maplibregl.Map | null = null;
  private _container: HTMLDivElement | null = null;
  private readonly _getBounds: () => maplibregl.LngLatBoundsLike | null;

  constructor(getBounds: () => maplibregl.LngLatBoundsLike | null) {
    this._getBounds = getBounds;
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this._map = map;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Zoom to data extent";
    btn.style.cssText =
      "width:29px;height:29px;display:flex;align-items:center;justify-content:center;" +
      "background:none;border:none;cursor:pointer;padding:0;color:#333";
    btn.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>` +
      `</svg>`;
    btn.onclick = () => {
      const bounds = this._getBounds();
      if (bounds && this._map) {
        this._map.fitBounds(bounds as maplibregl.LngLatBoundsLike, {
          padding: 60,
          maxZoom: 12,
          duration: 800,
        });
      }
    };
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    container.appendChild(btn);
    this._container = container;
    return container;
  }

  onRemove(): void {
    this._container?.parentNode?.removeChild(this._container);
    this._map = null;
  }
}

// Simplified inline SVG flags (16x11) for the zoom-to-region buttons below.
// Flag *emoji* render as bare letters ("US"/"GB") or nothing on Windows —
// Segoe UI Emoji doesn't ship colored flag glyphs — so an emoji icon isn't
// reliable there. Drawing the flags as SVG sidesteps OS/browser font support
// entirely.
const US_FLAG_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="11" viewBox="0 0 16 11">` +
  `<rect width="16" height="11" fill="#B22234"/>` +
  `<g fill="#fff"><rect y="0.85" width="16" height="0.85"/><rect y="2.55" width="16" height="0.85"/>` +
  `<rect y="4.25" width="16" height="0.85"/><rect y="5.95" width="16" height="0.85"/>` +
  `<rect y="7.65" width="16" height="0.85"/><rect y="9.35" width="16" height="0.85"/></g>` +
  `<rect width="6.4" height="5.95" fill="#3C3B6E"/>` +
  `</svg>`;
const UK_FLAG_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="11" viewBox="0 0 16 11">` +
  `<rect width="16" height="11" fill="#00247D"/>` +
  `<path d="M0 0 16 11M16 0 0 11" stroke="#fff" stroke-width="2.2"/>` +
  `<path d="M0 0 16 11M16 0 0 11" stroke="#CF142B" stroke-width="0.9"/>` +
  `<path d="M8 0V11M0 5.5H16" stroke="#fff" stroke-width="3.6"/>` +
  `<path d="M8 0V11M0 5.5H16" stroke="#CF142B" stroke-width="1.6"/>` +
  `</svg>`;

// Zoom-to-region shortcut buttons (flag icon) — one control per region so
// they can each be conditionally added/omitted per campaign type.
class ZoomToRegionControl implements maplibregl.IControl {
  private _map: maplibregl.Map | null = null;
  private _container: HTMLDivElement | null = null;
  private readonly _bounds: maplibregl.LngLatBoundsLike;
  private readonly _flagSvg: string;
  private readonly _label: string;

  constructor(bounds: maplibregl.LngLatBoundsLike, flagSvg: string, label: string) {
    this._bounds = bounds;
    this._flagSvg = flagSvg;
    this._label = label;
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this._map = map;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = this._label;
    btn.style.cssText =
      "width:29px;height:29px;display:flex;align-items:center;justify-content:center;" +
      "background:none;border:none;cursor:pointer;padding:0";
    btn.innerHTML = this._flagSvg;
    btn.onclick = () => {
      this._map?.fitBounds(this._bounds, { padding: 40, duration: 800 });
    };
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    container.appendChild(btn);
    this._container = container;
    return container;
  }

  onRemove(): void {
    this._container?.parentNode?.removeChild(this._container);
    this._map = null;
  }
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
  pinPickerLabel,
  onPinPlaced,
  onPinCancelled,
  areaPickerActive = false,
  areaPickerUnitType = null,
  onAreaPickerChange,
  onAreaPickerConfirm,
  onAreaPickerCancel,
  routePickerActive = false,
  onRoutePickerChange,
  onRoutePickerFinish,
  onRoutePickerCancel,
  cleanupRoutes,
  newContribution,
  newReport,
  userLocation,
  focusCoords,
  activeStyle = "outdoor",
  problemReports,
  onReportClick,
  eventCentroids,
  eventGeoUnitIds,
  partnerBusinesses,
  cleanupEvents,
  onMobileStatsClick,
  onUserLocationChange,
  onUserLocationError,
  onGeolocateTrigger,
  nycNeighborhoodsVisible = false,
}: Props) {
  const isCollage = campaignType === "collage";
  const isChoropleth = campaignType === "choropleth";
  const isHeatmap = campaignType === "heatmap";
  const isHexBloom = campaignType === "hex_bloom";
  const pinPickerUnitLabel = campaign.geo_unit?.includes("uk_postcode_district") ? "Postcode" : "ZIP";

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [tilesLoading, setTilesLoading] = useState(true);
  const [selectedZip, setSelectedZip] = useState<SelectedZip | null>(null);
  const [geoSearch, setGeoSearch] = useState("");
  const [geoSearchError, setGeoSearchError] = useState<string | null>(null);
  const geoSearchErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedHex, setSelectedHex] = useState<HexBloomEntry | null>(null);
  const [hexPhotoVersion, setHexPhotoVersion] = useState(0);
  const [outOfZoneWarning, setOutOfZoneWarning] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<MapBusiness | null>(null);
  const [selectedCleanupEvent, setSelectedCleanupEvent] = useState<MapCleanupEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CampaignEvent | null>(null);
  const [liveReports, setLiveReports] = useState<ProblemReports | null>(problemReports ?? null);
  const [liveClaims, setLiveClaims] = useState<Record<string, TerritoryClaim>>({});
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const photoMarkersRef = useRef<maplibregl.Marker[]>([]);

  const claimsRef = useRef(claims);
  const activeEventsRef = useRef(activeEvents);
  const claimLabelsRef = useRef(claimLabels);
  const problemReportsRef = useRef(problemReports);
  const onReportClickRef = useRef(onReportClick);
  const eventCentroidsRef = useRef(eventCentroids ?? {});
  const eventGeoUnitIdsRef = useRef(eventGeoUnitIds ?? {});
  const contributionFeaturesRef = useRef<Feature<Point>[]>([]);
  const eventMarkersRef = useRef<maplibregl.Marker[]>([]);
  const eventTweensRef = useRef<gsap.core.Tween[]>([]);
  const eventMarkerScaleElsRef = useRef<HTMLDivElement[]>([]);
  const eventMarkerZoomListenerRef = useRef(false);
  const partnerBusinessesRef = useRef(partnerBusinesses ?? []);
  const businessMarkersRef = useRef<maplibregl.Marker[]>([]);
  const cleanupEventsRef = useRef(cleanupEvents ?? []);
  const cleanupEventMarkersRef = useRef<maplibregl.Marker[]>([]);
  const cleanupEventDateLabelsRef = useRef<maplibregl.Marker[]>([]);
  const cleanupRouteMarkersRef = useRef<maplibregl.Marker[]>([]);
  const cleanupRouteDateLabelsRef = useRef<maplibregl.Marker[]>([]);
  const routePopupRef = useRef<maplibregl.Popup | null>(null);
  const setSelectedZipRef = useRef(setSelectedZip);
  const hoverDivRef = useRef<HTMLDivElement | null>(null);
  const pinPickerMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const geolocateControlRef = useRef<maplibregl.GeolocateControl | null>(null);
  const onUserLocationChangeRef = useRef(onUserLocationChange);
  const onUserLocationErrorRef = useRef(onUserLocationError);
  const pinPickerActiveRef = useRef(pinPickerActive);
  const pinPickerConstrainedRef = useRef(pinPickerConstrained);
  const areaPickerActiveRef = useRef(areaPickerActive);
  const areaPickerUnitTypeRef = useRef(areaPickerUnitType);
  const onAreaPickerChangeRef = useRef(onAreaPickerChange);
  const pickedAreasRef = useRef<Map<string, SelectedArea>>(new Map());
  const [areaPickerCount, setAreaPickerCount] = useState(0);
  const routePickerActiveRef = useRef(routePickerActive);
  const onRoutePickerChangeRef = useRef(onRoutePickerChange);
  const routeVerticesRef = useRef<[number, number][]>([]);
  const [routePickerVertexCount, setRoutePickerVertexCount] = useState(0);
  const [routePickerJustClosedLoop, setRoutePickerJustClosedLoop] = useState(false);
  const cleanupRoutesRef = useRef(cleanupRoutes ?? []);
  const outOfZoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapReadyRef = useRef(false);
  const choroplethListenerRef = useRef(false);
  const eventHighlightListenerRef = useRef(false);
  const dataBoundsRef = useRef<maplibregl.LngLatBoundsLike | null>(null);
  const hexDataRef = useRef<HexBloomEntry[]>([]);
  const nycNeighborhoodsVisibleRef = useRef(false);
  const nycAdjacencyRef = useRef<Record<string, string[]> | null>(null);
  const nycColorAssignmentRef = useRef<Record<string, number> | null>(null);

  useEffect(() => { claimsRef.current = claims; }, [claims]);
  useEffect(() => { activeEventsRef.current = activeEvents; }, [activeEvents]);
  useEffect(() => { claimLabelsRef.current = claimLabels; }, [claimLabels]);
  useEffect(() => { eventCentroidsRef.current = eventCentroids ?? {}; }, [eventCentroids]);
  useEffect(() => { eventGeoUnitIdsRef.current = eventGeoUnitIds ?? {}; }, [eventGeoUnitIds]);
  useEffect(() => { partnerBusinessesRef.current = partnerBusinesses ?? []; }, [partnerBusinesses]);
  useEffect(() => { cleanupEventsRef.current = cleanupEvents ?? []; }, [cleanupEvents]);
  useEffect(() => { setSelectedZipRef.current = setSelectedZip; }, [setSelectedZip]);
  useEffect(() => { nycNeighborhoodsVisibleRef.current = nycNeighborhoodsVisible; }, [nycNeighborhoodsVisible]);
  useEffect(() => { pinPickerActiveRef.current = pinPickerActive; }, [pinPickerActive]);
  useEffect(() => {
    routePickerActiveRef.current = routePickerActive;
    if (!routePickerActive) {
      routeVerticesRef.current = [];
      setRoutePickerVertexCount(0);
      setRoutePickerJustClosedLoop(false);
      const src = map.current?.getSource("route-picker") as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: "FeatureCollection", features: [] });
    }
  }, [routePickerActive]);
  useEffect(() => { pinPickerConstrainedRef.current = pinPickerConstrained; }, [pinPickerConstrained]);
  useEffect(() => { areaPickerActiveRef.current = areaPickerActive; }, [areaPickerActive]);
  useEffect(() => { areaPickerUnitTypeRef.current = areaPickerUnitType; }, [areaPickerUnitType]);
  useEffect(() => { onAreaPickerChangeRef.current = onAreaPickerChange; }, [onAreaPickerChange]);
  useEffect(() => { onRoutePickerChangeRef.current = onRoutePickerChange; }, [onRoutePickerChange]);
  useEffect(() => { onReportClickRef.current = onReportClick; }, [onReportClick]);

  const redrawRoutePicker = () => {
    const src = map.current?.getSource("route-picker") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const vertices = routeVerticesRef.current;
    const features: GeoJSON.Feature[] = vertices.map((coord) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: coord },
      properties: {},
    }));
    if (vertices.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: vertices },
        properties: {},
      });
    }
    src.setData({ type: "FeatureCollection", features });
  };

  const handleUndoRouteVertex = () => {
    routeVerticesRef.current = routeVerticesRef.current.slice(0, -1);
    setRoutePickerVertexCount(routeVerticesRef.current.length);
    setRoutePickerJustClosedLoop(false);
    onRoutePickerChangeRef.current?.(routeVerticesRef.current);
    redrawRoutePicker();
  };

  const handleClearRouteVertices = () => {
    routeVerticesRef.current = [];
    setRoutePickerVertexCount(0);
    setRoutePickerJustClosedLoop(false);
    onRoutePickerChangeRef.current?.(routeVerticesRef.current);
    redrawRoutePicker();
  };
  useEffect(() => { onUserLocationChangeRef.current = onUserLocationChange; }, [onUserLocationChange]);
  useEffect(() => { onUserLocationErrorRef.current = onUserLocationError; }, [onUserLocationError]);

  const updateEventMarkers = useCallback((events: CampaignEvent[]) => {
    if (!map.current) return;

    eventTweensRef.current.forEach((t) => t.kill());
    eventTweensRef.current = [];
    eventMarkersRef.current.forEach((m) => m.remove());
    eventMarkersRef.current = [];
    eventMarkerScaleElsRef.current = [];

    for (const event of events) {
      const areaIds = eventGeoUnitIdsRef.current[event.id] ?? (event.geo_unit_id ? [event.geo_unit_id] : []);
      if (areaIds.length === 0) continue;
      const primaryId = areaIds[0];

      // Prefer averaging server-supplied centroids across all selected areas; fall back to
      // computing from viewport features for the primary area if none have a centroid yet.
      let lat: number;
      let lng: number;
      const centroids = areaIds
        .map((id) => eventCentroidsRef.current[id])
        .filter((c): c is { lat: number; lng: number } => !!c);
      if (centroids.length > 0) {
        lat = centroids.reduce((s, c) => s + c.lat, 0) / centroids.length;
        lng = centroids.reduce((s, c) => s + c.lng, 0) / centroids.length;
      } else {
        const features = map.current.querySourceFeatures("territory", {
          sourceLayer: "territories",
          filter: ["==", ["id"], primaryId],
        });
        if (!features.length) continue;
        const geom = features[0].geometry;
        if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") continue;
        const ring = geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0][0];
        lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
        lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
      }

      const isHotspot = event.event_type === "boss_spawn";
      const isTimedEvent = event.event_type === "timed_event";
      const badgeEmoji = isTimedEvent ? "✨" : (isHotspot ? "🔥" : "⚡");
      const imageUrl = event.image_url;

      // MapLibre sets `transform` on the provided element for geo-positioning, and GSAP
      // animates `innerEl`'s transform directly. Zoom-based visual scaling is a third,
      // independent transform concern, so it gets its own wrapper (`scaleWrapper`) to
      // avoid clobbering either of the other two.
      const el = document.createElement("div");
      const size = imageUrl ? 40 : (isHotspot || isTimedEvent ? 32 : 24);
      el.style.cssText = `width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10`;

      const scaleWrapper = document.createElement("div");
      scaleWrapper.style.cssText =
        `width:${size}px;height:${size}px;position:relative;transform-origin:center;` +
        `transform:scale(${getEventMarkerScale(map.current.getZoom())});transition:transform 0.15s ease-out`;
      el.appendChild(scaleWrapper);

      const innerEl = document.createElement("div");
      if (imageUrl) {
        innerEl.style.cssText =
          `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;border:2px solid ${isTimedEvent ? "#f59e0b" : "#ef4444"};` +
          `box-shadow:0 0 8px rgba(${isTimedEvent ? "245,158,11" : "239,68,68"},0.35),0 2px 6px rgba(0,0,0,0.6);transform-origin:center`;
        const img = document.createElement("img");
        img.src = imageUrl;
        img.style.cssText = "width:100%;height:100%;object-fit:cover";
        innerEl.appendChild(img);

        const badge = document.createElement("div");
        badge.style.cssText =
          `position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;border-radius:50%;` +
          `background:${isTimedEvent ? "rgba(120,53,15,0.95)" : "rgba(127,29,29,0.95)"};border:1px solid ${isTimedEvent ? "#f59e0b" : "#ef4444"};display:flex;align-items:center;` +
          "justify-content:center;font-size:11px;pointer-events:none";
        badge.textContent = badgeEmoji;
        scaleWrapper.appendChild(innerEl);
        scaleWrapper.appendChild(badge);
      } else if (isTimedEvent) {
        innerEl.style.cssText =
          "display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:rgba(120,53,15,0.92);border:1.5px solid #f59e0b;font-size:17px;box-shadow:0 0 8px rgba(245,158,11,0.35),0 2px 6px rgba(0,0,0,0.6);transform-origin:center";
        innerEl.textContent = badgeEmoji;
      } else {
        innerEl.style.cssText = isHotspot
          ? "display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:rgba(127,29,29,0.92);border:1.5px solid #ef4444;font-size:17px;box-shadow:0 0 8px rgba(239,68,68,0.3),0 2px 6px rgba(0,0,0,0.6);transform-origin:center"
          : "display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(120,27,27,0.88);border:1px solid #f87171;font-size:12px;box-shadow:0 0 5px rgba(239,68,68,0.2),0 2px 4px rgba(0,0,0,0.5);transform-origin:center";
        innerEl.textContent = badgeEmoji;
      }
      innerEl.title = event.title;
      if (!imageUrl) scaleWrapper.appendChild(innerEl);
      eventMarkerScaleElsRef.current.push(scaleWrapper);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      el.onclick = () => {
        setSelectedEvent(event);
        if (!map.current) return;
        if (areaIds.length <= 1) {
          map.current.flyTo({ center: [lng, lat], zoom: 13, duration: 800 });
          return;
        }
        const bounds = new maplibregl.LngLatBounds();
        let found = false;
        for (const id of areaIds) {
          const features = map.current.querySourceFeatures("territory", {
            sourceLayer: "territories",
            filter: ["==", ["id"], id],
          });
          for (const f of features) {
            const geom = f.geometry;
            if (geom.type === "Polygon") {
              for (const c of geom.coordinates[0]) { bounds.extend(c as [number, number]); found = true; }
            } else if (geom.type === "MultiPolygon") {
              for (const poly of geom.coordinates) for (const c of poly[0]) { bounds.extend(c as [number, number]); found = true; }
            }
          }
        }
        if (found) {
          map.current.fitBounds(bounds, { padding: 60, duration: 800, maxZoom: 14 });
        } else {
          map.current.flyTo({ center: [lng, lat], zoom: 13, duration: 800 });
        }
      };

      eventMarkersRef.current.push(marker);

      const entranceTween = gsap.from(innerEl, { scale: 0, duration: 0.4, ease: "back.out(1.4)" });
      const pulseTween = gsap.to(innerEl, { scale: 1.08, duration: 1.6, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 0.4 });
      eventTweensRef.current.push(entranceTween, pulseTween);
    }
  }, []);

  const updateBusinessMarkers = useCallback((businesses: MapBusiness[]) => {
    if (!map.current) return;

    businessMarkersRef.current.forEach((m) => m.remove());
    businessMarkersRef.current = [];

    for (const business of businesses) {
      const hasOffer = !!business.activeOfferTitle;
      const el = document.createElement("div");
      const size = hasOffer ? 24 : 20;
      el.style.cssText = hasOffer
        ? `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;cursor:pointer;z-index:6;` +
        "border:2px solid #fbbf24;box-shadow:0 0 8px rgba(251,191,36,0.7),0 1px 4px rgba(0,0,0,0.6);" +
        "display:flex;align-items:center;justify-content:center;background:rgba(120,53,15,0.9)"
        : `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;cursor:pointer;z-index:5;` +
        "border:1.5px solid #22c55e;box-shadow:0 0 4px rgba(34,197,94,0.35),0 1px 4px rgba(0,0,0,0.6);" +
        "display:flex;align-items:center;justify-content:center;background:rgba(20,83,45,0.9)";

      if (business.logo_url) {
        const img = document.createElement("img");
        img.src = business.logo_url;
        img.style.cssText = "width:100%;height:100%;object-fit:cover";
        el.appendChild(img);
      } else {
        el.textContent = hasOffer ? "🎁" : "🏪";
        el.style.fontSize = hasOffer ? "12px" : "10px";
      }
      el.title = hasOffer ? `${business.name} — ${business.activeOfferTitle}` : business.name;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([business.lng, business.lat])
        .addTo(map.current!);

      el.onclick = () => setSelectedBusiness(business);

      businessMarkersRef.current.push(marker);
    }
  }, []);

  const updateCleanupEventMarkers = useCallback((events: MapCleanupEvent[], routes: CampaignCleanupRoute[]) => {
    if (!map.current) return;

    cleanupEventMarkersRef.current.forEach((m) => m.remove());
    cleanupEventMarkersRef.current = [];
    cleanupEventDateLabelsRef.current.forEach((m) => m.remove());
    cleanupEventDateLabelsRef.current = [];

    // Events with a route are already rendered by updateCleanupRouteMarkers (at the
    // route's midpoint) — drawing a second point marker here at the event's own lat/lng
    // produced two markers (and two radius circles) for what is really one event.
    const routeEventIds = new Set(routes.map((r) => r.id));
    const pointOnlyEvents = events.filter((event) => !routeEventIds.has(event.id));

    for (const event of pointOnlyEvents) {
      const size = 24;
      const cohostGroups = event.cohost_groups ?? [];
      const hosts = [{ logo_url: event.group_logo_url }, ...cohostGroups.map((g) => ({ logo_url: g.group_logo_url }))];
      const wrapper = createHostLogoStack(hosts, size, !!event.is_past);

      const cohostNames = cohostGroups.map((g) => g.group_name).join(", ");
      const hostLabel = cohostNames ? `${event.group_name} + ${cohostNames}` : event.group_name;
      wrapper.title = event.is_past ? `${event.title} — ${hostLabel} (ended)` : `${event.title} — ${hostLabel}`;

      const marker = new maplibregl.Marker({ element: wrapper })
        .setLngLat([event.lng, event.lat])
        .addTo(map.current!);

      wrapper.onclick = () => setSelectedCleanupEvent(event);

      cleanupEventMarkersRef.current.push(marker);

      if (!event.is_past) {
        const dateText = formatEventDateTime(event.scheduled_start);
        if (dateText) {
          cleanupEventDateLabelsRef.current.push(
            createDateTimeLabelMarker(map.current!, [event.lng, event.lat], dateText, size / 2 + 4),
          );
        }
      }
    }

    const radiusSource = map.current.getSource("cleanup-event-radius") as maplibregl.GeoJSONSource | undefined;
    if (radiusSource) {
      radiusSource.setData({
        type: "FeatureCollection",
        features: pointOnlyEvents.map((event) => ({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [circlePolygon(event.lat, event.lng, CLEANUP_EVENT_RADIUS_METERS)],
          },
          properties: {},
        })),
      });
    }
  }, []);

  // Re-render cleanup event markers whenever the parent's cleanupEvents prop changes
  // (e.g. router.refresh() after hosting a new event) — the initial draw only happens
  // once on map/style load, so without this a newly created event never appears until
  // a full page reload.
  useEffect(() => {
    updateCleanupEventMarkers(cleanupEvents ?? [], cleanupRoutes ?? []);
  }, [cleanupEvents, cleanupRoutes, updateCleanupEventMarkers]);

  const updateReportMarkers = useCallback((reports: ProblemReportMapData[]) => {
    if (!map.current) return;

    const pointsSource = map.current.getSource("report-points") as maplibregl.GeoJSONSource | undefined;
    if (pointsSource) {
      pointsSource.setData({
        type: "FeatureCollection",
        features: reports.map((report) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [report.longitude, report.latitude] },
          properties: {
            id: report.id,
            severity: report.severity,
            reported_at: report.reported_at,
            photo_url: report.photo_url,
            status: report.status,
            claimed_by_user_id: report.claimed_by_user_id,
            claim_before_deadline_at: report.claim_before_deadline_at,
            claim_after_deadline_at: report.claim_after_deadline_at,
            flag_count: report.flag_count,
            unit_type: report.unit_type,
          },
        })),
      });
    }

    const radiusSource = map.current.getSource("report-radius") as maplibregl.GeoJSONSource | undefined;
    if (radiusSource) {
      radiusSource.setData({
        type: "FeatureCollection",
        features: reports.map((report) => ({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              circlePolygon(
                report.latitude,
                report.longitude,
                report.unit_type === "uk_postcode_district" ? REPORT_CLAIM_RADIUS_METERS_UK : REPORT_CLAIM_RADIUS_METERS_US,
              ),
            ],
          },
          properties: { severity: report.severity, status: report.status },
        })),
      });
    }
  }, []);

  // Re-render report markers whenever the parent's problemReports prop changes (e.g. a
  // hotspot resolved via cleanup submission) — the Supabase Realtime subscription below
  // only fires on INSERT, so UPDATEs (resolutions) need this to repaint without a reload.
  useEffect(() => {
    problemReportsRef.current = problemReports;
    updateReportMarkers(problemReports?.reports ?? []);
  }, [problemReports, updateReportMarkers]);

  const updateCleanupRoutesLayer = useCallback(
    (routes: CampaignCleanupRoute[], events: MapCleanupEvent[]) => {
      if (!map.current) return;
      const src = map.current.getSource("cleanup-routes") as maplibregl.GeoJSONSource | undefined;
      const bufferSrc = map.current.getSource("cleanup-routes-buffer") as maplibregl.GeoJSONSource | undefined;
      if (!src || !bufferSrc) return;
      const eventById = new Map(events.map((e) => [e.id, e]));
      src.setData({
        type: "FeatureCollection",
        features: routes.map((r) => ({
          type: "Feature",
          geometry: r.route,
          properties: {
            id: r.id,
            is_event: eventById.has(r.id),
            is_past: eventById.get(r.id)?.is_past ?? false,
          },
        })),
      });
      // Server-computed geodesic buffer (ST_Buffer) around event-linked routes only,
      // mirroring the point event's CLEANUP_EVENT_RADIUS_METERS circle — a true offset
      // corridor rather than a fake line-width-based "zone" that broke on turns/loops.
      bufferSrc.setData({
        type: "FeatureCollection",
        features: routes
          .filter((r) => r.buffer)
          .map((r) => ({ type: "Feature", geometry: r.buffer!, properties: { id: r.id } })),
      });
    },
    [],
  );

  useEffect(() => {
    cleanupRoutesRef.current = cleanupRoutes ?? [];
    updateCleanupRoutesLayer(cleanupRoutesRef.current, cleanupEvents ?? []);
  }, [cleanupRoutes, cleanupEvents, updateCleanupRoutesLayer]);

  // Lightweight popup for an individual/group (non-event) route marker click — a point-based
  // cleanup gets a hover tooltip, not a full page, so a route gets the equivalent: a small
  // popup card instead of navigating away to /routes/{id}.
  const showRouteTooltip = useCallback((routeId: string, at: [number, number]) => {
    if (!map.current) return;
    routePopupRef.current?.remove();

    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "240px" })
      .setLngLat(at)
      .setHTML('<div style="font-size:12px;color:#a1a1aa;padding:2px;">Loading route…</div>')
      .addTo(map.current);
    routePopupRef.current = popup;

    getCleanupRoute(routeId)
      .then((detail) => {
        if (routePopupRef.current !== popup) return;
        const bags = (detail.metrics_small_bags ?? 0) + (detail.metrics_large_bags ?? 0);
        const submitter = detail.submitted_by.display_name ?? detail.submitted_by.username ?? "Someone";
        const photo = detail.image_urls[0];
        const html = `
          <div style="font-family:inherit;min-width:180px;">
            ${photo ? `<img src="${photo}" style="width:100%;height:96px;object-fit:cover;border-radius:6px;margin-bottom:6px;" />` : ""}
            <div style="font-size:13px;font-weight:600;color:#e4e4e7;">${submitter}'s cleanup route</div>
            ${detail.geo_unit_display_name ? `<div style="font-size:11px;color:#71717a;">${detail.geo_unit_display_name}</div>` : ""}
            ${bags > 0 ? `<div style="font-size:12px;color:#34d399;margin-top:4px;">🗑️ ${bags} bags</div>` : ""}
            <a href="/routes/${routeId}" style="display:inline-block;margin-top:6px;font-size:11px;color:#38bdf8;text-decoration:underline;">View full route ↗</a>
          </div>
        `;
        popup.setHTML(html);
      })
      .catch(() => {
        if (routePopupRef.current === popup) {
          popup.setHTML('<div style="font-size:12px;color:#f87171;padding:2px;">Couldn\'t load this route.</div>');
        }
      });
  }, []);

  // Midpoint marker per drawn route — a pre-planned group-event route reuses the
  // existing event detail modal (its id matches a cleanupEvents entry); an individual/group
  // route instead shows a lightweight popup (not a full page navigation), matching a
  // point-based cleanup's hover-tooltip convention.
  const updateCleanupRouteMarkers = useCallback(
    (routes: CampaignCleanupRoute[], events: MapCleanupEvent[]) => {
      if (!map.current) return;

      cleanupRouteMarkersRef.current.forEach((m) => m.remove());
      cleanupRouteMarkersRef.current = [];
      cleanupRouteDateLabelsRef.current.forEach((m) => m.remove());
      cleanupRouteDateLabelsRef.current = [];

      const eventById = new Map(events.map((e) => [e.id, e]));

      for (const r of routes) {
        const coords = r.route.coordinates;
        if (!coords || coords.length === 0) continue;
        const mid = coords[Math.floor(coords.length / 2)];
        const event = eventById.get(r.id);

        const wrapper = document.createElement("div");
        wrapper.style.cssText = "display:inline-flex;align-items:center;cursor:pointer;";

        const el = document.createElement("div");
        const size = 20;
        const isPast = event?.is_past ?? false;
        el.style.cssText =
          `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;position:relative;z-index:${isPast ? 5 : 6};` +
          "display:flex;align-items:center;justify-content:center;" +
          (isPast
            ? "border:2px solid #71717a;box-shadow:0 1px 4px rgba(0,0,0,0.6);opacity:0.5;filter:grayscale(60%);background:rgba(63,63,70,0.9)"
            : event
              ? "border:2px solid #38bdf8;box-shadow:0 0 8px rgba(56,189,248,0.7),0 1px 4px rgba(0,0,0,0.6);background:rgba(12,74,110,0.9)"
              : "border:2px solid #f59e0b;box-shadow:0 0 6px rgba(245,158,11,0.6),0 1px 4px rgba(0,0,0,0.6);background:rgba(69,26,3,0.9)");

        const logoUrl = r.group_logo_url ?? event?.group_logo_url ?? null;
        if (logoUrl) {
          const img = document.createElement("img");
          img.src = logoUrl;
          img.style.cssText = "width:100%;height:100%;object-fit:cover";
          el.appendChild(img);
        } else {
          // Inline SVG "route" pictogram (two waypoints joined by a dashed line) instead of
          // an emoji glyph — emoji fonts render inconsistently (and often illegibly) at this
          // marker size across platforms, whereas the SVG is crisp everywhere.
          el.innerHTML =
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<circle cx="5" cy="6" r="2.5" fill="currentColor"/>' +
            '<circle cx="19" cy="18" r="2.5" fill="currentColor"/>' +
            '<path d="M6.5 8 Q12 12 17.5 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.5 3.5"/>' +
            "</svg>";
          el.style.color = event ? "#7dd3fc" : "#fcd34d";
        }
        wrapper.appendChild(el);

        const cohostGroups = (event?.cohost_groups ?? []).filter((g) => g.group_logo_url);
        const overlap = Math.round(size * 0.35);
        cohostGroups.forEach((g, i) => {
          const cohostEl = document.createElement("div");
          cohostEl.style.cssText =
            `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;` +
            `position:relative;margin-left:-${overlap}px;z-index:${5 - i};` +
            (isPast
              ? "border:2px solid #71717a;box-shadow:0 1px 4px rgba(0,0,0,0.6);opacity:0.5;filter:grayscale(60%);"
              : "border:2px solid #38bdf8;box-shadow:0 0 8px rgba(56,189,248,0.7),0 1px 4px rgba(0,0,0,0.6);") +
            "display:flex;align-items:center;justify-content:center;background:rgba(12,74,110,0.9)";
          const img = document.createElement("img");
          img.src = g.group_logo_url as string;
          img.style.cssText = "width:100%;height:100%;object-fit:cover";
          cohostEl.appendChild(img);
          wrapper.appendChild(cohostEl);
        });

        const cohostNames = (event?.cohost_groups ?? []).map((g) => g.group_name).join(", ");
        const hostLabel = event ? (cohostNames ? `${event.group_name} + ${cohostNames}` : event.group_name) : "";
        wrapper.title = event ? `${event.title} — ${hostLabel}${isPast ? " (ended)" : ""}` : "View this cleanup route";

        const marker = new maplibregl.Marker({ element: wrapper }).setLngLat(mid).addTo(map.current!);
        wrapper.onclick = (e) => {
          e.stopPropagation();
          if (event) {
            setSelectedCleanupEvent(event);
          } else {
            showRouteTooltip(r.id, mid);
          }
        };
        cleanupRouteMarkersRef.current.push(marker);

        if (event && !event.is_past) {
          const dateText = formatEventDateTime(event.scheduled_start);
          if (dateText) {
            cleanupRouteDateLabelsRef.current.push(
              createDateTimeLabelMarker(map.current!, mid, dateText, size / 2 + 4),
            );
          }
        }
      }
    },
    [showRouteTooltip],
  );

  useEffect(() => {
    updateCleanupRouteMarkers(cleanupRoutesRef.current, cleanupEvents ?? []);
  }, [cleanupRoutes, cleanupEvents, updateCleanupRouteMarkers]);

  const refreshHexBloom = useCallback(() => {
    const m = map.current;
    if (!m) return;
    const src = m.getSource("hex-bloom");
    if (src) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (src as any).setTiles([
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/h3-bloom/${campaign.id}/{z}/{x}/{y}.mvt?v=${Date.now()}`,
      ]);
    }
  }, [campaign.id]);

  // Adds territory + contribution sources/layers. Called on initial load and after every style swap
  // (setStyle wipes all custom sources/layers; event listeners persist and reattach automatically).
  const setupCustomLayers = useCallback(async () => {
    const m = map.current;
    if (!m) return;

    // NYC neighborhoods overlay: campaign-type-independent (set up before any of the
    // isCollage/isHeatmap/isHexBloom early returns below), but only offered on the Trash
    // War campaign for now — skip the adjacency fetch/source entirely elsewhere so it's
    // a complete no-op on every other campaign. Starts hidden; toggled via LayerToggle.
    // Non-critical — swallow failures so the rest of the map still loads.
    if (campaign.slug === "trash-war") try {
      if (!nycAdjacencyRef.current) {
        const adjRes = await fetch(
          `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/nyc-neighborhoods/adjacency`,
        );
        if (adjRes.ok) {
          nycAdjacencyRef.current = await adjRes.json();
        }
      }
      if (nycAdjacencyRef.current && !nycColorAssignmentRef.current) {
        nycColorAssignmentRef.current = computeGraphColoring(
          nycAdjacencyRef.current,
          NYC_NEIGHBORHOOD_PALETTE.length,
        );
      }

      const fillColorExpr: unknown[] = ["match", ["get", "unit_id"]];
      if (nycColorAssignmentRef.current) {
        for (const [unitId, colorIdx] of Object.entries(nycColorAssignmentRef.current)) {
          fillColorExpr.push(unitId, NYC_NEIGHBORHOOD_PALETTE[colorIdx % NYC_NEIGHBORHOOD_PALETTE.length]);
        }
      }
      fillColorExpr.push("#a1a1aa");

      m.addSource("nyc-neighborhoods", {
        type: "vector",
        tiles: [`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/nyc-neighborhoods/{z}/{x}/{y}.mvt`],
        minzoom: 0,
        maxzoom: 14,
        promoteId: "unit_id",
      });

      m.addLayer({
        id: "nyc-neighborhoods-fill",
        type: "fill",
        source: "nyc-neighborhoods",
        "source-layer": "nyc_neighborhoods",
        layout: { visibility: nycNeighborhoodsVisibleRef.current ? "visible" : "none" },
        paint: {
          "fill-color": fillColorExpr as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          "fill-opacity": 0.16,
        },
      });

      m.addLayer({
        id: "nyc-neighborhoods-border",
        type: "line",
        source: "nyc-neighborhoods",
        "source-layer": "nyc_neighborhoods",
        layout: { visibility: nycNeighborhoodsVisibleRef.current ? "visible" : "none" },
        paint: {
          // Same match expression as the fill so each neighborhood's outline reads as its
          // own color (mosaic look) rather than a flat grid line competing with the zip
          // choropleth fill underneath.
          "line-color": fillColorExpr as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          "line-width": 1.5,
          "line-opacity": 0.9,
        },
      });
    } catch {
      // NYC neighborhoods overlay is non-critical — map still works without it
    }

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
          if (locations.length > 0) {
            const b = new maplibregl.LngLatBounds();
            for (const loc of locations) b.extend([loc.longitude, loc.latitude]);
            dataBoundsRef.current = b;
          }
        }
      } catch {
        // photo markers are non-critical
      }
      return;
    }

    if (isHeatmap) {
      // Heatmap campaigns: no territory tiles — render MapLibre heatmap from contribution points
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/${campaign.id}/locations`,
        );
        if (res.ok) {
          const locations = (await res.json()) as ContributionPoint[];
          const features = locations.map((loc) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [loc.longitude, loc.latitude] },
            properties: { value: loc.value ?? 1 },
          }));
          contributionFeaturesRef.current = features;
          if (features.length > 0) {
            const b = new maplibregl.LngLatBounds();
            for (const f of features) b.extend(f.geometry.coordinates as [number, number]);
            dataBoundsRef.current = b;
          }
          m.addSource("contribution-pts", {
            type: "geojson",
            data: { type: "FeatureCollection", features },
          });
          m.addLayer({
            id: "heatmap-layer",
            type: "heatmap",
            source: "contribution-pts",
            paint: {
              "heatmap-weight": 1,
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1.5, 9, 4],
              "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(0,0,0,0)",
                0.08, "rgba(0,80,255,0.9)",
                0.25, "rgba(0,200,180,1)",
                0.42, "rgba(0,210,60,1)",
                0.58, "rgba(200,220,0,1)",
                0.72, "rgba(255,140,0,1)",
                0.88, "rgba(230,30,0,1)",
                1, "rgba(160,0,0,1)",
              ],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 20, 5, 30, 9, 45],
              "heatmap-opacity": 0.9,
            },
          } as Parameters<typeof m.addLayer>[0]);
        }
      } catch {
        // heatmap layer is non-critical
      }
      return;
    }

    if (isHexBloom) {
      // Load photo markers for all submitted spot-it photos
      photoMarkersRef.current.forEach((mk) => mk.remove());
      photoMarkersRef.current = [];
      try {
        const locRes = await fetch(
          `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/${campaign.id}/locations`,
        );
        if (locRes.ok) {
          const locations = (await locRes.json()) as ContributionPoint[];
          for (const loc of locations) {
            if (loc.photo_url) {
              const marker = addPhotoMarker(m, loc, setSelectedPhoto, 32);
              photoMarkersRef.current.push(marker);
            }
          }
        }
      } catch {
        // non-critical
      }

      // Fetch hex data to compute extent for the fit-to-extent button.
      // Prefer stage 2+ cells; fall back to all cells if none qualify.
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/${campaign.id}/hex-bloom`,
        );
        if (res.ok) {
          const hexes = (await res.json()) as HexBloomEntry[];
          const active = hexes.filter((h) => h.bloom_stage >= 2);
          const source = active.length > 0 ? active : hexes;
          if (source.length > 0) {
            const b = new maplibregl.LngLatBounds();
            for (const hex of source) {
              for (const [lat, lng] of cellToBoundary(hex.h3_index)) {
                b.extend([lng, lat]);
              }
            }
            dataBoundsRef.current = b;
          }
        }
      } catch {
        // non-critical — fit button just won't work
      }
      m.addImage("hex-solar-panel", makeSolarPanelPattern());
      m.addSource("hex-bloom", {
        type: "vector",
        tiles: [`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/h3-bloom/${campaign.id}/{z}/{x}/{y}.mvt`],
        minzoom: 0,
        maxzoom: 10,
      });

      // Untouched hexes (stage 0): faint fill — no contributions yet
      m.addLayer({
        id: "hex-bloom-untouched",
        type: "fill",
        source: "hex-bloom",
        "source-layer": "hexes",
        filter: ["==", ["get", "bloom_stage"], 0],
        paint: {
          "fill-color": "#0d1520",
          "fill-opacity": 0.08,
        },
      } as Parameters<typeof m.addLayer>[0]);

      // Dormant hexes (stage 1): solar panel pattern — contributions started, not yet Germinating
      m.addLayer({
        id: "hex-bloom-dormant",
        type: "fill",
        source: "hex-bloom",
        "source-layer": "hexes",
        filter: ["==", ["get", "bloom_stage"], 1],
        paint: {
          "fill-pattern": "hex-solar-panel",
          "fill-opacity": 0.45,
        },
      } as Parameters<typeof m.addLayer>[0]);

      // Active hexes (stage 2+): filled with bloom colours
      m.addLayer({
        id: "hex-bloom-fill",
        type: "fill",
        source: "hex-bloom",
        "source-layer": "hexes",
        filter: [">=", ["get", "bloom_stage"], 2],
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "bloom_stage"], 5], "#5ca84a",
            ["==", ["get", "bloom_stage"], 4], "#3d7a2e",
            ["==", ["get", "bloom_stage"], 3], "#2d5c24",
            "#1f3a18",
          ],
          "fill-opacity": [
            "case",
            ["==", ["get", "bloom_stage"], 5], 0.5,
            ["==", ["get", "bloom_stage"], 4], 0.35,
            ["==", ["get", "bloom_stage"], 3], 0.25,
            0.25,
          ],
        },
      } as Parameters<typeof m.addLayer>[0]);

      m.addLayer({
        id: "hex-bloom-border",
        type: "line",
        source: "hex-bloom",
        "source-layer": "hexes",
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "bloom_stage"], 5], "#5ca84a",
            ["==", ["get", "bloom_stage"], 4], "#3d7a2e",
            ["==", ["get", "bloom_stage"], 3], "#2d5c24",
            ["==", ["get", "bloom_stage"], 2], "#1f3a18",
            ["==", ["get", "bloom_stage"], 1], "#2a3d50",
            "#1e2d3a",
          ],
          "line-width": [
            "case",
            [">=", ["get", "bloom_stage"], 2], 1.5,
            ["==", ["get", "bloom_stage"], 1], 0.8,
            0.5,
          ],
          "line-opacity": [
            "case",
            [">=", ["get", "bloom_stage"], 2], 0.9,
            ["==", ["get", "bloom_stage"], 1], 0.45,
            0.2,
          ],
        },
      } as Parameters<typeof m.addLayer>[0]);

      return;
    }

    // Territory/choropleth campaigns are US-scoped, unless they also cover UK postcode districts
    dataBoundsRef.current = (campaign.geo_unit?.includes("uk_postcode_district") ?? false)
      ? [[-125, 24], [2, 61]]
      : [[-125, 24], [-66, 49]];

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
        // Unclaimed territories (no feature-state set) get more obvious/darker as you
        // zoom in, so they don't wash out the basemap at wide zoom levels. "zoom" must
        // be the direct input to a top-level "interpolate" expression, so the hover/
        // feature-state math is pushed into the per-stop output instead of wrapping it —
        // claimed territories set an explicit "opacity" feature-state that's identical
        // at both stops, so they interpolate to a constant and stay zoom-independent.
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          9, ["min", ["+", ["coalesce", ["feature-state", "opacity"], 0.14], ["coalesce", ["feature-state", "pulse_extra"], 0]], 0.95],
          15, ["min", ["+", ["coalesce", ["feature-state", "opacity"], 0.4], ["coalesce", ["feature-state", "pulse_extra"], 0]], 0.95],
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
        // "zoom" must be the direct input to a top-level "interpolate" expression, so the
        // hover/feature-state "case" logic is pushed into the per-stop output instead of
        // wrapping it — the hovered branch is identical at both stops, so it interpolates
        // to a constant and hover highlighting stays full-strength at every zoom level.
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          9, ["case",
            ["boolean", ["feature-state", "hover"], false],
            ["+", ["coalesce", ["feature-state", "border_width"], 2.0], 2.5],
            ["*", ["coalesce", ["feature-state", "border_width"], 2.0], 0.5],
          ],
          15, ["case",
            ["boolean", ["feature-state", "hover"], false],
            ["+", ["coalesce", ["feature-state", "border_width"], 2.0], 2.5],
            ["coalesce", ["feature-state", "border_width"], 2.0],
          ],
        ],
        // Fade non-hovered borders out at far-out zoom levels, where dozens of
        // overlapping borders make the basemap hard to read; sharpen back up
        // as the user zooms into individual zip codes.
        "line-opacity": [
          "interpolate", ["linear"], ["zoom"],
          9, ["case",
            ["boolean", ["feature-state", "hover"], false],
            ["coalesce", ["feature-state", "border_opacity"], 0.85],
            ["*", ["coalesce", ["feature-state", "border_opacity"], 0.85], 0.35],
          ],
          15, ["case",
            ["boolean", ["feature-state", "hover"], false],
            ["coalesce", ["feature-state", "border_opacity"], 0.85],
            ["coalesce", ["feature-state", "border_opacity"], 0.85],
          ],
        ],
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

    m.addLayer({
      id: "territory-event-highlight",
      type: "line",
      source: "territory",
      "source-layer": "territories",
      paint: {
        "line-color": "#facc15",
        "line-width": 3,
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "event_highlight"], false],
          0.95,
          0,
        ],
        "line-dasharray": [2, 1.5],
      },
    });

    m.addLayer({
      id: "territory-picker-fill",
      type: "fill",
      source: "territory",
      "source-layer": "territories",
      paint: {
        "fill-color": "#f59e0b",
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "picker_selected"], false],
          0.55,
          0,
        ],
      },
    });

    m.addLayer({
      id: "territory-picker-highlight",
      type: "line",
      source: "territory",
      "source-layer": "territories",
      paint: {
        "line-color": "#f59e0b",
        "line-width": 3,
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "picker_selected"], false],
          0.95,
          0,
        ],
      },
    });

    const addDotLayer = () => {
      m.addLayer({
        id: "contribution-dots-halo",
        type: "circle",
        source: "contribution-pts",
        filter: ["==", ["get", "is_group_event"], true],
        paint: {
          "circle-radius": 11,
          "circle-color": "#38bdf8",
          "circle-opacity": 0.55,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#38bdf8",
          "circle-stroke-opacity": 0.9,
        },
      });
      m.addLayer({
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
    };

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
              is_group_event: loc.is_group_event ?? false,
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
      const applyColors = () => {
        initializeChoroplethColors(m);
        applyClaimsAsFeatureState(m, claimsRef.current, claimLabelsRef.current, true);
      };
      // Poll on each idle until querySourceFeatures returns features (tiles are in the
      // render buffer). Both "idle before tiles start" and "isSourceLoaded fires early
      // on metadata" cause the one-shot approaches to consume their listener with an
      // empty feature set. Polling self-removes on first success.
      const tryApplyColors = () => {
        const features = m.querySourceFeatures("territory", { sourceLayer: "territories" });
        if (features.length > 0) {
          m.off("idle", tryApplyColors as unknown as Parameters<typeof m.on>[1]);
          applyColors();
        }
      };
      m.on("idle", tryApplyColors as unknown as Parameters<typeof m.on>[1]);
      // Re-apply when user pans/zooms new tiles into view; registered once, survives style swaps
      if (!choroplethListenerRef.current) {
        choroplethListenerRef.current = true;
        m.on("moveend", () => m.once("idle", applyColors));
      }
    } else {
      applyClaimsAsFeatureState(m, claimsRef.current, claimLabelsRef.current);
    }
    applyEventAreaHighlights(m, activeEventsRef.current, eventGeoUnitIdsRef.current);
    // Re-apply when user pans/zooms new tiles into view; registered once, survives style swaps
    if (!eventHighlightListenerRef.current) {
      eventHighlightListenerRef.current = true;
      m.on("moveend", () =>
        m.once("idle", () =>
          applyEventAreaHighlights(m, activeEventsRef.current, eventGeoUnitIdsRef.current),
        ),
      );
    }
    if (!eventMarkerZoomListenerRef.current) {
      eventMarkerZoomListenerRef.current = true;
      m.on("zoom", () => {
        const scale = getEventMarkerScale(m.getZoom());
        eventMarkerScaleElsRef.current.forEach((wrapperEl) => {
          wrapperEl.style.transform = `scale(${scale})`;
        });
      });
    }
    m.addSource("report-radius", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    m.addLayer({
      id: "report-radius-fill",
      type: "fill",
      source: "report-radius",
      paint: {
        "fill-color": ["match", ["get", "status"], ["scheduled", "in_progress"], "#a855f7", "#f97316"],
        "fill-opacity": 0.08,
      },
    });
    m.addLayer({
      id: "report-radius-line",
      type: "line",
      source: "report-radius",
      paint: {
        "line-color": ["match", ["get", "status"], ["scheduled", "in_progress"], "#9333ea", "#ea580c"],
        "line-width": 1.5,
        "line-opacity": 0.65,
      },
    });

    m.addSource("cleanup-event-radius", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    m.addLayer({
      id: "cleanup-event-radius-fill",
      type: "fill",
      source: "cleanup-event-radius",
      paint: {
        "fill-color": "#38bdf8",
        "fill-opacity": 0.08,
      },
    });
    m.addLayer({
      id: "cleanup-event-radius-line",
      type: "line",
      source: "cleanup-event-radius",
      paint: {
        "line-color": "#38bdf8",
        "line-width": 1.5,
        "line-opacity": 0.65,
      },
    });

    m.addSource("report-points", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    m.addLayer({
      id: "report-dots",
      type: "circle",
      source: "report-points",
      paint: {
        "circle-radius": 5,
        "circle-color": ["match", ["get", "status"], ["scheduled", "in_progress"], "#a855f7", "#f97316"],
        "circle-opacity": 0.9,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": ["match", ["get", "status"], ["scheduled", "in_progress"], "#9333ea", "#ea580c"],
      },
    });

    m.addSource("route-picker", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    m.addLayer({
      id: "route-picker-line",
      type: "line",
      source: "route-picker",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#f59e0b",
        "line-width": 4,
        "line-dasharray": [0.5, 1.5],
      },
    });
    m.addLayer({
      id: "route-picker-vertices",
      type: "circle",
      source: "route-picker",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 6,
        "circle-color": "#f59e0b",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#451a03",
      },
    });

    m.addSource("cleanup-routes", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    // True geodesic buffer polygon (server-computed via ST_Buffer) around event routes'
    // check-in corridor — same fill/line styling as cleanup-event-radius-fill/-line, giving
    // route events the equivalent of a point event's proximity circle. Added before the
    // line/casing layers so the route itself stays legible on top of the buffer.
    m.addSource("cleanup-routes-buffer", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    m.addLayer({
      id: "cleanup-routes-buffer-fill",
      type: "fill",
      source: "cleanup-routes-buffer",
      paint: { "fill-color": "#38bdf8", "fill-opacity": 0.08 },
    });
    m.addLayer({
      id: "cleanup-routes-buffer-line",
      type: "line",
      source: "cleanup-routes-buffer",
      paint: { "line-color": "#38bdf8", "line-width": 1.5, "line-opacity": 0.65 },
    });
    // Solid cyan + white casing (matches the route-picker/detail-page brand color) —
    // deliberately not pink/magenta/dashed, since several basemap styles already render
    // dashed magenta trail lines that a dashed pink route layer was getting lost against.
    m.addLayer({
      id: "cleanup-routes-casing",
      type: "line",
      source: "cleanup-routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 8],
        "line-opacity": ["case", ["get", "is_past"], 0.45, 0.9],
      },
    });
    m.addLayer({
      id: "cleanup-routes-line",
      type: "line",
      source: "cleanup-routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        // Group-event (pre-planned) routes render blue, matching the event marker
        // palette; individual/group ad-hoc routes render amber — a genuinely
        // different hue (not another blue/cyan shade) so the two categories are
        // tellable apart at a glance. A past event's route greys out, mirroring
        // the point-marker treatment for a past event (is_past never true for
        // ad-hoc, non-event routes, which don't expire).
        "line-color": ["case", ["get", "is_past"], "#71717a", ["get", "is_event"], "#0284c7", "#f59e0b"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 5],
        "line-opacity": ["case", ["get", "is_past"], 0.55, 1],
      },
    });
    m.addLayer({
      id: "cleanup-routes-arrows",
      type: "symbol",
      source: "cleanup-routes",
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 60,
        "text-field": "▶",
        "text-size": 14,
        "text-rotation-alignment": "map",
        "text-pitch-alignment": "map",
        "text-keep-upright": false,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": ["case", ["get", "is_event"], "#0c4a6e", "#78350f"],
        "text-halo-color": "#ecfeff",
        "text-halo-width": 1,
        "text-opacity": ["case", ["get", "is_past"], 0.5, 1],
      },
    });

    updateEventMarkers(activeEventsRef.current);
    updateBusinessMarkers(partnerBusinessesRef.current);
    updateCleanupEventMarkers(cleanupEventsRef.current, cleanupRoutesRef.current);
    updateReportMarkers(problemReportsRef.current?.reports ?? []);
    updateCleanupRoutesLayer(cleanupRoutesRef.current, cleanupEventsRef.current);
    updateCleanupRouteMarkers(cleanupRoutesRef.current, cleanupEventsRef.current);
  }, [campaign.id, isCollage, isChoropleth, isHeatmap, isHexBloom, refreshHexBloom, updateEventMarkers, updateBusinessMarkers, updateCleanupEventMarkers, updateReportMarkers, updateCleanupRoutesLayer, updateCleanupRouteMarkers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Style switcher — setStyle wipes sources/layers; re-add them on style.load
  useEffect(() => {
    if (!map.current || !mapReadyRef.current) return;
    setTilesLoading(true);
    map.current.once("style.load", () => {
      setupCustomLayers();
      map.current?.once("idle", () => setTilesLoading(false));
    });
    map.current.setStyle(styleUrl(activeStyle));
  }, [activeStyle, setupCustomLayers]);

  // NYC neighborhoods overlay toggle
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReadyRef.current) return;
    const visibility = nycNeighborhoodsVisible ? "visible" : "none";
    if (m.getLayer("nyc-neighborhoods-fill")) {
      m.setLayoutProperty("nyc-neighborhoods-fill", "visibility", visibility);
    }
    if (m.getLayer("nyc-neighborhoods-border")) {
      m.setLayoutProperty("nyc-neighborhoods-border", "visibility", visibility);
    }
  }, [nycNeighborhoodsVisible]);

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

    // Matches the "sm" Tailwind breakpoint used for the rest of the mobile-specific
    // chrome in this component (see the `sm:hidden` overlays below).
    const isMobileViewport = window.innerWidth < 640;

    const initialBounds: maplibregl.LngLatBoundsLike = isHexBloom
      ? (isMobileViewport ? WORLD_BOUNDS : NORTH_AMERICA_EUROPE_BOUNDS)
      : isHeatmap
        ? WORLD_BOUNDS
        : (campaign.geo_unit?.includes("uk_postcode_district") ?? false) && isLikelyUK()
          ? UK_BOUNDS
          : CONTINENTAL_US_BOUNDS;
    // Extra bottom padding on mobile keeps the fitted bounds clear of the floating
    // stats/event chip and zoom-control overlays anchored near the bottom of the
    // screen there (see the `absolute bottom-*` overlays below). Hex Bloom campaigns
    // also float a "World Bloom" widget (plus timed-event chips) over the map's
    // top-left corner (see CampaignPageClient's `absolute top-4 left-4` overlay) —
    // extra top/left padding there keeps the world-wide starting extent (and North
    // America specifically) from being hidden behind it.
    const initialFitPadding = isMobileViewport
      ? { top: isHexBloom ? 130 : 20, bottom: 90, left: isHexBloom ? 100 : 20, right: 20 }
      : { top: 20, bottom: 20, left: 20, right: 20 };

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl("outdoor"),
      bounds: initialBounds,
      fitBoundsOptions: { padding: initialFitPadding },
      attributionControl: false,
    });

    // The initial `bounds` fit above runs synchronously against whatever size the
    // container reports at construction time. On mobile that's occasionally a stale/
    // pre-layout size (address-bar chrome, font-driven reflow, etc.), which locks in
    // the wrong zoom — the later ResizeObserver-driven `.resize()` call below just
    // re-renders at that same wrong zoom rather than recomputing it. Re-fitting once
    // the style/tiles have actually loaded guarantees the fit runs against the real,
    // settled container size.
    map.current.once("load", () => {
      map.current?.fitBounds(initialBounds, { padding: initialFitPadding, animate: false });
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    if (navigator.geolocation) {
      // The map's GeolocateControl is the single geolocation source for the whole app —
      // it owns the one continuous watchPosition() (trackUserLocation: true) and every
      // other consumer (cleanup/report submission, the custom location marker below)
      // reads off its 'geolocate'/'error' events instead of making their own competing
      // getCurrentPosition()/watchPosition() calls. showUserLocation is off because we
      // draw our own pulsing marker from the userLocation prop rather than the control's
      // built-in dot.
      const control = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: false,
        fitBoundsOptions: { maxZoom: 14 },
      });
      geolocateControlRef.current = control;
      // trigger() toggles: calling it while already tracking (or sitting in an
      // error state) turns tracking OFF instead of refreshing. hasFixRef tracks
      // whether we're currently receiving live fixes so the exposed
      // requestLocation() (called from ContributionPanel) only calls trigger()
      // when it's actually safe to do so (control is OFF), matching what a real
      // button click would do instead of silently disabling tracking. When a fix
      // is already active we re-emit the last known position instead of just
      // returning true — callers can have their own copy of the coords cleared
      // out from under them (e.g. the pin picker resets userLocation to hide the
      // GPS marker while a manual pin is shown), and the underlying watchPosition
      // may not produce another update for a long time on a stationary device, so
      // silently no-op'ing here left them waiting for a fix that already exists.
      const hasFixRef = { current: false };
      const lastPositionRef = { current: null as { latitude: number; longitude: number } | null };
      // Tracks whether we still owe the map an initial fly-to-user-location. Set to
      // false as soon as it's used (or superseded by a real user gesture), so later
      // watchPosition updates as the user moves around don't keep re-centering on them.
      const autoFlyPendingRef = { current: true };
      // dragstart/zoomstart also fire for our own programmatic initial-bounds fitBounds
      // call above, so only count gestures that carry an originalEvent (i.e. actually
      // came from the mouse/touch/wheel) as real user interaction.
      let userInteracted = false;
      const markInteracted = (e: { originalEvent?: unknown }) => {
        if (e.originalEvent) userInteracted = true;
      };
      map.current.on("dragstart", markInteracted);
      map.current.on("zoomstart", markInteracted);
      control.on("geolocate", (e) => {
        hasFixRef.current = true;
        const pos = e as GeolocationPosition;
        lastPositionRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        onUserLocationChangeRef.current?.(lastPositionRef.current);
        if (autoFlyPendingRef.current && !userInteracted) {
          autoFlyPendingRef.current = false;
          map.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14, duration: 1000 });
        }
      });
      control.on("error", (e) => {
        hasFixRef.current = false;
        const err = e as GeolocationPositionError;
        onUserLocationErrorRef.current?.(err.code);
      });
      map.current.addControl(control, "top-right");
      // trigger() toggles tracking on/off, so every caller that wants tracking
      // *started* (as opposed to explicitly re-clicked) must funnel through this
      // single startedRef-guarded helper. Without it, our own auto-locate-on-mount
      // call below and ContributionPanel's independent gps.capture()-on-mount calls
      // (which reach this control via the onGeolocateTrigger callback) can each call
      // control.trigger() once, and the second call flips tracking back OFF instead
      // of doing anything useful — silently killing geolocation before a fix ever
      // arrives.
      const startedRef = { current: false };
      const startTracking = () => {
        if (startedRef.current) return true;
        startedRef.current = true;
        return control.trigger();
      };
      onGeolocateTrigger?.(() => {
        if (hasFixRef.current) {
          if (lastPositionRef.current) onUserLocationChangeRef.current?.(lastPositionRef.current);
          return true;
        }
        return startTracking();
      });

      // Default the initial view to the user's location rather than the generic
      // continent-wide fit, once they grant permission (the actual camera move happens
      // in the "geolocate" handler above, via an explicit flyTo — GeolocateControl's own
      // internal auto-camera-follow only reliably fires from a real button click, not a
      // programmatic trigger()). Deferred to "load": GeolocateControl finishes its own
      // internal setup (checkGeolocationSupport(), which sets a private _setup flag)
      // asynchronously after addControl() returns, and trigger() is a no-op with a
      // console warning ("Geolocate control triggered before added to a map") if called
      // before that resolves. "load" (style + tiles fetched) reliably comes after it.
      map.current.once("load", () => {
        startTracking();
      });
    }
    map.current.addControl(
      new FitExtentControl(() => dataBoundsRef.current),
      "top-right",
    );
    map.current.addControl(
      new ZoomToRegionControl(CONTINENTAL_US_BOUNDS, US_FLAG_SVG, "Zoom to US"),
      "top-right",
    );
    map.current.addControl(
      new ZoomToRegionControl(UK_BOUNDS, UK_FLAG_SVG, "Zoom to UK"),
      "top-right",
    );
    map.current.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    const ro = new ResizeObserver(() => map.current?.resize());
    ro.observe(mapContainer.current);

    // Watch "idle" only once per load/style-swap rather than for the map's whole
    // lifetime — the report-radius pulse animation repaints continuously, which
    // would otherwise keep the map perpetually "busy" and the spinner stuck on.
    map.current.once("idle", () => setTilesLoading(false));

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

      map.current.on("mouseenter", "report-dots", () => {
        if (map.current) map.current.getCanvas().style.cursor = "pointer";
      });
      map.current.on("mousemove", "report-dots", (e) => {
        if (pinPickerActiveRef.current || !e.features?.[0]) return;
        const props = e.features[0].properties as { severity?: string; reported_at?: string };
        const date = props.reported_at
          ? new Date(props.reported_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "";
        const severityLabel = props.severity ? props.severity.charAt(0).toUpperCase() + props.severity.slice(1) : "Unknown";
        hoverDiv.style.display = "block";
        hoverDiv.style.left = `${e.originalEvent.clientX + 14}px`;
        hoverDiv.style.top = `${e.originalEvent.clientY - 10}px`;
        hoverDiv.innerHTML =
          `<div style="font-weight:700;font-size:13px;color:#f4f4f5">🗑️ Trash report</div>` +
          `<div style="color:#f97316;font-size:11px;margin-top:4px">${severityLabel} severity</div>` +
          (date ? `<div style="color:#a1a1aa;font-size:11px;margin-top:2px">Reported ${date}</div>` : "") +
          `<div style="color:#71717a;font-size:10px;margin-top:4px">Clean up within the shaded radius to resolve it</div>`;
      });
      map.current.on("mouseleave", "report-dots", () => {
        if (map.current) map.current.getCanvas().style.cursor = "";
        hoverDiv.style.display = "none";
      });
      map.current.on("click", "report-dots", (e) => {
        if (pinPickerActiveRef.current || routePickerActiveRef.current || !e.features?.[0]) return;
        const props = e.features[0].properties as {
          id?: string;
          severity?: string;
          reported_at?: string;
          photo_url?: string | null;
          status?: string;
          claimed_by_user_id?: string | null;
          claim_before_deadline_at?: string | null;
          claim_after_deadline_at?: string | null;
          flag_count?: number;
          unit_type?: string | null;
        };
        if (!props.id) return;
        const geometry = e.features[0].geometry;
        if (geometry.type !== "Point") return;
        const [longitude, latitude] = geometry.coordinates as [number, number];
        onReportClickRef.current?.({
          id: props.id,
          geo_unit_id: null,
          severity: props.severity ?? "low",
          reported_at: props.reported_at ?? "",
          photo_url: props.photo_url ?? null,
          latitude,
          longitude,
          unit_type: props.unit_type ?? null,
          status: props.status ?? "open",
          claimed_by_user_id: props.claimed_by_user_id ?? null,
          flag_count: props.flag_count ?? 0,
          claim_before_deadline_at: props.claim_before_deadline_at ?? null,
          claim_after_deadline_at: props.claim_after_deadline_at ?? null,
        });
      });

      let lastHoveredId: string | number | null = null;

      map.current.on("mousemove", "territory-fill", (e) => {
        if (!map.current || !e.features?.[0] || pinPickerActiveRef.current) return;
        map.current.getCanvas().style.cursor = "pointer";
        // On mobile there's no hover-out equivalent (touch never fires mouseleave), so this
        // tooltip would stay stuck open and overlap the territory-info panel opened by the
        // click handler below. Mobile has its own click-to-open info window, so skip it there.
        if (isMobileViewport) return;
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
          const props = e.features[0].properties as { display_name?: string; unit_type?: string };
          const featureState = e.features[0].state as {
            total_value?: number;
            claimed_label?: string | null;
            claim_is_group?: boolean;
          };
          const displayName = props.display_name ?? "—";
          const featureUnitLabel = props.unit_type === "uk_postcode_district" ? "Postcode" : "ZIP";
          const totalVal = featureState.total_value ?? 0;
          if (isChoropleth) {
            const lean = US_STATE_LEAN[displayName] ?? 0;
            const isR = lean < 0;
            const party = Math.abs(lean) < 0.15 ? "Swing" : isR ? "Republican" : "Democrat";
            const pct = Math.min(Math.round((totalVal / CHOROPLETH_THRESHOLD) * 100), 100);
            hoverDiv.innerHTML =
              `<div style="font-weight:700;font-size:13px;color:#f4f4f5">${displayName}</div>` +
              `<div style="color:${isR ? "#f87171" : "#60a5fa"};font-size:11px;margin-top:4px">${party}</div>` +
              `<div style="color:#a1a1aa;font-size:11px;margin-top:2px">${totalVal.toLocaleString()} actions · ${pct}% neutralized</div>`;
          } else {
            const points = totalVal;
            const claimerHtml = featureState.claimed_label
              ? `<div style="color:${featureState.claim_is_group ? "#34d399" : "#60a5fa"};font-size:11px;margin-top:4px">` +
              `${featureState.claim_is_group ? "👥" : "👤"} ${featureState.claimed_label}</div>` +
              `<div style="color:#a1a1aa;font-size:11px;margin-top:1px">${points} point${points !== 1 ? "s" : ""}</div>`
              : `<div style="color:#52525b;font-size:11px;margin-top:4px">Unclaimed</div>`;
            hoverDiv.innerHTML =
              `<div style="font-weight:700;font-size:13px;color:#f4f4f5">${featureUnitLabel} ${displayName}</div>` + claimerHtml;
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
        if (!e.features?.[0] || routePickerActiveRef.current) return;
        const feature = e.features[0];
        const props = feature.properties as { display_name?: string; geo_unit_id?: string; unit_type?: string };
        const geoUnitId = String(feature.id ?? props.geo_unit_id ?? "");

        if (areaPickerActiveRef.current) {
          if (!map.current) return;
          if (areaPickerUnitTypeRef.current && props.unit_type !== areaPickerUnitTypeRef.current) return;
          const featureState = { source: "territory", sourceLayer: "territories", id: geoUnitId };
          if (pickedAreasRef.current.has(geoUnitId)) {
            pickedAreasRef.current.delete(geoUnitId);
            map.current.setFeatureState(featureState, { picker_selected: false });
          } else {
            pickedAreasRef.current.set(geoUnitId, {
              geoUnitId,
              displayName: props.display_name ?? geoUnitId,
              unitType: props.unit_type ?? "",
            });
            map.current.setFeatureState(featureState, { picker_selected: true });
          }
          setAreaPickerCount(pickedAreasRef.current.size);
          onAreaPickerChangeRef.current?.(Array.from(pickedAreasRef.current.values()));
          return;
        }

        if (pinPickerActiveRef.current) return;
        const displayName = props.display_name ?? geoUnitId;
        const unitLabel = props.unit_type === "uk_postcode_district" ? "Postcode" : "ZIP";
        setSelectedZip({ geoUnitId, displayName, unitLabel });
      });

      // Hex bloom hover + click — shared handler for both dormant and active layers
      const showHexTooltip = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features?.[0] || pinPickerActiveRef.current || areaPickerActiveRef.current) return;
        const props = e.features[0].properties as {
          bloom_stage?: number; bloom_score?: number; seed_source?: string | null;
        };
        const stage = props.bloom_stage ?? 1;
        const score = Math.round(props.bloom_score ?? 0);
        const color = BLOOM_STAGE_COLORS[stage];
        const label = BLOOM_STAGE_LABELS[stage];
        hoverDiv.style.display = "block";
        hoverDiv.style.left = `${e.originalEvent.clientX + 14}px`;
        hoverDiv.style.top = `${e.originalEvent.clientY - 10}px`;
        hoverDiv.innerHTML =
          `<div style="font-weight:700;font-size:12px;color:${color}">Stage ${stage} — ${label}</div>` +
          `<div style="color:#a1a1aa;font-size:11px;margin-top:3px">${score.toLocaleString()} bloom pts</div>` +
          (props.seed_source ? `<div style="color:#52525b;font-size:10px;margin-top:2px">🌍 pre-seeded</div>` : "");
      };
      const hideHexTooltip = () => {
        if (map.current) map.current.getCanvas().style.cursor = "";
        hoverDiv.style.display = "none";
      };
      const handleHexClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features?.[0] || pinPickerActiveRef.current || areaPickerActiveRef.current || routePickerActiveRef.current) return;
        const props = e.features[0].properties as {
          geo_unit_id: string; h3_index: string; bloom_score: number; bloom_stage: number; seed_source: string | null;
        };
        setSelectedHex({
          geo_unit_id: props.geo_unit_id ?? String(e.features[0].id ?? ""),
          h3_index: props.h3_index,
          bloom_score: props.bloom_score,
          bloom_stage: props.bloom_stage,
          seed_source: props.seed_source,
        });
      };

      for (const layerId of ["hex-bloom-untouched", "hex-bloom-dormant", "hex-bloom-fill"]) {
        map.current.on("mouseenter", layerId, () => {
          if (map.current) map.current.getCanvas().style.cursor = "pointer";
        });
        map.current.on("mousemove", layerId, showHexTooltip);
        map.current.on("mouseleave", layerId, hideHexTooltip);
        map.current.on("click", layerId, handleHexClick);
      }

      // NYC neighborhoods hover tooltip — shows the neighborhood's display name. Layer
      // only renders when the admin has toggled the overlay on, so this is a no-op
      // (invisible layers return no features) the rest of the time.
      const showNycNeighborhoodTooltip = (
        e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
      ) => {
        if (!e.features?.[0] || pinPickerActiveRef.current || areaPickerActiveRef.current) return;
        const props = e.features[0].properties as { display_name?: string };
        hoverDiv.style.display = "block";
        hoverDiv.style.left = `${e.originalEvent.clientX + 14}px`;
        hoverDiv.style.top = `${e.originalEvent.clientY - 10}px`;
        hoverDiv.innerHTML =
          `<div style="font-weight:700;font-size:12px;color:#f4f4f5">${props.display_name ?? "—"}</div>`;
      };
      const hideNycNeighborhoodTooltip = () => {
        if (map.current) map.current.getCanvas().style.cursor = "";
        hoverDiv.style.display = "none";
      };
      map.current.on("mouseenter", "nyc-neighborhoods-fill", () => {
        if (map.current) map.current.getCanvas().style.cursor = "pointer";
      });
      map.current.on("mousemove", "nyc-neighborhoods-fill", showNycNeighborhoodTooltip);
      map.current.on("mouseleave", "nyc-neighborhoods-fill", hideNycNeighborhoodTooltip);
      // Touch devices fire neither mousemove nor mouseleave — show the tooltip on tap
      // and auto-hide it shortly after since there's no hover-out equivalent.
      let nycTapHideTimer: ReturnType<typeof setTimeout> | undefined;
      map.current.on("click", "nyc-neighborhoods-fill", (e) => {
        if (routePickerActiveRef.current) return;
        showNycNeighborhoodTooltip(e);
        clearTimeout(nycTapHideTimer);
        nycTapHideTimer = setTimeout(hideNycNeighborhoodTooltip, 2000);
      });

      // Route picker — click-to-add-vertex. Plain map-level click (not layer-scoped) so it
      // fires regardless of what's under the cursor while drawing; the layer-specific
      // handlers above already bail out via routePickerActiveRef so they don't interfere.
      map.current.on("click", (e) => {
        if (!routePickerActiveRef.current || !map.current) return;
        const clicked: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const start = routeVerticesRef.current[0];
        const shouldSnap =
          routeVerticesRef.current.length >= 2 && distanceMeters(clicked, start) <= ROUTE_LOOP_CLOSE_METERS;
        const next = shouldSnap ? start : clicked;

        routeVerticesRef.current = [...routeVerticesRef.current, next];
        setRoutePickerVertexCount(routeVerticesRef.current.length);
        setRoutePickerJustClosedLoop(shouldSnap);
        onRoutePickerChangeRef.current?.(routeVerticesRef.current);
        redrawRoutePicker();
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
      businessMarkersRef.current.forEach((m) => m.remove());
      cleanupEventMarkersRef.current.forEach((m) => m.remove());
      cleanupEventDateLabelsRef.current.forEach((m) => m.remove());
      cleanupRouteMarkersRef.current.forEach((m) => m.remove());
      cleanupRouteDateLabelsRef.current.forEach((m) => m.remove());
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

  // Sync event-area highlight via feature-state when active events or their areas change
  useEffect(() => {
    if (map.current?.isStyleLoaded()) {
      applyEventAreaHighlights(map.current, activeEvents, eventGeoUnitIds ?? {});
    }
  }, [activeEvents, eventGeoUnitIds]);

  // Focus coords: fly to a deep-linked location (e.g. from an event page "log your cleanup" link)
  useEffect(() => {
    if (!focusCoords || !map.current) return;

    const flyToFocus = () => {
      map.current?.flyTo({
        center: [focusCoords.longitude, focusCoords.latitude],
        zoom: 15,
        duration: 700,
      });
    };

    if (mapReadyRef.current) {
      flyToFocus();
    } else {
      map.current.once("load", flyToFocus);
    }
  }, [focusCoords]);

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

  // Area picker: clear picked areas + their feature-state when picking mode turns off
  useEffect(() => {
    if (areaPickerActive) return;
    if (map.current && pickedAreasRef.current.size > 0) {
      pickedAreasRef.current.forEach((_, id) => {
        map.current!.setFeatureState(
          { source: "territory", sourceLayer: "territories", id },
          { picker_selected: false },
        );
      });
    }
    pickedAreasRef.current = new Map();
    setAreaPickerCount(0);
  }, [areaPickerActive]);

  // User location marker — auto-dropped when GPS is captured in the contribution panel
  useEffect(() => {
    userLocationRef.current = userLocation ?? null;

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
    if (!newContribution || !map.current) return;

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

    if (isHexBloom) {
      if (map.current) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:36px;height:36px;border-radius:50%;pointer-events:none;" +
          "border:2px solid rgba(92,168,74,0.95);box-sizing:border-box";
        const wave = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([newContribution.lng, newContribution.lat])
          .addTo(map.current);
        gsap.to(el, {
          scale: 5,
          opacity: 0,
          duration: 1.3,
          ease: "power2.out",
          onComplete: () => wave.remove(),
        });
        if (newContribution.photoUrl) {
          const marker = addPhotoMarker(
            map.current,
            { latitude: newContribution.lat, longitude: newContribution.lng, photo_url: newContribution.photoUrl },
            setSelectedPhoto,
            32,
          );
          photoMarkersRef.current.push(marker);
          gsap.from(marker.getElement(), { y: -30, opacity: 0, duration: 0.5, ease: "bounce.out" });
        }
      }
      refreshHexBloom();
      if (newContribution.photoUrl) setHexPhotoVersion((v) => v + 1);
      return;
    }

    const source = map.current.getSource("contribution-pts") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const feature: Feature<Point> = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [newContribution.lng, newContribution.lat] },
      properties: {
        value: newContribution.value,
        submitted_at: new Date().toISOString(),
        is_group_event: newContribution.isGroupEvent ?? false,
      },
    };
    contributionFeaturesRef.current = [...contributionFeaturesRef.current, feature];
    source.setData({ type: "FeatureCollection", features: contributionFeaturesRef.current });
  }, [newContribution, isCollage, isHexBloom, refreshHexBloom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Append freshly-submitted problem report to the live map immediately, without waiting on Realtime
  useEffect(() => {
    if (!newReport || !map.current) return;

    const report: ProblemReportMapData = {
      id: newReport.id,
      geo_unit_id: null,
      severity: newReport.severity,
      reported_at: new Date().toISOString(),
      photo_url: newReport.photoUrl ?? null,
      latitude: newReport.lat,
      longitude: newReport.lng,
      unit_type: null,
      status: "open",
      claimed_by_user_id: null,
      claim_before_deadline_at: null,
      claim_after_deadline_at: null,
      flag_count: 0,
    };

    const nextReports = [...(problemReportsRef.current?.reports ?? []), report];
    const nextData: ProblemReports = {
      reports: nextReports,
      counts_by_geo_unit: problemReportsRef.current?.counts_by_geo_unit ?? {},
      threshold: problemReportsRef.current?.threshold ?? null,
      flag_auto_hide_threshold: problemReportsRef.current?.flag_auto_hide_threshold ?? FLAG_AUTO_HIDE_THRESHOLD,
    };
    problemReportsRef.current = nextData;
    setLiveReports(nextData);
    updateReportMarkers(nextReports);
  }, [newReport, updateReportMarkers]);

  // Supabase Realtime
  useEffect(() => {
    const supabase = createClient();
    const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;

    // Refresh report markers + panel count when a new problem report is submitted
    const reportChannel = supabase
      .channel(`problem_reports:${campaign.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "problem_reports", filter: `campaign_id=eq.${campaign.id}` },
        async () => {
          const res = await fetch(`${fastapiUrl}/api/problem-reports/campaign/${campaign.id}`).catch(() => null);
          if (!res?.ok) return;
          const data = await res.json() as ProblemReports;
          problemReportsRef.current = data;
          setLiveReports(data);
          if (map.current) updateReportMarkers(data.reports);
        },
      )
      .subscribe();

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
          setLiveClaims((prev) => ({ ...prev, [claim.geo_unit_id as string]: claim }));
          if (isHexBloom) {
            refreshHexBloom();
            return;
          }
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

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reportChannel);
    };
  }, [campaign.id, isChoropleth, isHexBloom, refreshHexBloom, updateReportMarkers]); // eslint-disable-line react-hooks/exhaustive-deps

  const supportsZipSearch = campaign.geo_unit?.includes("zip") ?? false;
  const supportsUkPostcodeSearch = campaign.geo_unit?.includes("uk_postcode_district") ?? false;

  const handleGeoSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const query = geoSearch.trim();
    if (!query) return;
    // When a campaign supports both ZIP and UK postcode lookup, route purely
    // numeric input to the ZIP endpoint and everything else to UK postcodes.
    const useZip = supportsZipSearch && (/^\d+$/.test(query) || !supportsUkPostcodeSearch);
    const endpoint = useZip
      ? `/api/geo-units/zip/${query}/centroid`
      : `/api/geo-units/uk-postcode/${query}/centroid`;
    const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}${endpoint}`);
    if (!res.ok) {
      setGeoSearchError(useZip ? "ZIP not found" : "Postcode district not found");
      if (geoSearchErrorTimerRef.current) clearTimeout(geoSearchErrorTimerRef.current);
      geoSearchErrorTimerRef.current = setTimeout(() => setGeoSearchError(null), 3000);
      return;
    }
    const data = await res.json();
    map.current?.fitBounds(
      [[data.bbox[0], data.bbox[1]], [data.bbox[2], data.bbox[3]]],
      { padding: 40, maxZoom: 14 },
    );
  }, [geoSearch, supportsZipSearch, supportsUkPostcodeSearch]);

  const handleConfirmPin = () => {
    const pos = pinPickerMarkerRef.current?.getLngLat();
    if (pos) onPinPlaced?.(pos.lat, pos.lng);
  };

  return (
    <div className="relative flex flex-col flex-1 min-h-[500px]">
      <div ref={mapContainer} className="flex-1 w-full" />

      {selectedZip && !pinPickerActive && !areaPickerActive && !routePickerActive && (
        isChoropleth ? (
          <StatePanel
            geoUnitId={selectedZip.geoUnitId}
            displayName={selectedZip.displayName}
            totalActions={(liveClaims[selectedZip.geoUnitId] ?? claimsRef.current.find((c) => c.geo_unit_id === selectedZip.geoUnitId))?.total_value ?? 0}
            onClose={() => setSelectedZip(null)}
          />
        ) : (
          <TerritoryPanel
            geoUnitId={selectedZip.geoUnitId}
            displayName={selectedZip.displayName}
            unitLabel={selectedZip.unitLabel}
            claim={liveClaims[selectedZip.geoUnitId] ?? claimsRef.current.find((c) => c.geo_unit_id === selectedZip.geoUnitId) ?? null}
            claimLabel={claimLabelsRef.current[selectedZip.geoUnitId] ?? null}
            reportCount={liveReports?.counts_by_geo_unit[selectedZip.geoUnitId] ?? 0}
            reportThreshold={liveReports?.threshold ?? null}
            reportPhotos={(liveReports?.reports ?? []).filter(r => r.geo_unit_id === selectedZip.geoUnitId && r.photo_url).map(r => r.photo_url!)}
            onClose={() => setSelectedZip(null)}
            onPhotoSelect={setSelectedPhoto}
          />
        )
      )}

      {selectedHex && !pinPickerActive && !areaPickerActive && !routePickerActive && (
        <HexPanel entry={selectedHex} campaignId={campaign.id} onClose={() => setSelectedHex(null)} onPhotoSelect={setSelectedPhoto} refreshKey={hexPhotoVersion} />
      )}

      {areaPickerActive && (
        <>
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 border rounded-lg text-sm text-center shadow-xl whitespace-nowrap bg-zinc-900/95 border-zinc-700 text-zinc-200">
            Click areas on the map to include them in this event.
          </div>
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex gap-3">
            <button
              onClick={onAreaPickerConfirm}
              disabled={areaPickerCount === 0}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold rounded-lg shadow-lg transition-colors"
            >
              Confirm ({areaPickerCount})
            </button>
            <button
              onClick={onAreaPickerCancel}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-300 text-sm rounded-lg shadow-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {pinPickerActive && (
        <>
          <div className={`absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 border rounded-lg text-sm text-center shadow-xl whitespace-nowrap transition-colors duration-200 ${outOfZoneWarning
            ? "bg-red-950/95 border-red-700 text-red-300"
            : "bg-zinc-900/95 border-zinc-700 text-zinc-200"
            }`}>
            {outOfZoneWarning
              ? `Pin must stay within your ${pinPickerUnitLabel === "ZIP" ? "ZIP code" : "postcode"}`
              : pinPickerLabel ?? "Drag the pin to your exact cleanup location"}
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

      {routePickerActive && (
        <>
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 border rounded-lg text-sm text-center shadow-xl whitespace-nowrap bg-zinc-900/95 border-zinc-700 text-zinc-200 flex items-center gap-2">
            <span>
              {routePickerJustClosedLoop
                ? "Route closed — click Undo to reopen"
                : `Click the map to draw your cleanup route (${routePickerVertexCount} node${routePickerVertexCount === 1 ? "" : "s"})`}
            </span>
            <span
              title="This feature should work but is still being tested."
              className="text-xs text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5 font-normal cursor-help"
            >
              Beta
            </span>
          </div>
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex gap-3">
            <button
              onClick={handleUndoRouteVertex}
              disabled={routePickerVertexCount === 0}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 disabled:text-zinc-600 border border-zinc-600 text-zinc-300 text-sm rounded-lg shadow-lg transition-colors"
            >
              Undo
            </button>
            <button
              onClick={handleClearRouteVertices}
              disabled={routePickerVertexCount === 0}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 disabled:text-zinc-600 border border-zinc-600 text-zinc-300 text-sm rounded-lg shadow-lg transition-colors"
            >
              Clear
            </button>
            <button
              onClick={onRoutePickerFinish}
              disabled={routePickerVertexCount < 2}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold rounded-lg shadow-lg transition-colors"
            >
              Finish route
            </button>
            <button
              onClick={onRoutePickerCancel}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-300 text-sm rounded-lg shadow-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {!pinPickerActive && !areaPickerActive && !routePickerActive && (activeEvents.length > 0 || supportsZipSearch || supportsUkPostcodeSearch) && !(campaign.geo_unit?.includes("h3_hex") ?? false) && (
        <div className="absolute top-4 left-4 z-10 max-w-[calc(100vw-2rem)] sm:max-w-xs flex flex-col gap-2">
          {activeEvents.length > 0 && (
            <div className="flex items-center gap-1.5 sm:hidden">
              <button
                onClick={() => setEventsExpanded((e) => !e)}
                className="self-start px-3 py-1.5 bg-red-950/90 border border-red-700 rounded-lg backdrop-blur-sm text-red-300 text-xs font-semibold"
              >
                ⚡ {activeEvents.length} Event{activeEvents.length > 1 ? "s" : ""} {eventsExpanded ? "▲" : "▼"}
              </button>
              {onMobileStatsClick && (
                <button
                  onClick={onMobileStatsClick}
                  className="self-start px-3 py-1.5 bg-zinc-900/80 border border-zinc-700/60 rounded-lg backdrop-blur-sm text-zinc-300 text-xs font-semibold shadow-md"
                >
                  📊 Activity
                </button>
              )}
            </div>
          )}
          {activeEvents.length > 0 && (
            <div className={`${eventsExpanded ? "flex" : "hidden"} sm:flex flex-col gap-2 max-h-64 overflow-y-auto pr-0.5`}>
              {activeEvents.map((event) => {
                const primaryId = eventGeoUnitIdsRef.current[event.id]?.[0] ?? event.geo_unit_id ?? "";
                const centroid = eventCentroidsRef.current[primaryId];
                return (
                  <div
                    key={event.id}
                    onClick={() => {
                      if (centroid && map.current) {
                        map.current.flyTo({ center: [centroid.lng, centroid.lat], zoom: 13, duration: 800 });
                      }
                    }}
                    className={`px-3 py-2 bg-red-950/90 border border-red-700 rounded-lg backdrop-blur-sm transition-colors${centroid ? " cursor-pointer hover:bg-red-900/90" : ""}`}
                  >
                    <p className="text-red-300 text-xs font-semibold">{event.title}</p>
                    {event.description && (
                      <p className="text-red-400 text-xs mt-0.5">{event.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {activeEvents.length === 0 && onMobileStatsClick && (
            <button
              onClick={onMobileStatsClick}
              className="self-start sm:hidden px-3 py-1.5 bg-zinc-900/80 border border-zinc-700/60 rounded-lg backdrop-blur-sm text-zinc-300 text-xs font-semibold shadow-md"
            >
              📊 Activity
            </button>
          )}
          {(supportsZipSearch || supportsUkPostcodeSearch) && (
            <form onSubmit={handleGeoSearch} className="flex gap-1">
              <input
                type="text"
                inputMode={supportsZipSearch && !supportsUkPostcodeSearch ? "numeric" : "text"}
                maxLength={5}
                placeholder={
                  supportsZipSearch && supportsUkPostcodeSearch
                    ? "Go to ZIP or postcode"
                    : supportsZipSearch
                      ? "Go to ZIP"
                      : "Go to postcode"
                }
                value={geoSearch}
                onChange={(e) =>
                  setGeoSearch(
                    supportsZipSearch && !supportsUkPostcodeSearch
                      ? e.target.value.replace(/\D/g, "")
                      : e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                  )
                }
                className={`w-[8.5rem] px-2 py-1.5 text-xs bg-zinc-900/90 border rounded text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 ${geoSearchError ? "border-red-600" : "border-zinc-700"}`}
              />
              <button
                type="submit"
                disabled={!geoSearch}
                className="px-2.5 py-1.5 text-xs bg-zinc-800/90 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
              >
                Go
              </button>
            </form>
          )}
          {geoSearchError && <p className="text-xs text-red-400 px-1">{geoSearchError}</p>}
        </div>
      )}

      {tilesLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-2 py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
          <div className="w-3 h-3 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
          <span className="text-zinc-400 text-xs">Loading map…</span>
        </div>
      )}

      {!pinPickerActive && !areaPickerActive && !routePickerActive && !isCollage && (
        <div className="absolute bottom-14 right-4 z-10 flex flex-col items-start gap-1 sm:gap-1.5 text-xs">
          <button
            onClick={() => setLegendOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-zinc-900/80 rounded backdrop-blur-sm text-sm font-medium text-zinc-200 hover:bg-zinc-800/80"
          >
            <span>Legend</span>
            <span className="text-zinc-500">{legendOpen ? "▾" : "▸"}</span>
          </button>
          {legendOpen && (isChoropleth ? (
            <>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 rounded-sm bg-blue-600/80" />
                <span className="text-zinc-300">Democrat lean</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 rounded-sm bg-red-600/80" />
                <span className="text-zinc-300">Republican lean</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 rounded-sm bg-zinc-500/80" />
                <span className="text-zinc-300">Neutralized</span>
              </div>
            </>
          ) : isHeatmap ? (
            <>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-2 rounded-sm" style={{ background: "linear-gradient(to right, rgba(255,200,0,0.5), rgba(255,80,0,0.8), rgba(150,0,30,1))" }} />
                <span className="text-zinc-300">Unfollow density</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="text-zinc-500">Low → High</span>
              </div>
            </>
          ) : isHexBloom ? (
            <>
              {BLOOM_STAGE_LABELS.slice(1).map((label, i) => (
                <div key={i + 1} className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                  <span className="w-3 h-3 rounded-sm" style={{ background: BLOOM_STAGE_COLORS[i + 1] }} />
                  <span className="text-zinc-300">S{i + 1} {label}</span>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 rounded-full bg-emerald-500/90" />
                <span className="text-zinc-300">Cleanup logged</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="relative w-4 h-4 flex items-center justify-center flex-shrink-0">
                  <span className="absolute inset-0 rounded-full border-2 border-sky-400" />
                  <span className="w-2 h-2 rounded-full bg-emerald-500/90" />
                </span>
                <span className="text-zinc-300">Group event cleanup</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 rounded-sm bg-emerald-500/70" />
                <span className="text-zinc-300">Group territory</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 rounded-sm bg-blue-500/70" />
                <span className="text-zinc-300">Individual territory</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 rounded-sm border border-[#a1a1aa] bg-transparent" />
                <span className="text-zinc-300">Unclaimed</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 border border-orange-600 flex-shrink-0" />
                <span className="text-zinc-300">Open report</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm leading-none">🔥</span>
                </span>
                <span className="text-zinc-300">Hotspot</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-3 rounded-full border border-sky-400 bg-sky-400/10 flex-shrink-0" />
                <span className="text-zinc-300">Event check-in radius</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-0.5 rounded-full bg-[#0284c7] flex-shrink-0" />
                <span className="text-zinc-300">Group event route</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-zinc-900/80 rounded backdrop-blur-sm">
                <span className="w-3 h-0.5 rounded-full bg-[#f59e0b] flex-shrink-0" />
                <span className="text-zinc-300">Ad-hoc route</span>
              </div>
            </>
          ))}
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

      {selectedBusiness && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedBusiness(null)}
        >
          <div
            className="relative max-w-sm w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedBusiness(null)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 text-lg leading-none"
            >
              ×
            </button>
            <div className="flex items-center gap-3 mb-3">
              {selectedBusiness.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedBusiness.logo_url}
                  alt={selectedBusiness.name}
                  className="w-12 h-12 rounded-full object-cover border border-zinc-700/50"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-emerald-900/60 border border-emerald-700/50 flex items-center justify-center text-xl">
                  🏪
                </div>
              )}
              <h3 className="text-lg font-semibold text-white">{selectedBusiness.name}</h3>
            </div>
            {selectedBusiness.description && (
              <p className="text-sm text-zinc-300 mb-3">{selectedBusiness.description}</p>
            )}
            {selectedBusiness.activeOfferTitle && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-amber-900/30 border border-amber-700/50 flex items-center gap-2">
                <span className="text-base leading-none">🎁</span>
                <p className="text-sm text-amber-200">
                  <span className="font-semibold">Active offer:</span> {selectedBusiness.activeOfferTitle}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-1.5 text-sm">
              {selectedBusiness.website_url && (
                <a
                  href={selectedBusiness.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline"
                >
                  Visit website
                </a>
              )}
              {selectedBusiness.google_maps_url && (
                <a
                  href={selectedBusiness.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline"
                >
                  Open in Google Maps
                </a>
              )}
            </div>
            <Link
              href={`/partners/${selectedBusiness.slug}`}
              className="mt-3 flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-sm font-semibold shadow-sm transition-colors"
            >
              View offer & redeem
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}

      {selectedCleanupEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedCleanupEvent(null)}
        >
          <div
            className="relative max-w-sm w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedCleanupEvent(null)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 text-lg leading-none"
            >
              <span className="-translate-y-[2px]">×</span>
            </button>
            <div className="flex items-center gap-3 mb-3">
              {(selectedCleanupEvent.group_logo_url || selectedCleanupEvent.cohost_groups?.some((g) => g.group_logo_url)) && (
                <div className="flex items-center -space-x-2 shrink-0">
                  {selectedCleanupEvent.group_logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedCleanupEvent.group_logo_url}
                      alt={selectedCleanupEvent.group_name}
                      className="w-12 h-12 rounded-full object-cover border border-zinc-700/50 relative shrink-0"
                    />
                  )}
                  {selectedCleanupEvent.cohost_groups?.map((g) => (
                    g.group_logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={g.group_id}
                        src={g.group_logo_url}
                        alt={g.group_name}
                        className="w-12 h-12 rounded-full object-cover border border-zinc-700/50 relative shrink-0"
                      />
                    )
                  ))}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-white">{selectedCleanupEvent.title}</h3>
                  <span
                    title="This feature should work but is still being tested."
                    className="text-[10px] text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5 shrink-0 cursor-help"
                  >
                    Beta
                  </span>
                </div>
                <Link
                  href={`/groups/${selectedCleanupEvent.group_slug}`}
                  className="text-xs text-sky-400 hover:text-sky-300"
                >
                  {selectedCleanupEvent.group_name}
                </Link>
                {selectedCleanupEvent.cohost_groups && selectedCleanupEvent.cohost_groups.length > 0 && (
                  <p className="text-xs text-zinc-400 mt-0.5">
                    in partnership with{" "}
                    {selectedCleanupEvent.cohost_groups.map((g, i) => (
                      <span key={g.group_id}>
                        {i > 0 && ", "}
                        <Link href={`/groups/${g.group_slug}`} className="text-sky-400 hover:text-sky-300">
                          {g.group_name}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </div>
            {selectedCleanupEvent.is_past && (
              <p className="text-sm text-zinc-400 mb-1.5 flex items-center gap-1.5">
                <span>🕓</span> This event has ended — check-in is closed.
              </p>
            )}
            {selectedCleanupEvent.scheduled_start && (
              <p className="text-sm text-zinc-300 mb-1.5">
                {new Date(selectedCleanupEvent.scheduled_start).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {selectedCleanupEvent.scheduled_end &&
                  ` – ${new Date(selectedCleanupEvent.scheduled_end).toLocaleString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}`}
              </p>
            )}
            {selectedCleanupEvent.description && (
              <p className="text-sm text-zinc-300 mb-3">{selectedCleanupEvent.description}</p>
            )}
            {!!(
              (selectedCleanupEvent.total_small_bags ?? 0) + (selectedCleanupEvent.total_large_bags ?? 0)
            ) && (
                <p className="text-sm text-emerald-400 mb-3 flex items-center gap-1.5">
                  <span>🗑️</span>
                  {(selectedCleanupEvent.total_small_bags ?? 0) + (selectedCleanupEvent.total_large_bags ?? 0)} bags logged so far
                </p>
              )}
            <Link
              href={`/cleanup-events/${selectedCleanupEvent.id}`}
              className={`mt-3 flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors ${selectedCleanupEvent.is_past
                  ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
                  : "bg-sky-500 hover:bg-sky-400 text-sky-950"
                }`}
            >
              {selectedCleanupEvent.is_past ? "View Details" : "View & RSVP"}
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      )}

      {selectedEvent && (() => {
        const isTimedEvent = selectedEvent.event_type === "timed_event";
        const isHotspot = selectedEvent.event_type === "boss_spawn";
        const badgeEmoji = isTimedEvent ? "✨" : (isHotspot ? "🔥" : "⚡");
        const areaCount = eventGeoUnitIds?.[selectedEvent.id]?.length ?? (selectedEvent.geo_unit_id ? 1 : 0);
        const config = selectedEvent.effect_config;
        const multiplier =
          config && typeof config === "object" && !Array.isArray(config) && "multiplier" in config
            ? (config as { multiplier?: number }).multiplier
            : undefined;
        const cardBorderCls = isTimedEvent ? "border-amber-700/50" : "border-red-700/50";
        const badgeImgBorderCls = isTimedEvent ? "border-amber-700/50" : "border-red-700/50";
        const badgeBgCls = isTimedEvent ? "bg-amber-950/60 border-amber-700/50" : "bg-red-950/60 border-red-700/50";
        const infoTextCls = isTimedEvent ? "text-amber-300" : "text-red-300";
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setSelectedEvent(null)}
          >
            <div
              className={`relative max-w-sm w-full bg-zinc-900 border ${cardBorderCls} rounded-xl p-5 shadow-2xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedEvent(null)}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 text-lg leading-none"
              >
                ×
              </button>
              <div className="flex items-center gap-3 mb-3">
                {selectedEvent.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedEvent.image_url}
                    alt={selectedEvent.title}
                    className={`w-12 h-12 rounded-full object-cover border ${badgeImgBorderCls}`}
                  />
                ) : (
                  <div className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl ${badgeBgCls}`}>
                    {badgeEmoji}
                  </div>
                )}
                <h3 className="text-lg font-semibold text-white">{selectedEvent.title}</h3>
              </div>
              {selectedEvent.description && (
                <p className="text-sm text-zinc-300 mb-3">{selectedEvent.description}</p>
              )}
              <div className={`flex flex-col gap-1.5 text-sm ${infoTextCls}`}>
                {typeof multiplier === "number" && (
                  <p>{badgeEmoji} {multiplier}× score multiplier</p>
                )}
                <p>
                  {selectedEvent.ends_at
                    ? `Ends ${new Date(selectedEvent.ends_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                    : "No end date"}
                </p>
                {areaCount > 0 && (
                  <p>Applies to {areaCount} area{areaCount > 1 ? "s" : ""}</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
