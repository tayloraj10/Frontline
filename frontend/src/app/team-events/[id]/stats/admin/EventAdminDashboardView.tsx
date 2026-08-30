"use client";

import { useEffect, useState } from "react";
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
import { getTeamEventAdminSummary, type StatsInterval, type TeamEventAdminSummary } from "@/lib/teamEvents";
import { resolveTeamColor } from "@/lib/teamColors";

const CHART_COLORS = { emerald: "#10b981", sky: "#0ea5e9", amber: "#f59e0b", zinc: "#71717a" };

const INTERVALS: { value: StatsInterval; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-zinc-800 rounded-xl overflow-hidden mb-6 shadow-elevation-2 bg-zinc-950">
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
        <span className="text-sm font-semibold text-zinc-300">{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5 shadow-elevation-1">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-bold text-zinc-100 tabular-nums">{value}</div>
    </div>
  );
}

export default function EventAdminDashboardView({ teamEventId }: { teamEventId: string }) {
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

  const trendData =
    data?.trend.map((t) => ({
      label: new Date(t.bucket_start).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      total_value: t.total_value,
      submission_count: t.submission_count,
    })) ?? [];

  const breakdownData =
    data?.breakdown.map((b) => ({
      type: b.contribution_type.replace(/_/g, " "),
      total_value: b.total_value,
    })) ?? [];

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 mb-6">
        {INTERVALS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`touch-manipulation active:scale-[0.97] shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
              interval === opt.value
                ? "border-sky-500 text-sky-400 bg-sky-500/10"
                : "border-zinc-800 text-zinc-500"
            }`}
            onClick={() => setInterval(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400 mb-4">Failed to load dashboard.</p>}

      {!data ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : (
        <>
          <Section title="Overview">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <KpiTile label="Total points" value={fmt(data.total_value)} />
              <KpiTile label="Submissions" value={fmt(data.submission_count)} />
              <KpiTile label="Active participants" value={fmt(data.active_participants)} />
              <KpiTile label="Pending review" value={fmt(data.pending_review_count)} />
              <KpiTile label="Total participants" value={fmt(data.total_participants)} />
              <KpiTile label="Groups involved" value={fmt(data.total_groups)} />
              <KpiTile label="Teams" value={fmt(data.total_teams)} />
            </div>
          </Section>

          {trendData.length > 1 && (
            <Section title="Trend">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#71717a" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#71717a" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", fontSize: 12 }} />
                  <Line type="monotone" dataKey="total_value" name="Points" stroke={CHART_COLORS.emerald} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="submission_count" name="Submissions" stroke={CHART_COLORS.sky} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </Section>
          )}

          {breakdownData.length > 0 && (
            <Section title="Breakdown by type">
              <ResponsiveContainer width="100%" height={Math.max(140, breakdownData.length * 40)}>
                <BarChart data={breakdownData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#71717a" }} />
                  <YAxis type="category" dataKey="type" tick={{ fontSize: 11, fill: "#71717a" }} width={100} />
                  <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", fontSize: 12 }} />
                  <Bar dataKey="total_value" name="Points" fill={CHART_COLORS.amber} />
                </BarChart>
              </ResponsiveContainer>
            </Section>
          )}

          <Section title="Teams">
            <div className="space-y-2">
              {data.teams.map((t) => (
                <div key={t.team_id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-zinc-200">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: resolveTeamColor(t.color) }}
                    />
                    {t.name}
                    <span className="text-zinc-600">({t.participant_count})</span>
                  </span>
                  <span className="font-bold text-zinc-100 tabular-nums">
                    {fmt(t.total_value)} pts · {t.submission_count}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
