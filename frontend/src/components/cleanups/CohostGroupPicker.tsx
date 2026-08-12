"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ACTIVITY_WINDOW_DAYS = 30;
const TOP_ACTIVE_COUNT = 5;

interface GroupOption {
  id: string;
  name: string;
  image_url: string | null;
}

export default function CohostGroupPicker({
  primaryGroupId,
  value,
  onChange,
}: {
  primaryGroupId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [activityByGroup, setActivityByGroup] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(value.length > 0);

  useEffect(() => {
    const supabase = createClient();
    const activitySince = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("groups")
      .select("id, name, image_url")
      .then(({ data }) => setGroups((data ?? []) as GroupOption[]));
    supabase
      .from("contributions")
      .select("group_id")
      .not("group_id", "is", null)
      .gt("submitted_at", activitySince)
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        for (const row of data ?? []) {
          if (!row.group_id) continue;
          counts[row.group_id] = (counts[row.group_id] ?? 0) + 1;
        }
        setActivityByGroup(counts);
      });
  }, []);

  // Ranked by recent contribution activity (same signal as the groups list page) so the
  // default view surfaces groups worth co-hosting with, not an alphabetical wall of names.
  const rankedGroups = useMemo(() => {
    return groups
      .filter((g) => g.id !== primaryGroupId)
      .sort((a, b) => (activityByGroup[b.id] ?? 0) - (activityByGroup[a.id] ?? 0) || a.name.localeCompare(b.name));
  }, [groups, activityByGroup, primaryGroupId]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return rankedGroups.filter((g) => g.name.toLowerCase().includes(q));
    const selectedIds = new Set(value);
    const selected = rankedGroups.filter((g) => selectedIds.has(g.id));
    const topActive = rankedGroups.filter((g) => !selectedIds.has(g.id)).slice(0, TOP_ACTIVE_COUNT);
    return [...selected, ...topActive];
  }, [rankedGroups, query, value]);

  const showingTopActiveOnly = !query.trim() && rankedGroups.length > options.length;

  const selectedGroups = useMemo(
    () => groups.filter((g) => value.includes(g.id)),
    [groups, value]
  );

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...value, id] : value.filter((existing) => existing !== id));
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 min-h-11 px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-left touch-manipulation"
      >
        <span className="flex items-center gap-2 text-sm text-zinc-300">
          Co-hosting groups
          <span className="text-xs text-zinc-500">(optional)</span>
          {value.length > 0 && (
            <span className="text-xs font-medium text-emerald-400">{value.length} selected</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 shrink-0 text-zinc-500 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!expanded && selectedGroups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedGroups.map((g) => (
            <span
              key={g.id}
              className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300"
            >
              <GroupAvatar group={g} size={5} />
              {g.name}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all groups..."
            className="w-full min-h-11 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
          />
          {showingTopActiveOnly && (
            <p className="px-1 text-[11px] text-zinc-600">Showing the most active groups — search to find others.</p>
          )}
          <div className="max-h-52 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg divide-y divide-zinc-800">
            {options.length === 0 && (
              <p className="px-3 py-3 text-xs text-zinc-600">No groups found.</p>
            )}
            {options.map((g) => {
              const checked = value.includes(g.id);
              return (
                <button
                  type="button"
                  key={g.id}
                  onClick={() => toggle(g.id, !checked)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 min-h-11 text-left text-sm transition-colors duration-150 touch-manipulation ${
                    checked ? "bg-emerald-900/25 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800 active:bg-zinc-800"
                  }`}
                >
                  <GroupAvatar group={g} size={7} />
                  <span className="flex-1 min-w-0 truncate">{g.name}</span>
                  <span
                    className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${
                      checked ? "bg-emerald-600 border-emerald-600" : "border-zinc-600"
                    }`}
                  >
                    {checked && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupAvatar({ group, size }: { group: GroupOption; size: number }) {
  const px = size * 4;
  return (
    <div
      className="shrink-0 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center"
      style={{ width: px, height: px }}
    >
      {group.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={group.image_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-zinc-400">{(group.name || "?")[0].toUpperCase()}</span>
      )}
    </div>
  );
}
