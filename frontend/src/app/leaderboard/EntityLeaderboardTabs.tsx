"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPoints } from "@/lib/formatPoints";
import Avatar from "@/components/ui/Avatar";
import RankBadge from "@/components/ui/RankBadge";
import { computeRanks } from "@/lib/ranking";
import { mondayOf } from "@/app/groups/[slug]/stats/statsWindow";

type Interval = "today" | "week" | "month" | "all";

interface GlobalUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_value: number;
  contribution_count: number;
}

interface GlobalGroup {
  group_id: string;
  name: string | null;
  slug: string | null;
  logo_url: string | null;
  total_value: number;
  contribution_count: number;
}

interface GlobalLeaderboardResponse {
  interval: Interval;
  users: GlobalUser[];
  groups: GlobalGroup[];
}

const INTERVALS: { id: Interval; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All-time" },
];

/** Static "what dates this covers" label for the current interval -- always today's/this
 * week's/this month's actual dates, since this tab has no period navigation like
 * IntervalPicker's date input does. */
function dateRangeLabel(interval: Interval): string {
  const now = new Date();
  if (interval === "today") {
    return now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  if (interval === "week") {
    const monday = mondayOf(now);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sameMonth = monday.getMonth() === sunday.getMonth();
    const startStr = monday.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const endStr = sunday.toLocaleDateString(
      undefined,
      sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" }
    );
    return `${startStr}–${endStr}`;
  }
  if (interval === "month") {
    return now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return "All time";
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

export default function EntityLeaderboardTabs({ fastapiUrl }: { fastapiUrl: string }) {
  const [tab, setTab] = useState<"users" | "groups">("users");
  const [interval, setInterval] = useState<Interval>("month");
  const [data, setData] = useState<GlobalLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`${fastapiUrl}/api/leaderboard/global?interval=${interval}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [fastapiUrl, interval]);

  const users = data?.users ?? [];
  const groups = data?.groups ?? [];
  const userRanks = computeRanks(users, (u) => u.total_value);
  const groupRanks = computeRanks(groups, (g) => g.total_value);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Points (All Campaigns)
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

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-1 flex-wrap">
          {INTERVALS.map((iv) => (
            <button
              key={iv.id}
              onClick={() => setInterval(iv.id)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors touch-manipulation ${
                interval === iv.id
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
              }`}
            >
              {iv.label}
            </button>
          ))}
        </div>

        {interval !== "all" && (
          <div className="px-2.5 py-1 text-xs text-zinc-500 border border-zinc-800 rounded-lg w-fit">
            {dateRangeLabel(interval)}
          </div>
        )}
      </div>

      <div
        className={`border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-2 bg-zinc-950 transition-opacity ${
          loading ? "opacity-50" : ""
        }`}
      >
        {tab === "users" ? (
          users.length === 0 ? (
            <div className="px-5 py-10 text-center text-zinc-600 text-sm">
              {loading ? "Loading…" : "No contributions yet."}
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800/50">
              {users.map((u, i) => (
                <EntityRow
                  key={u.user_id}
                  rank={userRanks[i]}
                  href={`/users/${encodeURIComponent(u.username ?? u.user_id)}`}
                  avatarUrl={u.avatar_url}
                  name={u.display_name ?? u.username ?? "Unknown user"}
                  points={u.total_value}
                />
              ))}
            </ul>
          )
        ) : groups.length === 0 ? (
          <div className="px-5 py-10 text-center text-zinc-600 text-sm">
            {loading ? "Loading…" : "No group contributions yet."}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/50">
            {groups.map((g, i) => (
              <EntityRow
                key={g.group_id}
                rank={groupRanks[i]}
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
