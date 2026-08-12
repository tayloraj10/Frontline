"use client";

import { useEffect, useState } from "react";
import { formatPoints } from "@/lib/formatPoints";
import type { ExternalFocusRequest } from "./GroupGeoStatsExplorer";
import { type StatsWindow, statsWindowParams } from "../statsWindow";

interface Member {
  user_id: string;
  username: string | null;
  display_name: string | null;
  total_value: number;
  contribution_count: number;
  small_bags: number;
  large_bags: number;
}

interface GeoChild {
  geo_unit_id: string;
  unit_type: string;
  unit_id: string;
  display_name: string | null;
  total_value: number;
}

interface TypeChild {
  key: string;
  label: string;
  total_value: number;
}

type Row = { key: string; label: string; value: number };

const DONUT_COLORS = [
  "#22c55e",
  "#0ea5e9",
  "#a855f7",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
  "#6366f1",
  "#84cc16",
  "#eab308",
];

function DonutChart({
  rows,
  valueLabel,
  onSegmentClick,
}: {
  rows: Row[];
  valueLabel: string;
  onSegmentClick?: (key: string) => void;
}) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (rows.length === 0 || total <= 0) {
    return <div className="text-center text-zinc-600 text-sm py-8">No data yet.</div>;
  }
  const top = rows.slice(0, 8);
  const topTotal = top.reduce((sum, r) => sum + r.value, 0);
  const other = total - topTotal;
  const segments = other > 0 ? [...top, { key: "__other__", label: "Other", value: other }] : top;

  const size = 200;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offsets: number[] = [];
  segments.reduce((cumulative, s) => {
    offsets.push(cumulative);
    return cumulative + s.value / total;
  }, 0);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={strokeWidth} />
          {segments.map((s, i) => {
            const frac = s.value / total;
            const dash = frac * circumference;
            const dashOffset = -offsets[i] * circumference;
            const color = s.key === "__other__" ? "#3f3f46" : DONUT_COLORS[i % DONUT_COLORS.length];
            const clickable = s.key !== "__other__" && !!onSegmentClick;
            return (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={dashOffset}
                onClick={clickable ? () => onSegmentClick(s.key) : undefined}
                className={clickable ? "cursor-pointer transition-opacity hover:opacity-75" : undefined}
              >
                <title>
                  {s.label}: {formatPoints(s.value)} {valueLabel} ({Math.round(frac * 100)}%)
                  {clickable ? " — click to drill in" : ""}
                </title>
              </circle>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-zinc-100 tabular-nums">{formatPoints(total)}</span>
          <span className="text-[10px] text-zinc-500">{valueLabel}</span>
        </div>
      </div>
      <div className="w-full space-y-1.5">
        {segments.map((s, i) => {
          const color = s.key === "__other__" ? "#3f3f46" : DONUT_COLORS[i % DONUT_COLORS.length];
          const pct = Math.round((s.value / total) * 100);
          const clickable = s.key !== "__other__" && !!onSegmentClick;
          return (
            <button
              key={s.key}
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onSegmentClick(s.key) : undefined}
              className={`flex items-center gap-2 text-xs w-full text-left ${
                clickable ? "hover:text-zinc-100 touch-manipulation" : "cursor-default"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="flex-1 min-w-0 truncate text-zinc-300">{s.label}</span>
              <span className="text-zinc-500 tabular-nums shrink-0">{pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Slice = "member" | "bag_size" | "borough" | "neighborhood" | "zip" | "type";

const SLICE_LABELS: Record<Slice, string> = {
  member: "By Member",
  bag_size: "By Bag Size",
  borough: "By Borough",
  neighborhood: "By Neighborhood",
  zip: "By Zip Code",
  type: "By Type",
};

export default function GroupStatBreakdownCharts({
  groupId,
  campaignId,
  window,
  viewerUserId,
  fastapiUrl,
  members,
  smallBags,
  largeBags,
  onDrillGeo,
}: {
  groupId: string;
  campaignId: string;
  window: StatsWindow;
  viewerUserId: string;
  fastapiUrl: string;
  members: Member[];
  smallBags: number;
  largeBags: number;
  onDrillGeo: (req: ExternalFocusRequest) => void;
}) {
  const [slice, setSlice] = useState<Slice>("member");
  const [boroughs, setBoroughs] = useState<GeoChild[] | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<GeoChild[] | null>(null);
  const [zips, setZips] = useState<GeoChild[] | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [typeChildren, setTypeChildren] = useState<TypeChild[] | null>(null);
  const [typeLoading, setTypeLoading] = useState(false);

  useEffect(() => {
    if (slice !== "borough" && slice !== "neighborhood" && slice !== "zip") return;
    const setLevel = slice === "borough" ? setBoroughs : slice === "neighborhood" ? setNeighborhoods : setZips;
    const controller = new AbortController();
    setGeoLoading(true);
    const params = new URLSearchParams({
      ...statsWindowParams(window),
      campaign_id: campaignId,
      viewer_user_id: viewerUserId,
      children_level: slice,
    });
    fetch(`${fastapiUrl}/api/groups/${groupId}/stats/geo-stats?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setLevel(json?.children ?? []))
      .catch(() => {})
      .finally(() => setGeoLoading(false));
    return () => controller.abort();
  }, [slice, groupId, campaignId, window, viewerUserId, fastapiUrl]);

  useEffect(() => {
    if (slice !== "type") return;
    const controller = new AbortController();
    setTypeLoading(true);
    const params = new URLSearchParams({
      ...statsWindowParams(window),
      campaign_id: campaignId,
      viewer_user_id: viewerUserId,
    });
    fetch(`${fastapiUrl}/api/groups/${groupId}/stats/type-breakdown?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setTypeChildren(json?.children ?? []))
      .catch(() => {})
      .finally(() => setTypeLoading(false));
    return () => controller.abort();
  }, [slice, groupId, campaignId, window, viewerUserId, fastapiUrl]);

  const memberRows: Row[] = members
    .filter((m) => m.total_value > 0)
    .map((m) => ({ key: m.user_id, label: m.display_name ?? m.username ?? "Unknown", value: m.total_value }));

  const bagRows: Row[] = [
    { key: "small", label: "Small bags", value: smallBags },
    { key: "large", label: "Large bags", value: largeBags },
  ];

  function geoRows(children: GeoChild[] | null): Row[] {
    return (children ?? [])
      .filter((c) => c.total_value > 0)
      .map((c) => ({ key: c.geo_unit_id, label: c.display_name ?? c.unit_id, value: c.total_value }));
  }

  function handleGeoClick(children: GeoChild[] | null, geoUnitId: string) {
    const child = (children ?? []).find((c) => c.geo_unit_id === geoUnitId);
    if (!child) return;
    onDrillGeo({
      unit: {
        geo_unit_id: child.geo_unit_id,
        unit_type: child.unit_type,
        unit_id: child.unit_id,
        display_name: child.display_name,
      },
      token: Date.now(),
    });
  }

  function typeRows(children: TypeChild[] | null): Row[] {
    return (children ?? []).filter((c) => c.total_value > 0).map((c) => ({ key: c.key, label: c.label, value: c.total_value }));
  }

  const availableSlices: Slice[] = [
    "member",
    ...(smallBags + largeBags > 0 ? (["bag_size"] as Slice[]) : []),
    "borough",
    "neighborhood",
    "zip",
    "type",
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 flex-wrap">
        {availableSlices.map((s) => (
          <button
            key={s}
            onClick={() => setSlice(s)}
            className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors touch-manipulation ${
              slice === s
                ? "bg-emerald-900/40 border-emerald-700/60 text-emerald-300"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
            }`}
          >
            {SLICE_LABELS[s]}
          </button>
        ))}
      </div>

      {slice === "member" && <DonutChart rows={memberRows} valueLabel="pts" />}
      {slice === "bag_size" && <DonutChart rows={bagRows} valueLabel="bags" />}
      {slice === "borough" &&
        (geoLoading ? (
          <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
        ) : (
          <DonutChart
            rows={geoRows(boroughs)}
            valueLabel="pts"
            onSegmentClick={(key) => handleGeoClick(boroughs, key)}
          />
        ))}
      {slice === "neighborhood" &&
        (geoLoading ? (
          <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
        ) : (
          <DonutChart
            rows={geoRows(neighborhoods)}
            valueLabel="pts"
            onSegmentClick={(key) => handleGeoClick(neighborhoods, key)}
          />
        ))}
      {slice === "zip" &&
        (geoLoading ? (
          <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
        ) : (
          <DonutChart rows={geoRows(zips)} valueLabel="pts" onSegmentClick={(key) => handleGeoClick(zips, key)} />
        ))}
      {slice === "type" &&
        (typeLoading ? (
          <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
        ) : (
          <DonutChart rows={typeRows(typeChildren)} valueLabel="pts" />
        ))}
    </div>
  );
}
