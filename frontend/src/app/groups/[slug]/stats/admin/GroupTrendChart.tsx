"use client";

import { useState } from "react";
import { formatPoints } from "@/lib/formatPoints";

export interface TrendBucket {
  date: string;
  total_value: number;
  contribution_count: number;
  small_bags: number;
  large_bags: number;
  pounds: number;
}

type MetricKey = "total_value" | "contribution_count" | "bags" | "pounds";

const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: "total_value", label: "Points", unit: "pts" },
  { key: "contribution_count", label: "Logs", unit: "logs" },
  { key: "bags", label: "Bags", unit: "bags" },
  { key: "pounds", label: "Pounds", unit: "lbs" },
];

function metricValue(b: TrendBucket, key: MetricKey): number {
  if (key === "bags") return b.small_bags + b.large_bags;
  if (key === "pounds") return Math.round(b.pounds);
  return b[key];
}

function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatHour(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric" });
}

export default function GroupTrendChart({
  buckets,
  granularity,
  rangeStart,
  loading,
}: {
  buckets: TrendBucket[];
  granularity: "hour" | "day";
  rangeStart: string | null;
  loading?: boolean;
}) {
  const [metric, setMetric] = useState<MetricKey>("total_value");
  const activeMetric = METRICS.find((m) => m.key === metric)!;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors touch-manipulation ${
                metric === m.key
                  ? "bg-emerald-900/40 border-emerald-700/60 text-emerald-300"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {metric === "bags" && (
          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
              Small
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 shrink-0" />
              Large
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
      ) : !rangeStart || buckets.length === 0 ? (
        <div className="text-center text-zinc-600 text-sm py-8">No activity in this period.</div>
      ) : (
        <TrendBars buckets={buckets} granularity={granularity} rangeStart={rangeStart} metric={metric} unit={activeMetric.unit} />
      )}
    </div>
  );
}

function TrendBars({
  buckets,
  granularity,
  rangeStart,
  metric,
  unit,
}: {
  buckets: TrendBucket[];
  granularity: "hour" | "day";
  rangeStart: string;
  metric: MetricKey;
  unit: string;
}) {
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

  const isBags = metric === "bags";
  const byBucket = new Map<number, number>();
  const byBucketSmall = new Map<number, number>();
  const byBucketLarge = new Map<number, number>();
  for (const b of buckets) {
    const d = new Date(b.date);
    const key =
      granularity === "hour"
        ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())
        : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (isBags) {
      byBucketSmall.set(key, (byBucketSmall.get(key) ?? 0) + b.small_bags);
      byBucketLarge.set(key, (byBucketLarge.get(key) ?? 0) + b.large_bags);
    } else {
      byBucket.set(key, (byBucket.get(key) ?? 0) + metricValue(b, metric));
    }
  }

  const formatLabel = granularity === "hour" ? formatHour : formatShortDate;
  const max = isBags
    ? Math.max(1, ...keys.map((k) => Math.max(byBucketSmall.get(k) ?? 0, byBucketLarge.get(k) ?? 0)))
    : Math.max(1, ...keys.map((k) => byBucket.get(k) ?? 0));
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
          const x = padding + i * barWidth;
          if (isBags) {
            const small = byBucketSmall.get(key) ?? 0;
            const large = byBucketLarge.get(key) ?? 0;
            const smallHeight = small > 0 ? Math.max(2, (small / max) * (height - padding * 2)) : 0;
            const largeHeight = large > 0 ? Math.max(2, (large / max) * (height - padding * 2)) : 0;
            const halfWidth = (barWidth - 2) / 2;
            return (
              <g key={key}>
                <rect
                  x={x + 1}
                  y={height - padding - smallHeight}
                  width={Math.max(1, halfWidth - 0.5)}
                  height={smallHeight}
                  rx={1}
                  className={small > 0 ? "fill-emerald-500" : "fill-zinc-800"}
                />
                <rect
                  x={x + 1 + halfWidth + 0.5}
                  y={height - padding - largeHeight}
                  width={Math.max(1, halfWidth - 0.5)}
                  height={largeHeight}
                  rx={1}
                  className={large > 0 ? "fill-sky-500" : "fill-zinc-800"}
                />
                <rect x={x} y={padding} width={barWidth} height={height - padding * 2} fill="transparent">
                  <title>
                    {formatLabel(key)}: {formatPoints(small)} small / {formatPoints(large)} large {unit}
                  </title>
                </rect>
              </g>
            );
          }
          const value = byBucket.get(key) ?? 0;
          const barHeight = value > 0 ? Math.max(2, (value / max) * (height - padding * 2)) : 0;
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
              <rect x={x} y={padding} width={barWidth} height={height - padding * 2} fill="transparent">
                <title>
                  {formatLabel(key)}: {formatPoints(value)} {unit}
                </title>
              </rect>
            </g>
          );
        })}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="stroke-zinc-800" strokeWidth={1} />
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
              style={{ left: `${isFirst ? Math.max(leftPct, 4) : isLast ? Math.min(leftPct, 96) : leftPct}%` }}
            >
              {formatLabel(keys[i])}
            </span>
          );
        })}
      </div>
    </div>
  );
}
