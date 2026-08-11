"use client";

import { useEffect, useState } from "react";
import { formatPoints } from "@/lib/formatPoints";

export type StatKind = "pts" | "contributions" | "contributors" | "groups";

interface TopUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  total_value: number;
  contribution_count: number;
}

interface TopGroup {
  group_id: string;
  name: string | null;
  total_value: number;
  contribution_count: number;
}

interface ChildUnit {
  geo_unit_id: string;
  unit_type: string;
  unit_id: string;
  display_name: string | null;
  total_value: number;
  contribution_count: number;
  unique_contributors: number;
  unique_groups: number;
  small_bags: number;
  large_bags: number;
  pounds: number;
}

interface TrendBucket {
  date: string;
  total_value: number;
}

function HorizontalBarList({
  rows,
  valueLabel,
}: {
  rows: { key: string; label: string; value: number }[];
  valueLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) {
    return <div className="text-center text-zinc-600 text-sm py-8">No data yet.</div>;
  }
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs text-zinc-300 truncate font-medium">{r.label}</span>
            <span className="text-xs text-zinc-500 tabular-nums shrink-0">
              {formatPoints(r.value)} {valueLabel}
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800/80 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

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
  rows: { key: string; label: string; value: number }[];
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

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatHour(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric" });
}

function TrendChart({
  buckets,
  granularity,
  rangeStart,
}: {
  buckets: TrendBucket[];
  granularity: "hour" | "day";
  rangeStart: string | null;
}) {
  if (!rangeStart || buckets.length === 0) {
    return <div className="text-center text-zinc-600 text-sm py-8">No activity in this period.</div>;
  }

  const start = new Date(rangeStart);
  const now = new Date();
  const stepMs = granularity === "hour" ? 3_600_000 : 86_400_000;
  const startKey =
    granularity === "hour"
      ? Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), start.getUTCHours())
      : Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endKey =
    granularity === "hour"
      ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours())
      : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const keys: number[] = [];
  for (let t = startKey; t <= endKey; t += stepMs) keys.push(t);

  const byBucket = new Map<number, number>();
  for (const b of buckets) {
    const d = new Date(b.date);
    const key =
      granularity === "hour"
        ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())
        : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    byBucket.set(key, (byBucket.get(key) ?? 0) + b.total_value);
  }

  const formatLabel = granularity === "hour" ? formatHour : formatShortDate;
  const max = Math.max(1, ...keys.map((k) => byBucket.get(k) ?? 0));
  const width = 560;
  const height = 160;
  const padding = 24;
  const barWidth = (width - padding * 2) / keys.length;
  const maxLabels = 6;
  const step = (keys.length - 1) / (maxLabels - 1);
  const labelIndices = Array.from(
    new Set(Array.from({ length: Math.min(maxLabels, keys.length) }, (_, k) => Math.round(k * step)))
  );

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[160px]" preserveAspectRatio="none">
        {keys.map((key, i) => {
          const value = byBucket.get(key) ?? 0;
          const barHeight = value > 0 ? Math.max(2, (value / max) * (height - padding * 2)) : 0;
          const x = padding + i * barWidth;
          const y = height - padding - barHeight;
          return (
            <g key={key}>
              <rect
                x={x + 1}
                y={y}
                width={Math.max(1, barWidth - 2)}
                height={barHeight}
                rx={1}
                className={value > 0 ? "fill-emerald-500" : "fill-zinc-800"}
              />
              <rect
                x={x}
                y={padding}
                width={barWidth}
                height={height - padding * 2}
                fill="transparent"
                className="cursor-default"
              >
                <title>
                  {formatLabel(key)}: {formatPoints(value)} points
                </title>
              </rect>
            </g>
          );
        })}
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          className="stroke-zinc-800"
          strokeWidth={1}
        />
      </svg>
      <div className="relative h-4 text-[10px] text-zinc-600 mt-1">
        {labelIndices.map((i) => {
          const leftPct = ((padding + i * barWidth + barWidth / 2) / width) * 100;
          const isFirst = i === labelIndices[0];
          const isLast = i === labelIndices[labelIndices.length - 1];
          return (
            <span
              key={i}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{
                left: `${isFirst ? Math.max(leftPct, 4) : isLast ? Math.min(leftPct, 96) : leftPct}%`,
              }}
            >
              {formatLabel(keys[i])}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function StatDetailModal({
  kind,
  unit,
  campaignId,
  fastapiUrl,
  interval,
  focusGeoUnitId,
  topUsers,
  topGroups,
  childUnits,
  levelLabel,
  onClose,
  onDrill,
}: {
  kind: StatKind;
  unit: string;
  campaignId: string;
  fastapiUrl: string;
  interval: "today" | "week" | "month" | "all";
  focusGeoUnitId: string | null;
  topUsers: TopUser[];
  topGroups: TopGroup[];
  childUnits: ChildUnit[] | null;
  levelLabel: string | null;
  onClose: () => void;
  onDrill?: (child: ChildUnit) => void;
}) {
  const [trend, setTrend] = useState<TrendBucket[] | null>(null);
  const [trendGranularity, setTrendGranularity] = useState<"hour" | "day">("day");
  const [trendRangeStart, setTrendRangeStart] = useState<string | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const hasGeoBreakdown = !!childUnits && childUnits.length > 0;
  const hasPeopleBreakdown = topUsers.length > 0 || topGroups.length > 0;
  const [contribView, setContribView] = useState<"geo" | "people">(hasGeoBreakdown ? "geo" : "people");

  useEffect(() => {
    if (kind !== "pts") return;
    const controller = new AbortController();
    setTrendLoading(true);
    const params = new URLSearchParams({ interval });
    if (focusGeoUnitId) params.set("focus_geo_unit_id", focusGeoUnitId);
    fetch(`${fastapiUrl}/api/campaigns/${campaignId}/geo-stats/trend?${params}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setTrend(json?.buckets ?? []);
        setTrendGranularity(json?.granularity === "hour" ? "hour" : "day");
        setTrendRangeStart(json?.range_start ?? null);
      })
      .catch(() => {})
      .finally(() => setTrendLoading(false));
    return () => controller.abort();
  }, [kind, campaignId, fastapiUrl, interval, focusGeoUnitId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const intervalLabels: Record<"today" | "week" | "month" | "all", string> = {
    today: "today",
    week: "this week",
    month: "this month",
    all: "all-time",
  };
  const titles: Record<StatKind, string> = {
    pts: `Points — ${intervalLabels[interval]}`,
    contributions:
      contribView === "geo" && hasGeoBreakdown ? `Contributions by ${levelLabel ?? "area"}` : "Contributions by contributor",
    contributors: "Top individuals by points",
    groups: "Top groups by points",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-elevation-3 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-950">
          <span className="text-sm font-semibold text-zinc-200">{titles[kind]}</span>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-sm px-2 py-1 -mr-2 touch-manipulation"
          >
            Close
          </button>
        </div>
        <div className="px-5 py-5">
          {kind === "pts" &&
            (trendLoading ? (
              <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
            ) : (
              <TrendChart buckets={trend ?? []} granularity={trendGranularity} rangeStart={trendRangeStart} />
            ))}

          {kind === "contributions" && (
            <>
              {hasGeoBreakdown && hasPeopleBreakdown && (
                <div className="flex items-center gap-1 mb-4">
                  <button
                    onClick={() => setContribView("geo")}
                    className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors touch-manipulation ${
                      contribView === "geo"
                        ? "bg-emerald-900/40 border-emerald-700/60 text-emerald-300"
                        : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
                    }`}
                  >
                    By {levelLabel ?? "area"}
                  </button>
                  <button
                    onClick={() => setContribView("people")}
                    className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors touch-manipulation ${
                      contribView === "people"
                        ? "bg-emerald-900/40 border-emerald-700/60 text-emerald-300"
                        : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
                    }`}
                  >
                    By contributor
                  </button>
                </div>
              )}

              {contribView === "geo" && hasGeoBreakdown ? (
                <DonutChart
                  rows={childUnits!
                    .slice(0, 10)
                    .map((c) => ({ key: c.geo_unit_id, label: c.display_name ?? "Unknown", value: c.contribution_count }))}
                  valueLabel="logs"
                  onSegmentClick={
                    onDrill
                      ? (key) => {
                          const child = childUnits!.find((c) => c.geo_unit_id === key);
                          if (child) {
                            onDrill(child);
                            onClose();
                          }
                        }
                      : undefined
                  }
                />
              ) : (
                <DonutChart
                  rows={[...topUsers, ...topGroups]
                    .sort((a, b) => b.contribution_count - a.contribution_count)
                    .slice(0, 10)
                    .map((r) => ({
                      key: "user_id" in r ? r.user_id : r.group_id,
                      label: "username" in r ? r.display_name ?? r.username ?? "Unknown" : r.name ?? "Unknown Group",
                      value: r.contribution_count,
                    }))}
                  valueLabel="logs"
                />
              )}
            </>
          )}

          {kind === "contributors" && (
            <HorizontalBarList
              rows={topUsers
                .slice(0, 10)
                .map((u) => ({ key: u.user_id, label: u.display_name ?? u.username ?? "Unknown", value: u.total_value }))}
              valueLabel={unit}
            />
          )}

          {kind === "groups" && (
            <HorizontalBarList
              rows={topGroups
                .slice(0, 10)
                .map((g) => ({ key: g.group_id, label: g.name ?? "Unknown Group", value: g.total_value }))}
              valueLabel={unit}
            />
          )}
        </div>
      </div>
    </div>
  );
}
