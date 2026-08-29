"use client";

import { useEffect, useState } from "react";
import { getTeamEventStats, type TeamEventTeamStats } from "@/lib/teamEvents";
import { resolveTeamColor } from "@/lib/teamColors";

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function StatsClient({
  teamEventId,
  initialStats,
}: {
  teamEventId: string;
  initialStats: TeamEventTeamStats[];
}) {
  const [stats, setStats] = useState(initialStats);

  useEffect(() => {
    const interval = setInterval(() => {
      getTeamEventStats(teamEventId).then(setStats).catch(() => {});
    }, 20000);
    return () => clearInterval(interval);
  }, [teamEventId]);

  if (stats.length === 0) {
    return <p className="text-sm text-zinc-500">No teams yet.</p>;
  }

  return (
    <div className="space-y-6">
      {stats.map((team) => (
        <div key={team.team_id} className="border border-zinc-800 rounded-xl p-4 space-y-3 shadow-elevation-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              {team.color && (
                <span
                  className="inline-block w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: resolveTeamColor(team.color) }}
                />
              )}
              {team.name}
            </span>
            <span className="text-sm font-black text-zinc-100">
              {fmt(team.total_value)} pts · {team.submission_count} submissions
            </span>
          </div>

          {team.groups.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Groups</p>
              {team.groups.map((g) => (
                <div key={g.group_id} className="flex items-center justify-between text-sm text-zinc-300">
                  <span>
                    {g.group_name} <span className="text-zinc-600">({g.member_count} members)</span>
                  </span>
                  <span className="text-zinc-400">
                    {fmt(g.total_value)} pts · {g.submission_count}
                  </span>
                </div>
              ))}
            </div>
          )}

          {team.individuals.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Individuals</p>
              {team.individuals.map((i) => (
                <div key={i.user_id} className="flex items-center justify-between text-sm text-zinc-300">
                  <span>{i.username ?? "Unknown"}</span>
                  <span className="text-zinc-400">
                    {fmt(i.total_value)} pts · {i.submission_count}
                  </span>
                </div>
              ))}
            </div>
          )}

          {team.groups.length === 0 && team.individuals.length === 0 && (
            <p className="text-xs text-zinc-600">No participants yet.</p>
          )}
        </div>
      ))}
    </div>
  );
}
