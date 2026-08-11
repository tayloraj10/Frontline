"use client";

import { useState, type ReactNode } from "react";
import GeoStatsExplorer from "./GeoStatsExplorer";

export default function LeaderboardViewSwitch({
  campaignId,
  fastapiUrl,
  unit,
  children,
}: {
  campaignId: string;
  fastapiUrl: string;
  unit: string;
  children: ReactNode;
}) {
  const [view, setView] = useState<"leaderboard" | "geo">("leaderboard");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border border-zinc-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setView("leaderboard")}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors touch-manipulation ${
            view === "leaderboard" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Leaderboard
        </button>
        <button
          onClick={() => setView("geo")}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors touch-manipulation ${
            view === "geo" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Geo Stats
        </button>
      </div>

      {view === "leaderboard" ? (
        children
      ) : (
        <GeoStatsExplorer campaignId={campaignId} fastapiUrl={fastapiUrl} unit={unit} />
      )}
    </div>
  );
}
