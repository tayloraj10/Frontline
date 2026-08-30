"use client";

import { useEffect, useState } from "react";
import { getTeamEventGeo, type TeamEventGeoEntry } from "@/lib/teamEvents";
import { resolveTeamColor } from "@/lib/teamColors";
import { computeRanks } from "@/lib/ranking";
import { formatPoints } from "@/lib/formatPoints";
import RankBadge from "@/components/ui/RankBadge";
import EventTerritoryMap from "./EventTerritoryMap";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 rounded-lg px-3 py-2.5 text-left">
      <div className="text-base font-bold text-zinc-100 tabular-nums">{value}</div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}

export default function EventGeoSection({ teamEventId }: { teamEventId: string }) {
  const [entries, setEntries] = useState<TeamEventGeoEntry[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getTeamEventGeo(teamEventId, controller.signal)
      .then(setEntries)
      .catch((err) => {
        if (err?.name !== "AbortError") setEntries([]);
      });
    return () => controller.abort();
  }, [teamEventId]);

  if (entries === null) return null;

  if (entries.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-xl p-4 space-y-1 shadow-elevation-1">
        <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Territory</h2>
        <p className="text-xs text-zinc-600">
          No teams have an assigned area for this event yet. Assign areas from the event&apos;s admin page to see
          per-area point breakdowns here.
        </p>
      </div>
    );
  }

  const ranks = computeRanks(entries, (e) => e.total_value);
  const totalValue = entries.reduce((sum, e) => sum + e.total_value, 0);
  const totalSubmissions = entries.reduce((sum, e) => sum + e.submission_count, 0);
  const teamCount = new Set(entries.map((e) => e.team_id)).size;

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1">
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
        <span className="text-sm font-semibold text-zinc-300">Territory</span>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="points" value={formatPoints(totalValue)} />
          <StatTile label="areas" value={entries.length.toLocaleString()} />
          <StatTile label="teams" value={teamCount.toLocaleString()} />
        </div>

        <EventTerritoryMap entries={entries} />

        <ul className="divide-y divide-zinc-800/50 -mx-5">
          {entries.map((e, i) => (
            <li key={`${e.team_id}-${e.geo_unit_id}`}>
              <div className="px-5 py-3 flex items-center gap-3">
                <RankBadge rank={ranks[i]} />
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: resolveTeamColor(e.team_color) }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{e.geo_display_name ?? e.geo_unit_id}</p>
                  <p className="text-xs text-zinc-600 truncate">{e.team_name}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-right">
                  <div className="hidden sm:block text-right">
                    <div className="text-xs font-semibold text-zinc-300 tabular-nums">{formatPoints(e.total_value)}</div>
                    <div className="text-xs text-zinc-600">pts</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold text-zinc-400 tabular-nums">{e.submission_count}</div>
                    <div className="text-xs text-zinc-600">logs</div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-zinc-600 tabular-nums">{totalSubmissions} total submissions across all areas</p>
      </div>
    </div>
  );
}
