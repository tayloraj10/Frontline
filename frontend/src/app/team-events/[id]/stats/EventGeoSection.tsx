"use client";

import { useEffect, useState } from "react";
import { getTeamEventGeo, type TeamEventGeoEntry } from "@/lib/teamEvents";
import { resolveTeamColor } from "@/lib/teamColors";
import { computeRanks } from "@/lib/ranking";
import RankBadge from "@/components/ui/RankBadge";

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
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

  if (entries === null || entries.length === 0) return null;

  const ranks = computeRanks(entries, (e) => e.total_value);

  return (
    <div className="border border-zinc-800 rounded-xl p-4 space-y-3 shadow-elevation-1">
      <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Territory</h2>
      <div className="space-y-1">
        {entries.map((e, i) => (
          <div key={e.team_id} className="flex items-center gap-2.5 py-1.5">
            <RankBadge rank={ranks[i]} />
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: resolveTeamColor(e.team_color) }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200 truncate">{e.geo_display_name ?? e.geo_unit_id}</p>
              <p className="text-xs text-zinc-600">{e.team_name}</p>
            </div>
            <span className="text-sm font-bold text-zinc-100 tabular-nums shrink-0">
              {fmt(e.total_value)} pts · {e.submission_count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
