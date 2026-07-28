"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Database } from "@/types/database";

type Group = Database["public"]["Tables"]["groups"]["Row"];

export default function GroupsListClient({
  groups,
  memberCountByGroup,
  upcomingEventCountByGroup,
  userGroupIds,
  isLoggedIn,
}: {
  groups: Group[];
  memberCountByGroup: Record<string, number>;
  upcomingEventCountByGroup: Record<string, number>;
  userGroupIds: string[];
  isLoggedIn: boolean;
}) {
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const memberSet = useMemo(() => new Set(userGroupIds), [userGroupIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((group) => {
      if (mineOnly && !memberSet.has(group.id)) return false;
      if (q && !group.name.toLowerCase().includes(q) && !(group.description ?? "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [groups, query, mineOnly, memberSet]);

  return (
    <>
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search groups…"
          className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors text-zinc-100 placeholder:text-zinc-600"
        />
        {isLoggedIn && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            className={`shrink-0 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              mineOnly
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
          >
            My Groups
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-28 text-zinc-600">
          <p className="text-5xl mb-4">🔍</p>
          <p className="font-semibold text-zinc-500">
            {mineOnly ? "You're not in any groups yet." : "No groups match your search."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((group) => {
            const count = memberCountByGroup[group.id] ?? 0;
            const eventCount = upcomingEventCountByGroup[group.id] ?? 0;
            const isMember = memberSet.has(group.id);

            return (
              <Link
                key={group.id}
                href={`/groups/${group.slug}`}
                className="group relative block overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/80 p-5 pl-[18px] transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:shadow-xl hover:shadow-black/40"
              >
                <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl bg-emerald-500 opacity-40 transition-opacity duration-300 group-hover:opacity-100" />

                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
                        {group.image_url ? (
                          <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-zinc-300">{(group.name || "?")[0].toUpperCase()}</span>
                        )}
                      </div>
                      {group.verified && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/60 bg-emerald-900/30 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                          ✓ Verified
                        </span>
                      )}
                      {isMember && (
                        <span className="inline-flex items-center rounded-full border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                          Member
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
                        {eventCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-700/50 bg-sky-950/30 px-2 py-0.5 text-sky-400">
                            🗓️ {eventCount} upcoming
                          </span>
                        )}
                        {count} member{count !== 1 ? "s" : ""}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold leading-snug text-zinc-100 group-hover:text-white">
                      {group.name}
                    </h2>
                    {group.description && (
                      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                        {group.description}
                      </p>
                    )}
                  </div>

                  <span className="mt-0.5 flex-shrink-0 text-xl text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-300">
                    →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
