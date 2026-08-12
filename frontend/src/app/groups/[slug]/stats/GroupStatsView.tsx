"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatPoints } from "@/lib/formatPoints";
import Avatar from "@/components/ui/Avatar";
import ShareCard from "@/components/groups/ShareCard";
import MapSnapshotCard from "@/components/groups/MapSnapshotCard";
import { downloadBlob, shareImage } from "@/lib/share";
import IntervalPicker from "./IntervalPicker";
import { type StatsWindow, detailedIntervalLabel, statsWindowParams } from "./statsWindow";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const SNAPSHOT_WIDTH = 720;
const SNAPSHOT_HEIGHT = 960;

// Fraction of the snapshot's height reserved for MapSnapshotCard's top logo/name
// gradient and captionSnapshot's bottom caption bar, respectively. Shared between
// fitBounds padding and the caption compositing so the two can't drift out of sync
// and data never renders underneath either overlay.
const SNAPSHOT_TOP_RESERVED_FRAC = 0.14;
const SNAPSHOT_BOTTOM_RESERVED_FRAC = 0.22;

// Emerald ramp, low -> high activity, same scale as the leaderboard's GeoStatsMap.
const COLOR_RAMP = ["#1f2937", "#14532d", "#166534", "#15803d", "#22c55e", "#4ade80"];

const LEVEL_TILE_INFO: Record<"zip" | "neighborhood" | "borough", { path: string; sourceLayer: string }> = {
  borough: { path: "nyc-boroughs", sourceLayer: "nyc_boroughs" },
  neighborhood: { path: "nyc-neighborhoods", sourceLayer: "nyc_neighborhoods" },
  zip: { path: "", sourceLayer: "territories" },
};

type MapSnapshotType = "zip" | "neighborhood" | "borough" | "activity" | "heatmap";

const CHOROPLETH_TYPES: ("zip" | "neighborhood" | "borough")[] = ["zip", "neighborhood", "borough"];

const MAP_SNAPSHOT_TYPE_LABELS: Record<MapSnapshotType, string> = {
  zip: "Zip Codes",
  neighborhood: "Neighborhoods",
  borough: "Boroughs",
  activity: "Activity Map",
  heatmap: "Heat Map",
};

const MAP_SNAPSHOT_UNIT_NOUN: Record<"zip" | "neighborhood" | "borough", string> = {
  zip: "zip code",
  neighborhood: "neighborhood",
  borough: "borough",
};

function mapStyleUrl(id: string) {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

function proxiedImageUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

interface GeoPoint {
  latitude: number;
  longitude: number;
  geo_unit_id: string | null;
}

interface GeoChild {
  geo_unit_id: string;
  unit_type: string;
  unit_id: string;
  display_name: string | null;
  centroid_lat: number | null;
  centroid_lng: number | null;
  total_value: number;
}

interface EventSummaryRow {
  id: string;
  title: string;
  lat: number | null;
  lng: number | null;
  is_past: boolean;
  is_ongoing: boolean;
}

function colorForIntensity(frac: number): string {
  const idx = Math.min(COLOR_RAMP.length - 1, Math.floor(frac * COLOR_RAMP.length));
  return COLOR_RAMP[idx];
}

/** Colors only geo units that actually have activity; everything else falls back
 * transparent so empty polygons never paint over the map (this was the "wonky tiles" bug). */
function buildChoroplethFillExpr(activeChildren: GeoChild[]): unknown[] | string {
  if (activeChildren.length === 0) return "#27272a";
  const max = Math.max(...activeChildren.map((c) => c.total_value));
  const matchExpr: unknown[] = ["match", ["get", "geo_unit_id"]];
  for (const c of activeChildren) {
    matchExpr.push(c.geo_unit_id, colorForIntensity(max > 0 ? c.total_value / max : 0));
  }
  matchExpr.push("transparent");
  return matchExpr;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const ACTIVITY_LEGEND_ITEMS: { color: string; label: string }[] = [
  { color: "#22c55e", label: "Contribution" },
  { color: "#3b82f6", label: "Upcoming event" },
  { color: "#f59e0b", label: "Happening now" },
  { color: "#71717a", label: "Past event" },
];

/** Draws a bottom gradient bar + caption text onto the exported map PNG (2D canvas compositing, since the source is a WebGL canvas). */
async function captionSnapshot(dataUrl: string, caption: string, subcaption: string, legend?: boolean): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0);

  const legendRowFrac = legend ? 0.038 : 0;
  const barHeight = img.height * (SNAPSHOT_BOTTOM_RESERVED_FRAC + legendRowFrac);
  const gradient = ctx.createLinearGradient(0, img.height - barHeight, 0, img.height);
  gradient.addColorStop(0, "rgba(9,9,11,0)");
  gradient.addColorStop(1, "rgba(9,9,11,0.92)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, img.height - barHeight, img.width, barHeight);

  const pad = img.width * 0.06;
  ctx.textBaseline = "alphabetic";

  const textBottom = img.height - pad - img.height * legendRowFrac;
  const captionY = textBottom - img.height * 0.045;

  ctx.fillStyle = "#34d399";
  ctx.font = `700 ${Math.round(img.width * 0.032)}px sans-serif`;
  ctx.fillText(caption.toUpperCase(), pad, captionY);

  ctx.fillStyle = "#f4f4f5";
  ctx.font = `900 ${Math.round(img.width * 0.055)}px sans-serif`;
  ctx.fillText(subcaption, pad, textBottom);

  if (legend) {
    const dotRadius = img.width * 0.011;
    const fontSize = Math.round(img.width * 0.021);
    const dotTextGap = img.width * 0.01;
    const itemGap = img.width * 0.022;
    ctx.font = `600 ${fontSize}px sans-serif`;

    const itemWidths = ACTIVITY_LEGEND_ITEMS.map(
      (item) => dotRadius * 2 + dotTextGap + ctx.measureText(item.label).width,
    );
    const totalWidth = itemWidths.reduce((a, b) => a + b, 0) + itemGap * (ACTIVITY_LEGEND_ITEMS.length - 1);

    const legendY = img.height - pad * 0.75;
    const boxPadX = img.width * 0.02;
    const boxPadY = img.height * 0.011;
    const boxHeight = fontSize + boxPadY * 2;
    const boxTop = legendY - fontSize * 0.78 - boxPadY;
    const boxLeft = (img.width - totalWidth) / 2 - boxPadX;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    roundRect(ctx, boxLeft, boxTop, totalWidth + boxPadX * 2, boxHeight, boxHeight / 2);
    ctx.fill();

    let x = (img.width - totalWidth) / 2;
    for (let i = 0; i < ACTIVITY_LEGEND_ITEMS.length; i++) {
      const item = ACTIVITY_LEGEND_ITEMS[i];
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x + dotRadius, legendY - dotRadius * 0.7, dotRadius, 0, Math.PI * 2);
      ctx.fill();
      x += dotRadius * 2 + dotTextGap;
      ctx.fillStyle = "#f4f4f5";
      ctx.fillText(item.label, x, legendY);
      x += itemWidths[i] - (dotRadius * 2 + dotTextGap) + itemGap;
    }
  }

  return canvas.toDataURL("image/png");
}

async function renderMapSnapshot(opts: {
  mapType: MapSnapshotType;
  campaignId: string;
  fastapiUrl: string;
  timeframeLabel: string;
  points: GeoPoint[];
  children: GeoChild[];
  events: EventSummaryRow[];
  bbox: [number, number, number, number] | null;
}): Promise<string | null> {
  const { mapType, campaignId, fastapiUrl, timeframeLabel, points, children, events, bbox } = opts;
  if (!MAPTILER_KEY) return null;

  const isChoropleth = (CHOROPLETH_TYPES as MapSnapshotType[]).includes(mapType);
  const activeChildren = children.filter((c) => c.total_value > 0);

  const extentCoords: [number, number][] = points.map((p) => [p.longitude, p.latitude]);
  if (!isChoropleth) {
    for (const e of events) {
      if (e.lat != null && e.lng != null) extentCoords.push([e.lng, e.lat]);
    }
  }
  if (isChoropleth ? activeChildren.length === 0 : extentCoords.length === 0) return null;

  const initialCenter: [number, number] = isChoropleth
    ? bbox
      ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
      : activeChildren.find((c) => c.centroid_lat != null && c.centroid_lng != null)
        ? [
            activeChildren.find((c) => c.centroid_lng != null)!.centroid_lng as number,
            activeChildren.find((c) => c.centroid_lat != null)!.centroid_lat as number,
          ]
        : [-73.98, 40.72]
    : extentCoords[0];

  const maplibregl = (await import("maplibre-gl")).default;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = `${SNAPSHOT_WIDTH}px`;
  container.style.height = `${SNAPSHOT_HEIGHT}px`;
  document.body.appendChild(container);

  const cleanup = (map: InstanceType<typeof maplibregl.Map>) => {
    map.remove();
    document.body.removeChild(container);
  };

  const rawResult = await new Promise<string | null>((resolve) => {
    const map = new maplibregl.Map({
      container,
      style: mapStyleUrl("outdoor"),
      center: initialCenter,
      zoom: 12,
      interactive: false,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    map.on("error", () => {
      cleanup(map);
      resolve(null);
    });

    map.on("load", () => {
      const bounds = new maplibregl.LngLatBounds();
      if (isChoropleth && bbox) {
        bounds.extend([bbox[0], bbox[1]]);
        bounds.extend([bbox[2], bbox[3]]);
      } else {
        for (const c of extentCoords) bounds.extend(c);
      }

      if (isChoropleth) {
        const info = LEVEL_TILE_INFO[mapType as "zip" | "neighborhood" | "borough"];
        const tileUrl =
          mapType === "zip"
            ? `${fastapiUrl}/api/tiles/${campaignId}/{z}/{x}/{y}.mvt`
            : `${fastapiUrl}/api/tiles/${info.path}/{z}/{x}/{y}.mvt`;

        map.addSource("snapshot-choropleth", {
          type: "vector",
          tiles: [tileUrl],
          promoteId: "geo_unit_id",
          minzoom: 0,
          maxzoom: 16,
        });
        map.addLayer({
          id: "snapshot-choropleth-fill",
          type: "fill",
          source: "snapshot-choropleth",
          "source-layer": info.sourceLayer,
          paint: { "fill-color": buildChoroplethFillExpr(activeChildren) as string, "fill-opacity": 0.78 },
        });
        const matchedIds = activeChildren.map((c) => c.geo_unit_id);
        map.addLayer({
          id: "snapshot-choropleth-line",
          type: "line",
          source: "snapshot-choropleth",
          "source-layer": info.sourceLayer,
          filter:
            matchedIds.length > 0
              ? ["in", ["get", "geo_unit_id"], ["literal", matchedIds]]
              : ["==", ["get", "geo_unit_id"], "__none__"],
          paint: { "line-color": "#09090b", "line-width": 1 },
        });

        const labelFeatures = activeChildren
          .filter((c) => c.centroid_lat != null && c.centroid_lng != null)
          .map((c) => ({
            type: "Feature" as const,
            properties: { display_name: c.display_name ?? c.unit_id },
            geometry: {
              type: "Point" as const,
              coordinates: [c.centroid_lng as number, c.centroid_lat as number],
            },
          }));
        map.addSource("snapshot-choropleth-labels", {
          type: "geojson",
          data: { type: "FeatureCollection", features: labelFeatures },
        });
        map.addLayer({
          id: "snapshot-choropleth-labels-layer",
          type: "symbol",
          source: "snapshot-choropleth-labels",
          layout: {
            "text-field": ["get", "display_name"],
            "text-size": 21,
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#f4f4f5",
            "text-halo-color": "#09090b",
            "text-halo-width": 2,
          },
        });
      } else if (mapType === "heatmap") {
        const heatFeatures = [
          ...points.map((p) => ({
            type: "Feature" as const,
            properties: { weight: 1 },
            geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] },
          })),
          ...events
            .filter((e) => e.lat != null && e.lng != null)
            .map((e) => ({
              type: "Feature" as const,
              properties: { weight: 3 },
              geometry: { type: "Point" as const, coordinates: [e.lng as number, e.lat as number] },
            })),
        ];
        map.addSource("snapshot-heatmap-points", {
          type: "geojson",
          data: { type: "FeatureCollection", features: heatFeatures },
        });
        map.addLayer({
          id: "snapshot-heatmap-layer",
          type: "heatmap",
          source: "snapshot-heatmap-points",
          paint: {
            "heatmap-weight": ["get", "weight"],
            "heatmap-intensity": 1.8,
            "heatmap-radius": 55,
            "heatmap-opacity": 0.9,
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(0,0,0,0)",
              0.15,
              "#166534",
              0.35,
              "#22c55e",
              0.55,
              "#4ade80",
              0.75,
              "#facc15",
              1,
              "#ef4444",
            ],
          },
        });
      } else {
        map.addSource("snapshot-activity-points", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: points.map((p) => ({
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
            })),
          },
        });
        map.addLayer({
          id: "snapshot-activity-points-layer",
          type: "circle",
          source: "snapshot-activity-points",
          paint: {
            "circle-radius": 9,
            "circle-color": "#22c55e",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#09090b",
          },
        });

        const eventFeatures = events
          .filter((e) => e.lat != null && e.lng != null)
          .map((e) => ({
            type: "Feature" as const,
            properties: {
              title: e.title,
              color: e.is_past ? "#71717a" : e.is_ongoing ? "#f59e0b" : "#3b82f6",
            },
            geometry: { type: "Point" as const, coordinates: [e.lng as number, e.lat as number] },
          }));
        map.addSource("snapshot-activity-events", {
          type: "geojson",
          data: { type: "FeatureCollection", features: eventFeatures },
          cluster: true,
          clusterRadius: 60,
          // A static, non-interactive snapshot never gets zoomed further in to split a
          // cluster apart, so clustering must hold at any zoom level the map ends up at.
          clusterMaxZoom: 24,
        });
        map.addLayer({
          id: "snapshot-activity-events-cluster-circle",
          type: "circle",
          source: "snapshot-activity-events",
          filter: ["has", "point_count"],
          paint: {
            "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 10, 24],
            "circle-color": "#22c55e",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#09090b",
          },
        });
        map.addLayer({
          id: "snapshot-activity-events-cluster-count",
          type: "symbol",
          source: "snapshot-activity-events",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 16,
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#09090b" },
        });
        map.addLayer({
          id: "snapshot-activity-events-cluster-label",
          type: "symbol",
          source: "snapshot-activity-events",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["concat", ["get", "point_count_abbreviated"], " events here"],
            "text-size": 20,
            "text-offset": [0, 1.8],
            "text-anchor": "top",
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#f4f4f5",
            "text-halo-color": "#09090b",
            "text-halo-width": 2.5,
          },
        });
        map.addLayer({
          id: "snapshot-activity-events-circle",
          type: "circle",
          source: "snapshot-activity-events",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 9,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#09090b",
          },
        });
        map.addLayer({
          id: "snapshot-activity-events-label",
          type: "symbol",
          source: "snapshot-activity-events",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "text-field": ["get", "title"],
            "text-size": 20,
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#f4f4f5",
            "text-halo-color": "#09090b",
            "text-halo-width": 2,
          },
        });
      }

      map.fitBounds(bounds, {
        padding: {
          top: SNAPSHOT_HEIGHT * SNAPSHOT_TOP_RESERVED_FRAC + 30,
          bottom: SNAPSHOT_HEIGHT * SNAPSHOT_BOTTOM_RESERVED_FRAC + 30,
          left: 50,
          right: 50,
        },
        animate: false,
        maxZoom: isChoropleth ? 15 : 16,
      });

      map.once("idle", () => {
        const dataUrl = map.getCanvas().toDataURL("image/png");
        cleanup(map);
        resolve(dataUrl);
      });
    });
  });

  if (!rawResult) return null;
  const subcaption = isChoropleth
    ? `${activeChildren.length} ${MAP_SNAPSHOT_UNIT_NOUN[mapType as "zip" | "neighborhood" | "borough"]}${
        activeChildren.length === 1 ? "" : "s"
      } active`
    : (() => {
        // Round to ~11m precision so points/events sitting on top of each other (e.g. a
        // cluster of nearby cleanup events) count as one "location" instead of one per point,
        // matching what the map visually shows rather than the raw row count.
        const uniqueLocations = new Set(extentCoords.map(([lng, lat]) => `${lng.toFixed(4)},${lat.toFixed(4)}`))
          .size;
        return `${uniqueLocations} location${uniqueLocations === 1 ? "" : "s"} active`;
      })();
  return captionSnapshot(rawResult, timeframeLabel, subcaption, mapType === "activity");
}

interface Member {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_value: number;
  contribution_count: number;
  small_bags: number;
  large_bags: number;
  pounds: number;
}

interface CampaignStats {
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  aggregate: {
    total_value: number;
    contribution_count: number;
    unique_contributors: number;
    small_bags: number;
    large_bags: number;
    pounds: number;
  };
  members: Member[];
}

interface StatsResponse {
  group_id: string;
  interval: string;
  is_member: boolean;
  is_admin: boolean;
  campaigns: CampaignStats[];
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 min-w-[90px] rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 text-center">
      <div className="text-lg font-black text-zinc-100 tabular-nums">{value}</div>
      <div className="text-[11px] text-zinc-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function BagSplitChip({ smallBags, largeBags }: { smallBags: number; largeBags: number }) {
  return (
    <div className="flex-1 min-w-[120px] rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
      <div className="text-[11px] text-zinc-500 uppercase tracking-wide text-center mb-1.5">Bag Split</div>
      <div className="flex items-center justify-center gap-3">
        <div className="text-center">
          <div className="text-sm font-bold text-zinc-100 tabular-nums">{smallBags.toLocaleString()}</div>
          <div className="text-[10px] text-zinc-600">small</div>
        </div>
        <div className="w-px h-6 bg-zinc-800" />
        <div className="text-center">
          <div className="text-sm font-bold text-zinc-100 tabular-nums">{largeBags.toLocaleString()}</div>
          <div className="text-[10px] text-zinc-600">large</div>
        </div>
      </div>
    </div>
  );
}

export default function GroupStatsView({
  groupId,
  groupName,
  groupLogoUrl,
  viewerUserId,
  isAdmin,
  fastapiUrl,
  slug,
}: {
  groupId: string;
  groupName: string;
  groupLogoUrl: string | null;
  viewerUserId: string | null;
  isAdmin: boolean;
  fastapiUrl: string;
  slug: string;
}) {
  const [statsWindow, setStatsWindow] = useState<StatsWindow>({ interval: "month", anchor: new Date() });
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [shareCamp, setShareCamp] = useState<CampaignStats | null>(null);
  const [shareMode, setShareMode] = useState<"card" | "map">("card");
  const [shareBusy, setShareBusy] = useState<"share" | "download" | null>(null);
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapType, setMapType] = useState<MapSnapshotType>("zip");
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const params = new URLSearchParams(statsWindowParams(statsWindow));
    if (viewerUserId) params.set("viewer_user_id", viewerUserId);
    fetch(`${fastapiUrl}/api/groups/${groupId}/stats?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json) => setData(json))
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [groupId, viewerUserId, fastapiUrl, statsWindow]);

  function exportCsv() {
    if (!viewerUserId) return;
    const params = new URLSearchParams({ ...statsWindowParams(statsWindow), viewer_user_id: viewerUserId });
    window.open(`${fastapiUrl}/api/groups/${groupId}/stats/export.csv?${params}`, "_blank");
  }

  function exportXlsx() {
    if (!viewerUserId) return;
    const params = new URLSearchParams({ ...statsWindowParams(statsWindow), viewer_user_id: viewerUserId });
    window.open(`${fastapiUrl}/api/groups/${groupId}/stats/export.xlsx?${params}`, "_blank");
  }

  function openShareCard(camp: CampaignStats) {
    setMapImageUrl(null);
    setShareMode("card");
    setShareCamp(camp);
  }

  async function openMapSnapshot(camp: CampaignStats, type: MapSnapshotType = "zip") {
    setMapImageUrl(null);
    setShareMode("map");
    setShareCamp(camp);
    setMapType(type);
    setMapLoading(true);
    try {
      const params = new URLSearchParams({ ...statsWindowParams(statsWindow), campaign_id: camp.campaign_id });
      const pointsRes = await fetch(`${fastapiUrl}/api/groups/${groupId}/stats/geo-points?${params}`);
      if (!pointsRes.ok) return;
      const pointsJson: { points: GeoPoint[] } = await pointsRes.json();

      let children: GeoChild[] = [];
      let events: EventSummaryRow[] = [];
      let bbox: [number, number, number, number] | null = null;
      if (type === "activity" || type === "heatmap") {
        const eventsRes = await fetch(`${fastapiUrl}/api/groups/${groupId}/stats/events-summary?${params}`);
        if (eventsRes.ok) events = await eventsRes.json();
      } else {
        const breakdownParams = new URLSearchParams({
          ...statsWindowParams(statsWindow),
          campaign_id: camp.campaign_id,
          level: type,
        });
        const childrenRes = await fetch(`${fastapiUrl}/api/groups/${groupId}/stats/geo-breakdown?${breakdownParams}`);
        if (childrenRes.ok) {
          const childrenJson: { children: GeoChild[] } = await childrenRes.json();
          children = childrenJson.children;
        }
        const activeIds = children.filter((c) => c.total_value > 0).map((c) => c.geo_unit_id);
        if (activeIds.length > 0) {
          const bboxRes = await fetch(
            `${fastapiUrl}/api/geo-units/bbox?ids=${encodeURIComponent(activeIds.join(","))}`
          );
          if (bboxRes.ok) {
            const bboxJson: { bbox: [number, number, number, number] } = await bboxRes.json();
            bbox = bboxJson.bbox;
          }
        }
      }

      setMapImageUrl(
        await renderMapSnapshot({
          mapType: type,
          campaignId: camp.campaign_id,
          fastapiUrl,
          timeframeLabel: detailedIntervalLabel(statsWindow),
          points: pointsJson.points,
          children,
          events,
          bbox,
        })
      );
    } finally {
      setMapLoading(false);
    }
  }

  function handleMapTypeChange(type: MapSnapshotType) {
    if (!shareCamp || type === mapType || mapLoading) return;
    openMapSnapshot(shareCamp, type);
  }

  async function renderCardBlob(): Promise<Blob | null> {
    if (!cardRef.current) return null;
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true });
    const res = await fetch(dataUrl);
    return res.blob();
  }

  async function handleShareCard() {
    if (!shareCamp) return;
    setShareBusy("share");
    try {
      const blob = await renderCardBlob();
      if (!blob) return;
      await shareImage(blob, `${shareCamp.campaign_slug}-group-stats.png`, {
        title: `${groupName} · ${shareCamp.campaign_name}`,
        text: `Here's what ${groupName} has accomplished on the ${shareCamp.campaign_name} campaign!`,
      });
    } finally {
      setShareBusy(null);
    }
  }

  async function handleDownloadCard() {
    if (!shareCamp) return;
    setShareBusy("download");
    try {
      const blob = await renderCardBlob();
      if (!blob) return;
      downloadBlob(blob, `${shareCamp.campaign_slug}-group-stats.png`);
    } finally {
      setShareBusy(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <IntervalPicker window={statsWindow} onChange={setStatsWindow} />
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link
              href={`/groups/${slug}/stats/admin`}
              className="px-3 py-1.5 text-xs border border-emerald-700/60 text-emerald-400 rounded-lg shadow-elevation-1 transition-[background-color,border-color] duration-150 hover:text-emerald-300 hover:border-emerald-500 touch-manipulation"
            >
              Deep Dive →
            </Link>
            <button
              onClick={exportCsv}
              className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 rounded-lg shadow-elevation-1 transition-[background-color,border-color] duration-150 hover:text-zinc-200 hover:border-zinc-500 touch-manipulation"
            >
              Export CSV
            </button>
            <button
              onClick={exportXlsx}
              className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 rounded-lg shadow-elevation-1 transition-[background-color,border-color] duration-150 hover:text-zinc-200 hover:border-zinc-500 touch-manipulation"
            >
              Export Excel
            </button>
          </div>
        )}
      </div>

      {loading && <div className="text-center text-zinc-600 text-sm py-10">Loading…</div>}
      {!loading && error && (
        <div className="text-center text-zinc-600 text-sm py-10">Couldn&apos;t load stats. Try again later.</div>
      )}
      {!loading && !error && data && data.campaigns.length === 0 && (
        <div className="text-center text-zinc-600 text-sm py-10">
          No contributions logged for this group in this time range.
        </div>
      )}

      {!loading &&
        !error &&
        data?.campaigns.map((camp) => (
          <div
            key={camp.campaign_id}
            className="border border-zinc-800 rounded-xl overflow-hidden mb-6 shadow-elevation-2 bg-zinc-950"
          >
            <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-zinc-300">{camp.campaign_name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openShareCard(camp)}
                  className="px-2.5 py-1 text-[11px] font-medium border border-zinc-700 text-zinc-400 rounded-lg transition-[background-color,border-color] duration-150 hover:text-zinc-200 hover:border-zinc-500 touch-manipulation"
                >
                  Create Share Card
                </button>
                <button
                  onClick={() => openMapSnapshot(camp)}
                  className="px-2.5 py-1 text-[11px] font-medium border border-zinc-700 text-zinc-400 rounded-lg transition-[background-color,border-color] duration-150 hover:text-zinc-200 hover:border-zinc-500 touch-manipulation"
                >
                  Create Map Snapshot
                </button>
              </div>
            </div>

            <div className="px-5 py-4 flex gap-2 flex-wrap border-b border-zinc-800/60">
              <StatChip label="Points" value={formatPoints(camp.aggregate.total_value)} />
              <StatChip label="Logs" value={camp.aggregate.contribution_count.toLocaleString()} />
              <StatChip label="Members" value={camp.aggregate.unique_contributors.toLocaleString()} />
              <StatChip
                label="Bags"
                value={(camp.aggregate.small_bags + camp.aggregate.large_bags).toLocaleString()}
              />
              {(camp.aggregate.small_bags > 0 || camp.aggregate.large_bags > 0) && (
                <BagSplitChip smallBags={camp.aggregate.small_bags} largeBags={camp.aggregate.large_bags} />
              )}
              <StatChip label="Pounds" value={Math.round(camp.aggregate.pounds).toLocaleString()} />
            </div>

            {camp.members.length === 0 ? (
              <div className="px-5 py-8 text-center text-zinc-600 text-sm">No member activity in this range.</div>
            ) : (
              <ul className="divide-y divide-zinc-800/50">
                {camp.members.map((m, i) => (
                  <li key={m.user_id} className="px-5 py-3 flex items-center gap-3">
                    <span className="text-zinc-600 text-sm w-6 text-center tabular-nums shrink-0">{i + 1}</span>
                    <Avatar
                      avatarUrl={m.avatar_url}
                      name={m.display_name ?? m.username ?? "?"}
                      username={m.username}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-200 truncate font-medium">
                        {m.display_name ?? m.username ?? "Unknown"}
                      </div>
                      <div className="text-xs text-zinc-600">
                        {m.contribution_count} contribution{m.contribution_count === 1 ? "" : "s"}
                        {m.small_bags + m.large_bags > 0
                          ? ` · ${m.small_bags + m.large_bags} bags (${m.small_bags}S / ${m.large_bags}L)`
                          : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold text-zinc-300 tabular-nums">
                        {formatPoints(m.total_value)}
                      </div>
                      <div className="text-xs text-zinc-600">pts</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

      {shareCamp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-elevation-3">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-300">
                {shareMode === "map" ? "Map Snapshot" : "Share Card"}
              </span>
              <button
                onClick={() => {
                  setShareCamp(null);
                  setMapImageUrl(null);
                }}
                className="text-zinc-500 hover:text-zinc-300 text-sm touch-manipulation"
              >
                Close
              </button>
            </div>

            {shareMode === "map" && (
              <div className="mb-3 flex items-center gap-1 flex-wrap justify-center">
                {(Object.keys(MAP_SNAPSHOT_TYPE_LABELS) as MapSnapshotType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => handleMapTypeChange(t)}
                    disabled={mapLoading}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors touch-manipulation disabled:opacity-50 ${
                      mapType === t
                        ? "bg-emerald-900/40 border-emerald-700/60 text-emerald-300"
                        : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
                    }`}
                  >
                    {MAP_SNAPSHOT_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-center">
              {shareMode === "map" ? (
                <MapSnapshotCard
                  ref={cardRef}
                  groupName={groupName}
                  groupLogoUrl={groupLogoUrl ? proxiedImageUrl(groupLogoUrl) : null}
                  mapImageUrl={mapImageUrl}
                  loading={mapLoading}
                />
              ) : (
                <ShareCard
                  ref={cardRef}
                  groupName={groupName}
                  groupLogoUrl={groupLogoUrl ? proxiedImageUrl(groupLogoUrl) : null}
                  campaignName={shareCamp.campaign_name}
                  intervalLabel={detailedIntervalLabel(statsWindow)}
                  totalValue={shareCamp.aggregate.total_value}
                  contributionCount={shareCamp.aggregate.contribution_count}
                  uniqueContributors={shareCamp.aggregate.unique_contributors}
                  smallBags={shareCamp.aggregate.small_bags}
                  largeBags={shareCamp.aggregate.large_bags}
                  pounds={shareCamp.aggregate.pounds}
                />
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleDownloadCard}
                disabled={shareBusy !== null}
                className="flex-1 px-3 py-2 text-xs font-medium border border-zinc-700 text-zinc-300 rounded-lg transition-[background-color,border-color] duration-150 hover:border-zinc-500 disabled:opacity-50 touch-manipulation"
              >
                {shareBusy === "download" ? "Downloading…" : "Download"}
              </button>
              <button
                onClick={handleShareCard}
                disabled={shareBusy !== null}
                className="flex-1 px-3 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg transition-colors duration-150 hover:bg-emerald-500 disabled:opacity-50 touch-manipulation"
              >
                {shareBusy === "share" ? "Sharing…" : "Share"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
