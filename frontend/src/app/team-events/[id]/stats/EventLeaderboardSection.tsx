"use client";

import { useEffect, useState } from "react";
import {
  getTeamEventLeaderboard,
  type StatsInterval,
  type TeamEventLeaderboardIndividual,
  type TeamEventLeaderboardGroup,
} from "@/lib/teamEvents";
import { resolveTeamColor } from "@/lib/teamColors";
import { computeRanks } from "@/lib/ranking";
import RankBadge from "@/components/ui/RankBadge";
import Avatar from "@/components/ui/Avatar";
import ParticipantDrilldownModal from "./ParticipantDrilldownModal";

const INTERVALS: { value: StatsInterval; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function TeamDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: resolveTeamColor(color) }}
    />
  );
}

export default function EventLeaderboardSection({ teamEventId }: { teamEventId: string }) {
  const [tab, setTab] = useState<"individuals" | "groups">("individuals");
  const [interval, setInterval] = useState<StatsInterval>("all");
  const [individuals, setIndividuals] = useState<TeamEventLeaderboardIndividual[] | null>(null);
  const [groups, setGroups] = useState<TeamEventLeaderboardGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<{ type: "user" | "group"; id: string; label: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (tab === "individuals") {
      getTeamEventLeaderboard({ teamEventId, scope: "individuals", interval, signal: controller.signal })
        .then((rows) => {
          setIndividuals(rows);
          setError(null);
        })
        .catch((err) => {
          if (err?.name !== "AbortError") setError("Failed to load leaderboard");
        });
    } else {
      getTeamEventLeaderboard({ teamEventId, scope: "groups", interval, signal: controller.signal })
        .then((rows) => {
          setGroups(rows);
          setError(null);
        })
        .catch((err) => {
          if (err?.name !== "AbortError") setError("Failed to load leaderboard");
        });
    }
    return () => controller.abort();
  }, [teamEventId, tab, interval]);

  const rows: { total_value: number }[] | null = tab === "individuals" ? individuals : groups;
  const ranks = rows ? computeRanks(rows, (r) => r.total_value) : [];

  return (
    <div className="border border-zinc-800 rounded-xl p-4 space-y-3 shadow-elevation-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Leaderboard</h2>
        <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
          {(["individuals", "groups"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`touch-manipulation active:scale-[0.97] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500"
              }`}
              onClick={() => setTab(t)}
            >
              {t === "individuals" ? "Individuals" : "Groups"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
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

      {error && <p className="text-sm text-red-400">{error}</p>}

      {!rows ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-600">No results for this window yet.</p>
      ) : (
        <div className="space-y-1">
          {tab === "individuals"
            ? (individuals ?? []).map((row, i) => (
                <button
                  key={row.user_id}
                  type="button"
                  className="touch-manipulation active:scale-[0.98] w-full flex items-center gap-2.5 py-1.5 text-left"
                  onClick={() =>
                    setDrilldown({ type: "user", id: row.user_id, label: row.display_name ?? row.username })
                  }
                >
                  <RankBadge rank={ranks[i]} />
                  <Avatar avatarUrl={row.avatar_url} name={row.display_name ?? row.username} size="sm" />
                  <span className="flex-1 min-w-0 truncate text-sm text-zinc-200">
                    {row.display_name ?? row.username}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
                    <TeamDot color={row.team_color} />
                    {row.team_name}
                  </span>
                  <span className="text-sm font-bold text-zinc-100 tabular-nums shrink-0">{fmt(row.total_value)}</span>
                </button>
              ))
            : (groups ?? []).map((row, i) => (
                <button
                  key={row.group_id}
                  type="button"
                  className="touch-manipulation active:scale-[0.98] w-full flex items-center gap-2.5 py-1.5 text-left"
                  onClick={() => setDrilldown({ type: "group", id: row.group_id, label: row.group_name })}
                >
                  <RankBadge rank={ranks[i]} />
                  <Avatar avatarUrl={row.logo_url} name={row.group_name} size="sm" />
                  <span className="flex-1 min-w-0 truncate text-sm text-zinc-200">
                    {row.group_name} <span className="text-zinc-600">({row.member_count})</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-zinc-500 shrink-0">
                    <TeamDot color={row.team_color} />
                    {row.team_name}
                  </span>
                  <span className="text-sm font-bold text-zinc-100 tabular-nums shrink-0">{fmt(row.total_value)}</span>
                </button>
              ))}
        </div>
      )}

      {drilldown && (
        <ParticipantDrilldownModal
          teamEventId={teamEventId}
          type={drilldown.type}
          id={drilldown.id}
          label={drilldown.label}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
