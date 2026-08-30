"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatPoints } from "@/lib/formatPoints";
import { getTeamEventAdminSummary, type StatsInterval, type TeamEventAdminSummary } from "@/lib/teamEvents";

const CHART_COLORS = { emerald: "#10b981", sky: "#0ea5e9", amber: "#f59e0b" };

const INTERVALS: { value: StatsInterval; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

interface Props {
  teamEventId: string;
}

function KpiTile({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5 shadow-elevation-1">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-bold text-zinc-100 tabular-nums">{value}</div>
      {sublabel && <div className="text-[11px] text-zinc-600 tabular-nums">{sublabel}</div>}
    </div>
  );
}

function TopContributorsTable({ rows }: { rows: TeamEventAdminSummary["top_contributors"] }) {
  if (rows.length === 0) return <p className="text-sm text-zinc-600">No submissions yet.</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((c, i) => (
          <tr key={c.user_id} className="border-b border-zinc-900 last:border-0">
            <td className="py-1.5 text-zinc-600 w-6 tabular-nums">{i + 1}</td>
            <td className="py-1.5 text-zinc-200 truncate">{c.display_name || c.username || "Someone"}</td>
            <td className="py-1.5 text-right tabular-nums font-semibold text-zinc-100">{formatPoints(c.total_value)} pts</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function EventStatsSection({ teamEventId }: Props) {
  const [interval, setInterval] = useState<StatsInterval>("all");
  const [data, setData] = useState<TeamEventAdminSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getTeamEventAdminSummary({ teamEventId, interval, signal: controller.signal })
      .then((summary) => {
        setData(summary);
        setError(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [teamEventId, interval]);

  const trendData = useMemo(
    () =>
      data?.trend.map((t) => ({
        label: new Date(t.bucket_start).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        total_value: t.total_value,
        submission_count: t.submission_count,
      })) ?? [],
    [data]
  );

  const breakdownData = useMemo(
    () =>
      data?.breakdown.map((b) => ({
        type: b.contribution_type.replace(/_/g, " "),
        total_value: b.total_value,
      })) ?? [],
    [data]
  );

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 mb-4">
        {INTERVALS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`touch-manipulation active:scale-[0.97] shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
              interval === opt.value ? "border-sky-500 text-sky-400 bg-sky-500/10" : "border-zinc-800 text-zinc-500"
            }`}
            onClick={() => setInterval(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400 mb-4">Failed to load stats.</p>}

      {data && (
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <KpiTile label="Total points" value={formatPoints(data.total_value)} />
              <KpiTile label="Submissions" value={data.submission_count.toLocaleString()} />
              <KpiTile label="Active participants" value={data.active_participants.toLocaleString()} />
              <KpiTile label="Total participants" value={data.total_participants.toLocaleString()} />
              <KpiTile label="Groups involved" value={data.total_groups.toLocaleString()} />
              <KpiTile label="Teams" value={data.total_teams.toLocaleString()} />
              <KpiTile
                label="Bags"
                value={(data.total_small_bags + data.total_large_bags).toLocaleString()}
                sublabel={`${data.total_small_bags.toLocaleString()} small · ${data.total_large_bags.toLocaleString()} large`}
              />
              <KpiTile label="Pounds collected" value={data.total_pounds.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
            </div>
          </div>

          {trendData.length > 1 && (
            <div>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Points &amp; submissions</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#71717a" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#71717a" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", fontSize: 12 }} />
                  <Line type="monotone" dataKey="total_value" name="Points" stroke={CHART_COLORS.emerald} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="submission_count" name="Submissions" stroke={CHART_COLORS.sky} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {breakdownData.length > 1 && (
            <div>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Breakdown by type</h3>
              <ResponsiveContainer width="100%" height={Math.max(140, breakdownData.length * 40)}>
                <BarChart data={breakdownData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#71717a" }} />
                  <YAxis type="category" dataKey="type" tick={{ fontSize: 11, fill: "#71717a" }} width={100} />
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", fontSize: 12 }} />
                  <Bar dataKey="total_value" name="Points" fill={CHART_COLORS.amber} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Top contributors</h3>
            <TopContributorsTable rows={data.top_contributors} />
          </div>
        </div>
      )}
    </div>
  );
}
