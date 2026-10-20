"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ShareButton from "@/components/ShareButton";
import PlusFlair from "@/components/billing/PlusFlair";
import type { Database } from "@/types/database";

type Group = Database["public"]["Tables"]["groups"]["Row"];

export default function GroupsListClient({
  groups,
  memberCountByGroup,
  upcomingEventCountByGroup,
  userGroupIds,
  plusGroupIds,
  isLoggedIn,
}: {
  groups: Group[];
  memberCountByGroup: Record<string, number>;
  upcomingEventCountByGroup: Record<string, number>;
  userGroupIds: string[];
  plusGroupIds: string[];
  isLoggedIn: boolean;
}) {
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const memberSet = useMemo(() => new Set(userGroupIds), [userGroupIds]);
  const plusSet = useMemo(() => new Set(plusGroupIds), [plusGroupIds]);

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
      <div className="mb-4 sm:mb-6 flex flex-row gap-2 sm:gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search groups…"
          className="min-w-0 flex-1 min-h-11 px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-xl text-sm outline-none shadow-elevation-1 transition-colors text-zinc-100 placeholder:text-zinc-600"
        />
        {isLoggedIn && (
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            className={`shrink-0 min-h-11 px-3 py-2 rounded-xl text-sm font-semibold border shadow-elevation-1 transition-[background-color,border-color,transform] duration-150 active:scale-[0.96] touch-manipulation ${
              mineOnly
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 active:border-zinc-500 active:text-zinc-200"
            }`}
          >
            My Groups
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-28 text-zinc-600">
                    <p className="font-semibold text-zinc-500">
            {mineOnly ? "You're not in any groups yet." : "No groups match your search."}
          </p>
          {mineOnly && (
            <div className="mt-3 space-y-3">
              <p className="text-sm">Join a group to get event reminders and count toward its leaderboard.</p>
              <button
                type="button"
                onClick={() => setMineOnly(false)}
                className="inline-flex min-h-11 items-center px-5 rounded-full bg-emerald-400 text-emerald-950 text-sm font-bold active:scale-[0.97] transition-transform touch-manipulation"
              >
                Browse all groups
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((group) => {
            const count = memberCountByGroup[group.id] ?? 0;
            const eventCount = upcomingEventCountByGroup[group.id] ?? 0;
            const isMember = memberSet.has(group.id);

            return (
              <div
                key={group.id}
                className="group relative overflow-hidden rounded-[20px] bg-zinc-900 p-5 shadow-elevation-1 ring-1 ring-inset ring-white/5 cursor-pointer transition-[background-color,transform,box-shadow] duration-200 hover:bg-zinc-800/70 hover:ring-emerald-500/30 hover:shadow-elevation-2 active:scale-[0.98] active:bg-zinc-800/70"
              >
                {/* Full-card click target — sits below the content/share button (z-10) so both stay clickable. */}
                <Link
                  href={`/groups/${group.slug}`}
                  className="absolute inset-0 z-0 touch-manipulation"
                  aria-label={group.name}
                />


                <div className="relative z-10 flex items-start justify-between gap-3 pointer-events-none">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                        {group.image_url ? (
                          <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-zinc-300">{(group.name || "?")[0].toUpperCase()}</span>
                        )}
                      </div>
                      {group.verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                          ✓ Verified
                        </span>
                      )}
                      {isMember && (
                        <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                          Member
                        </span>
                      )}
                    </div>

                    <h2 className="font-display text-lg font-extrabold tracking-tight leading-snug text-zinc-100 group-hover:text-white">
                      {group.name}
                      <PlusFlair isPlus={plusSet.has(group.id)} />
                    </h2>
                    {group.description && (
                      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                        {group.description}
                      </p>
                    )}
                    {/* Own row (not squeezed into the avatar/badge row above with ml-auto) so
                        it can't wrap onto an orphan line and end up floating oddly to the right. */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      {eventCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-950/40 px-2 py-0.5 text-sky-400">
                          🗓️ {eventCount} upcoming
                        </span>
                      )}
                      <span>{count} member{count !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  <div className="relative flex flex-shrink-0 flex-col items-end gap-2">
                    <ShareButton
                      variant="icon"
                      size="sm"
                      className="pointer-events-auto"
                      content={{ title: group.name, text: group.description ?? undefined, url: `/groups/${group.slug}` }}
                    />
                    <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-400 px-3.5 py-2 text-xs font-semibold text-emerald-950 transition-colors duration-150 group-hover:bg-emerald-300">
                      Details
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
