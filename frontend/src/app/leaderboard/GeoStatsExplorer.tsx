"use client";

import { useEffect, useState } from "react";
import { formatPoints } from "@/lib/formatPoints";
import Avatar from "@/components/ui/Avatar";
import RankBadge from "@/components/ui/RankBadge";
import { computeRanks } from "@/lib/ranking";
import GeoStatsMap from "./GeoStatsMap";
import StatDetailModal, { StatKind } from "./StatDetailModal";

type Interval = "today" | "week" | "month" | "all";
type GeoLevel = "borough" | "neighborhood" | "zip";

interface FocusUnit {
  geo_unit_id: string;
  unit_type: string;
  unit_id: string;
  display_name: string | null;
}

interface TopUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_value: number;
  contribution_count: number;
  small_bags: number;
  large_bags: number;
  pounds: number;
}

interface TopGroup {
  group_id: string;
  name: string | null;
  total_value: number;
  contribution_count: number;
  small_bags: number;
  large_bags: number;
  pounds: number;
}

interface ChildUnit {
  geo_unit_id: string;
  unit_type: string;
  unit_id: string;
  display_name: string | null;
  total_value: number;
  contribution_count: number;
  unique_contributors: number;
  unique_groups: number;
  small_bags: number;
  large_bags: number;
  pounds: number;
}

interface GeoStatsResponse {
  interval: Interval;
  focus: FocusUnit | null;
  aggregate: {
    total_value: number;
    contribution_count: number;
    unique_contributors: number;
    unique_groups: number;
    small_bags: number;
    large_bags: number;
    pounds: number;
  };
  top_users: TopUser[];
  top_groups: TopGroup[];
  children: ChildUnit[] | null;
}

const INTERVALS: { id: Interval; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All-time" },
];

const LEVEL_LABELS: Record<GeoLevel, string> = {
  borough: "Borough",
  neighborhood: "Neighborhood",
  zip: "Zip / Postcode",
};

// zip-typed units (zip, uk_postcode_district) are terminal — nothing to drill into below them.
function levelsBelow(unitType: string | null): GeoLevel[] {
  if (unitType === null) return ["borough", "neighborhood", "zip"];
  if (unitType === "nyc_borough") return ["neighborhood", "zip"];
  if (unitType === "nyc_neighborhood") return ["zip"];
  return [];
}

function nextLevelBelow(unitType: string): GeoLevel | null {
  const levels = levelsBelow(unitType);
  return levels.length > 0 ? levels[0] : null;
}


function StatTile({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="border border-zinc-800 rounded-lg px-3 py-2.5 text-left hover:bg-zinc-800/40 hover:border-zinc-700 transition-colors touch-manipulation disabled:hover:bg-transparent disabled:hover:border-zinc-800"
    >
      <div className="text-base font-bold text-zinc-100 tabular-nums">{value}</div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </button>
  );
}

export default function GeoStatsExplorer({
  campaignId,
  fastapiUrl,
  unit,
}: {
  campaignId: string;
  fastapiUrl: string;
  unit: string;
}) {
  const [interval, setInterval] = useState<Interval>("all");
  const [focusStack, setFocusStack] = useState<FocusUnit[]>([]);
  const [level, setLevel] = useState<GeoLevel | null>(null);
  const [data, setData] = useState<GeoStatsResponse | null>(null);
  // The (level, focus) that `data` was actually fetched for — lets the map/breakdown
  // list wait for a matching response instead of briefly rendering the new level's
  // tiles against the previous level's children (mismatched geo_unit_ids => no color).
  const [dataKey, setDataKey] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showAllChildren, setShowAllChildren] = useState(false);
  const [focusBbox, setFocusBbox] = useState<[number, number, number, number] | null>(null);
  const [focusBoundary, setFocusBoundary] = useState<GeoJSON.Geometry | null>(null);
  const [detailStat, setDetailStat] = useState<StatKind | null>(null);

  const focus = focusStack[focusStack.length - 1] ?? null;
  const availableLevels = levelsBelow(focus?.unit_type ?? null);
  const requestKey = `${focus?.geo_unit_id ?? ""}|${level ?? ""}`;
  const dataMatchesRequest = dataKey === requestKey;
  // A terminal unit (e.g. a zip code) has nothing further to drill into, so `level`
  // is null once focused on one. Rather than rendering no map at all, show the
  // focused unit itself as a single-item "self view" built from the aggregate.
  const isTerminalFocus = focus !== null && availableLevels.length === 0;
  const selfUnit: ChildUnit | null =
    isTerminalFocus && data && dataMatchesRequest
      ? {
          geo_unit_id: focus!.geo_unit_id,
          unit_type: focus!.unit_type,
          unit_id: focus!.unit_id,
          display_name: focus!.display_name,
          total_value: data.aggregate.total_value,
          contribution_count: data.aggregate.contribution_count,
          unique_contributors: data.aggregate.unique_contributors,
          unique_groups: data.aggregate.unique_groups,
          small_bags: data.aggregate.small_bags,
          large_bags: data.aggregate.large_bags,
          pounds: data.aggregate.pounds,
        }
      : null;
  const mapLevel: GeoLevel | null = selfUnit ? "zip" : level;
  const mapUnits: ChildUnit[] | null = selfUnit ? [selfUnit] : data?.children ?? null;
  const showMap = Boolean(mapLevel && mapUnits && (selfUnit || dataMatchesRequest));

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ interval });
    if (focus) params.set("focus_geo_unit_id", focus.geo_unit_id);
    if (level) params.set("children_level", level);
    fetch(`${fastapiUrl}/api/campaigns/${campaignId}/geo-stats?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setData(json);
        setDataKey(requestKey);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, fastapiUrl, interval, focus, level]);

  useEffect(() => {
    setShowAllChildren(false);
  }, [level, focus]);

  useEffect(() => {
    if (!focus) {
      setFocusBbox(null);
      return;
    }
    const controller = new AbortController();
    fetch(`${fastapiUrl}/api/geo-units/${focus.geo_unit_id}/bbox`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setFocusBbox(json ? (json.bbox as [number, number, number, number]) : null))
      .catch(() => {});
    return () => controller.abort();
  }, [focus, fastapiUrl]);

  // Outline the focused neighborhood while its child zip codes are the primary
  // choropleth (so it's clear which neighborhood you're looking inside of), or the
  // focused unit itself when it's terminal (nothing to drill into further).
  useEffect(() => {
    const shouldOutline =
      focus !== null &&
      ((focus.unit_type === "nyc_neighborhood" && level === "zip") || levelsBelow(focus.unit_type).length === 0);
    if (!shouldOutline) {
      setFocusBoundary(null);
      return;
    }
    const controller = new AbortController();
    fetch(`${fastapiUrl}/api/geo-units/${focus.geo_unit_id}/boundary`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setFocusBoundary(json ? (json.geometry as GeoJSON.Geometry) : null))
      .catch(() => {});
    return () => controller.abort();
  }, [focus, level, fastapiUrl]);

  function drillInto(child: { geo_unit_id: string; unit_type: string; unit_id: string; display_name?: string | null }) {
    setFocusStack((prev) => [
      ...prev,
      {
        geo_unit_id: child.geo_unit_id,
        unit_type: child.unit_type,
        unit_id: child.unit_id,
        display_name: child.display_name ?? null,
      },
    ]);
    setLevel(nextLevelBelow(child.unit_type));
  }

  function jumpTo(index: number) {
    // index -1 = Overall
    const nextStack = index < 0 ? [] : focusStack.slice(0, index + 1);
    setFocusStack(nextStack);
    const newFocusType = nextStack[nextStack.length - 1]?.unit_type ?? null;
    const belowNow = levelsBelow(newFocusType);
    setLevel(belowNow.includes(level as GeoLevel) ? level : null);
  }

  return (
    <div className="space-y-4">
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

      <div className="flex items-center gap-1 text-xs text-zinc-500 flex-wrap">
        <button
          onClick={() => jumpTo(-1)}
          className={focus === null ? "text-zinc-200 font-semibold" : "hover:text-zinc-300"}
        >
          Overall
        </button>
        {focusStack.map((f, i) => (
          <span key={f.geo_unit_id} className="flex items-center gap-1">
            <span className="text-zinc-700">›</span>
            <button
              onClick={() => jumpTo(i)}
              className={i === focusStack.length - 1 ? "text-zinc-200 font-semibold" : "hover:text-zinc-300"}
            >
              {f.display_name ?? f.unit_id}
            </button>
          </span>
        ))}
      </div>

      {availableLevels.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {availableLevels.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(level === l ? null : l)}
              className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors touch-manipulation ${
                level === l
                  ? "bg-emerald-900/40 border-emerald-700/60 text-emerald-300"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
              }`}
            >
              {LEVEL_LABELS[l]} breakdown
            </button>
          ))}
        </div>
      )}

      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 transition-opacity ${loading ? "opacity-50" : ""}`}>
        <StatTile
          label="points"
          value={data ? formatPoints(data.aggregate.total_value) : "—"}
          onClick={data ? () => setDetailStat("pts") : undefined}
        />
        <StatTile
          label="contributions"
          value={data ? data.aggregate.contribution_count.toLocaleString() : "—"}
          onClick={data ? () => setDetailStat("contributions") : undefined}
        />
        <StatTile
          label="contributors"
          value={data ? data.aggregate.unique_contributors.toLocaleString() : "—"}
          onClick={data && data.top_users.length > 0 ? () => setDetailStat("contributors") : undefined}
        />
        <StatTile
          label="groups active"
          value={data ? data.aggregate.unique_groups.toLocaleString() : "—"}
          onClick={data && data.top_groups.length > 0 ? () => setDetailStat("groups") : undefined}
        />
      </div>

      {data && (data.aggregate.small_bags > 0 || data.aggregate.large_bags > 0 || data.aggregate.pounds > 0) && (
        <div className="border border-zinc-800 rounded-lg px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-1.5">
            <span className="text-[11px] text-zinc-500">bags collected</span>
            <span className="text-base font-bold text-zinc-100 tabular-nums">
              {formatPoints(data.aggregate.small_bags + data.aggregate.large_bags)}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 tabular-nums">
            {formatPoints(data.aggregate.small_bags)} small · {formatPoints(data.aggregate.large_bags)} large ·{" "}
            {formatPoints(data.aggregate.pounds)} lbs
          </div>
        </div>
      )}

      {detailStat && data && (
        <StatDetailModal
          kind={detailStat}
          unit={unit}
          campaignId={campaignId}
          fastapiUrl={fastapiUrl}
          interval={interval}
          focusGeoUnitId={focus?.geo_unit_id ?? null}
          topUsers={data.top_users}
          topGroups={data.top_groups}
          childUnits={data.children}
          levelLabel={level ? LEVEL_LABELS[level] : null}
          onClose={() => setDetailStat(null)}
          onDrill={drillInto}
        />
      )}

      {showMap && mapLevel && mapUnits && (
        <GeoStatsMap
          level={mapLevel}
          campaignId={campaignId}
          fastapiUrl={fastapiUrl}
          units={mapUnits}
          focusBbox={focusBbox}
          focusBoundary={focusBoundary}
          onDrill={selfUnit ? () => {} : drillInto}
        />
      )}

      {level && data?.children && dataMatchesRequest && (
        <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1">
          <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
            <span className="text-sm font-semibold text-zinc-300">{LEVEL_LABELS[level]} breakdown</span>
          </div>
          {data.children.length === 0 ? (
            <div className="px-5 py-10 text-center text-zinc-600 text-sm">No activity here yet.</div>
          ) : (
            <>
              <ul className="divide-y divide-zinc-800/50">
                {(() => {
                  const visibleChildren =
                    level === "zip" || !showAllChildren ? data.children.slice(0, 10) : data.children;
                  const childRanks = computeRanks(visibleChildren, (c) => c.total_value);
                  return visibleChildren.map((child, i) => (
                    <li key={child.geo_unit_id}>
                      <button
                        onClick={() => drillInto(child)}
                        className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-zinc-800/40 transition-colors touch-manipulation"
                      >
                        <RankBadge rank={childRanks[i]} />
                        <span className="flex-1 min-w-0 text-sm text-zinc-200 truncate font-medium">
                          {child.display_name ?? child.unit_id}
                        </span>
                        <div className="flex items-center gap-4 shrink-0 text-right">
                          <div className="hidden md:block text-right w-10">
                            <div className="text-xs font-semibold text-zinc-400 tabular-nums">
                              {child.pounds > 0 ? formatPoints(child.pounds) : "-"}
                            </div>
                            <div className="text-xs text-zinc-600">lbs</div>
                          </div>
                          <div className="hidden md:block text-right w-10">
                            <div className="text-xs font-semibold text-zinc-400 tabular-nums">
                              {child.small_bags > 0 || child.large_bags > 0
                                ? formatPoints(child.small_bags + child.large_bags)
                                : "-"}
                            </div>
                            <div className="text-xs text-zinc-600">bags</div>
                          </div>
                          <div className="hidden sm:block text-right">
                            <div className="text-xs font-semibold text-zinc-300 tabular-nums">
                              {formatPoints(child.total_value)}
                            </div>
                            <div className="text-xs text-zinc-600">{unit}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-zinc-400 tabular-nums">
                              {child.contribution_count}
                            </div>
                            <div className="text-xs text-zinc-600">logs</div>
                          </div>
                        </div>
                      </button>
                    </li>
                  ));
                })()}
              </ul>
              {level !== "zip" && data.children.length > 10 && (
                <button
                  onClick={() => setShowAllChildren((prev) => !prev)}
                  className="w-full px-5 py-2.5 text-center text-xs font-medium text-zinc-500 hover:text-zinc-300 border-t border-zinc-800/50 transition-colors touch-manipulation"
                >
                  {showAllChildren ? "Show less" : `Show all ${data.children.length}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
          <span className="text-sm font-semibold text-zinc-300">Groups</span>
        </div>
        {!data || data.top_groups.length === 0 ? (
          <div className="px-5 py-10 text-center text-zinc-600 text-sm">
            {loading ? "Loading…" : "No group contributions yet."}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/50">
            {(() => {
              const groupRanks = computeRanks(data.top_groups, (g) => g.total_value);
              return data.top_groups.map((g, i) => (
              <li key={g.group_id} className="px-5 py-3 flex items-center gap-3">
                <RankBadge rank={groupRanks[i]} />
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-emerald-900/40 border border-emerald-700/60 flex items-center justify-center text-xs font-bold shrink-0 text-emerald-400">
                    {(g.name ?? "?")[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-zinc-200 truncate font-medium">{g.name ?? "Unknown Group"}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-right">
                  <div className="hidden md:block text-right w-10">
                    <div className="text-xs font-semibold text-zinc-400 tabular-nums">
                      {g.pounds > 0 ? formatPoints(g.pounds) : "-"}
                    </div>
                    <div className="text-xs text-zinc-600">lbs</div>
                  </div>
                  <div className="hidden md:block text-right w-10">
                    <div className="text-xs font-semibold text-zinc-400 tabular-nums">
                      {g.small_bags > 0 || g.large_bags > 0 ? formatPoints(g.small_bags + g.large_bags) : "-"}
                    </div>
                    <div className="text-xs text-zinc-600">bags</div>
                  </div>
                  <div className="hidden sm:block text-right">
                    <div className="text-xs font-semibold text-zinc-300 tabular-nums">
                      {formatPoints(g.total_value)}
                    </div>
                    <div className="text-xs text-zinc-600">{unit}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold text-zinc-400 tabular-nums">{g.contribution_count}</div>
                    <div className="text-xs text-zinc-600">logs</div>
                  </div>
                </div>
              </li>
              ));
            })()}
          </ul>
        )}
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
          <span className="text-sm font-semibold text-zinc-300">Individuals</span>
        </div>
        {!data || data.top_users.length === 0 ? (
          <div className="px-5 py-10 text-center text-zinc-600 text-sm">
            {loading ? "Loading…" : "No individual contributions yet."}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/50">
            {(() => {
              const userRanks = computeRanks(data.top_users, (u) => u.total_value);
              return data.top_users.map((u, i) => {
              const name = u.display_name ?? u.username ?? "Unknown User";
              return (
                <li key={u.user_id} className="px-5 py-3 flex items-center gap-3">
                  <RankBadge rank={userRanks[i]} />
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Avatar avatarUrl={u.avatar_url} name={name} username={u.username} size="sm" />
                    <span className="text-sm text-zinc-200 truncate font-medium">{name}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <div className="hidden md:block text-right w-10">
                      <div className="text-xs font-semibold text-zinc-400 tabular-nums">
                        {u.pounds > 0 ? formatPoints(u.pounds) : "-"}
                      </div>
                      <div className="text-xs text-zinc-600">lbs</div>
                    </div>
                    <div className="hidden md:block text-right w-10">
                      <div className="text-xs font-semibold text-zinc-400 tabular-nums">
                        {u.small_bags > 0 || u.large_bags > 0 ? formatPoints(u.small_bags + u.large_bags) : "-"}
                      </div>
                      <div className="text-xs text-zinc-600">bags</div>
                    </div>
                    <div className="hidden sm:block text-right">
                      <div className="text-xs font-semibold text-zinc-300 tabular-nums">
                        {formatPoints(u.total_value)}
                      </div>
                      <div className="text-xs text-zinc-600">{unit}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-zinc-400 tabular-nums">
                        {u.contribution_count}
                      </div>
                      <div className="text-xs text-zinc-600">logs</div>
                    </div>
                  </div>
                </li>
              );
              });
            })()}
          </ul>
        )}
      </div>
    </div>
  );
}
