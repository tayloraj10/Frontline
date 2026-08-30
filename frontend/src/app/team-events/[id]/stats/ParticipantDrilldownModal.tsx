"use client";

import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { getTeamEventParticipantDetail, type TeamEventParticipantDetail } from "@/lib/teamEvents";

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function ParticipantDrilldownModal({
  teamEventId,
  type,
  id,
  label,
  onClose,
}: {
  teamEventId: string;
  type: "user" | "group";
  id: string;
  label: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<TeamEventParticipantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getTeamEventParticipantDetail({ teamEventId, type, id, interval: "all", signal: controller.signal })
      .then(setDetail)
      .catch((err) => {
        if (err?.name !== "AbortError") setError("Failed to load details");
      });
    return () => controller.abort();
  }, [teamEventId, type, id]);

  const trendData =
    detail?.trend.map((t) => ({
      label: new Date(t.bucket_start).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      total_value: t.total_value,
    })) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4 shadow-elevation-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-zinc-100 truncate">{label}</h3>
          <button
            type="button"
            className="touch-manipulation active:scale-[0.95] text-zinc-500 text-sm px-2 py-1"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {!detail ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : (
          <>
            <div className="flex gap-4">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Points</p>
                <p className="text-xl font-black text-zinc-100">{fmt(detail.total_value)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Submissions</p>
                <p className="text-xl font-black text-zinc-100">{detail.submission_count}</p>
              </div>
            </div>

            {trendData.length > 1 && (
              <div>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Trend</p>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", fontSize: 12 }} />
                    <Line type="monotone" dataKey="total_value" stroke="#10b981" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {detail.breakdown.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">By type</p>
                {detail.breakdown.map((b) => (
                  <div key={b.contribution_type} className="flex items-center justify-between text-sm text-zinc-300">
                    <span className="capitalize">{b.contribution_type.replace(/_/g, " ")}</span>
                    <span className="text-zinc-400">
                      {fmt(b.total_value)} pts · {b.submission_count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
