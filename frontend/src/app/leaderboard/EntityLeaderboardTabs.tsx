"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPoints } from "@/lib/formatPoints";
import Avatar from "@/components/ui/Avatar";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-black text-sm w-6 text-center">1</span>;
  if (rank === 2) return <span className="text-zinc-300 font-black text-sm w-6 text-center">2</span>;
  if (rank === 3) return <span className="text-amber-600 font-black text-sm w-6 text-center">3</span>;
  return <span className="text-zinc-600 text-sm w-6 text-center tabular-nums">{rank}</span>;
}

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  points: number | null;
}

interface TrashWarGroup {
  entity_id: string;
  name: string | null;
  slug: string | null;
  logo_url: string | null;
  total_value: number;
  contribution_count: number;
}

function EntityRow({
  rank,
  href,
  avatarUrl,
  name,
  points,
}: {
  rank: number;
  href: string;
  avatarUrl: string | null;
  name: string;
  points: number;
}) {
  return (
    <li
      className={`px-5 py-3 flex items-center gap-3 transition-[background-color] duration-150 active:bg-zinc-900/70 touch-manipulation ${
        rank <= 3 ? "bg-zinc-900/40" : ""
      }`}
    >
      <RankBadge rank={rank} />
      <Link href={href} className="flex items-center gap-2.5 flex-1 min-w-0">
        <Avatar avatarUrl={avatarUrl} name={name} size="sm" />
        <span className="text-sm text-zinc-200 truncate font-medium active:text-zinc-100 transition-colors">
          {name}
        </span>
      </Link>
      <div className="text-right shrink-0">
        <div className="text-xs font-semibold text-zinc-300 tabular-nums">{formatPoints(points)}</div>
        <div className="text-xs text-zinc-600">pts</div>
      </div>
    </li>
  );
}

export default function EntityLeaderboardTabs({
  profiles,
  groups,
}: {
  profiles: Profile[];
  groups: TrashWarGroup[];
}) {
  const [tab, setTab] = useState<"users" | "groups">("users");

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          {tab === "users" ? "All-Time Points (All Campaigns)" : "Trash War Points"}
        </div>
        <div className="flex items-center gap-1 border border-zinc-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("users")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors touch-manipulation ${
              tab === "users" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setTab("groups")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors touch-manipulation ${
              tab === "groups" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Groups
          </button>
        </div>
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-2 bg-zinc-950">
        {tab === "users" ? (
          profiles.length === 0 ? (
            <div className="px-5 py-10 text-center text-zinc-600 text-sm">No contributions yet.</div>
          ) : (
            <ul className="divide-y divide-zinc-800/50">
              {profiles.map((p, i) => (
                <EntityRow
                  key={p.id}
                  rank={i + 1}
                  href={`/users/${p.username}`}
                  avatarUrl={p.avatar_url}
                  name={p.display_name ?? p.username}
                  points={p.points ?? 0}
                />
              ))}
            </ul>
          )
        ) : groups.length === 0 ? (
          <div className="px-5 py-10 text-center text-zinc-600 text-sm">No group contributions yet.</div>
        ) : (
          <ul className="divide-y divide-zinc-800/50">
            {groups.map((g, i) => (
              <EntityRow
                key={g.entity_id}
                rank={i + 1}
                href={`/groups/${g.slug}`}
                avatarUrl={g.logo_url}
                name={g.name ?? "Unknown group"}
                points={g.total_value}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
