"use client";

import { useEffect, useState } from "react";
import { formatPoints } from "@/lib/formatPoints";
import Avatar from "@/components/ui/Avatar";
import GroupTrendChart, { type TrendBucket } from "./GroupTrendChart";
import { type StatsWindow, statsWindowParams } from "../statsWindow";

interface ActivityRow {
  id: string;
  submitted_at: string;
  value: number;
  photo_url: string | null;
  notes: string | null;
  small_bags: number;
  large_bags: number;
  pounds: number;
}

export default function MemberDrilldownModal({
  groupId,
  campaignId,
  window: statsWindow,
  userId,
  displayName,
  username,
  avatarUrl,
  viewerUserId,
  fastapiUrl,
  onClose,
}: {
  groupId: string;
  campaignId: string;
  window: StatsWindow;
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  viewerUserId: string;
  fastapiUrl: string;
  onClose: () => void;
}) {
  const [trend, setTrend] = useState<TrendBucket[] | null>(null);
  const [granularity, setGranularity] = useState<"hour" | "day">("day");
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityRow[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setTrendLoading(true);
    const params = new URLSearchParams({ campaign_id: campaignId, ...statsWindowParams(statsWindow), user_id: userId, viewer_user_id: viewerUserId });
    fetch(`${fastapiUrl}/api/groups/${groupId}/stats/trend?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setTrend(json?.buckets ?? []);
        setGranularity(json?.granularity === "hour" ? "hour" : "day");
        setRangeStart(json?.range_start ?? null);
      })
      .catch(() => {})
      .finally(() => setTrendLoading(false));
    return () => controller.abort();
  }, [groupId, campaignId, statsWindow, userId, viewerUserId, fastapiUrl]);

  useEffect(() => {
    const controller = new AbortController();
    setActivityLoading(true);
    const params = new URLSearchParams({ campaign_id: campaignId, ...statsWindowParams(statsWindow), viewer_user_id: viewerUserId });
    fetch(`${fastapiUrl}/api/groups/${groupId}/stats/members/${userId}/activity?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((json) => setActivity(json))
      .catch(() => {})
      .finally(() => setActivityLoading(false));
    return () => controller.abort();
  }, [groupId, campaignId, statsWindow, userId, viewerUserId, fastapiUrl]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-elevation-3 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-2 sticky top-0 bg-zinc-950">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar avatarUrl={avatarUrl} name={displayName} username={username} size="sm" />
            <span className="text-sm font-semibold text-zinc-200 truncate">{displayName}</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-sm px-2 py-1 -mr-2 touch-manipulation shrink-0">
            Close
          </button>
        </div>

        <div className="px-5 py-5">
          <GroupTrendChart buckets={trend ?? []} granularity={granularity} rangeStart={rangeStart} loading={trendLoading} />

          <div className="mt-6">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Recent activity</div>
            {activityLoading ? (
              <div className="text-center text-zinc-600 text-sm py-6">Loading…</div>
            ) : !activity || activity.length === 0 ? (
              <div className="text-center text-zinc-600 text-sm py-6">No logs in this period.</div>
            ) : (
              <ul className="divide-y divide-zinc-800/50">
                {activity.map((row) => (
                  <li key={row.id} className="py-2.5 flex items-center gap-3">
                    {row.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.photo_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-zinc-800 shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-zinc-300">
                        {new Date(row.submitted_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </div>
                      {(row.small_bags + row.large_bags > 0 || row.pounds > 0) && (
                        <div className="text-[11px] text-zinc-600">
                          {row.small_bags + row.large_bags > 0 ? `${row.small_bags + row.large_bags} bags (${row.small_bags}S / ${row.large_bags}L)` : ""}
                          {row.pounds > 0 ? `${row.small_bags + row.large_bags > 0 ? " · " : ""}${Math.round(row.pounds)} lbs` : ""}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold text-zinc-300 tabular-nums">{formatPoints(row.value)}</div>
                      <div className="text-[10px] text-zinc-600">pts</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
