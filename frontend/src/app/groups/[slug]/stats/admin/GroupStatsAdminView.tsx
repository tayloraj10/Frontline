"use client";

import { useEffect, useState } from "react";
import { formatPoints } from "@/lib/formatPoints";
import Avatar from "@/components/ui/Avatar";
import GroupTrendChart, { type TrendBucket } from "./GroupTrendChart";
import GroupEventsMap from "./GroupEventsMap";
import GroupGeoStatsExplorer, { type ExternalFocusRequest } from "./GroupGeoStatsExplorer";
import GroupStatBreakdownCharts from "./GroupStatBreakdownCharts";
import MemberDrilldownModal from "./MemberDrilldownModal";
import IntervalPicker from "../IntervalPicker";
import { type StatsWindow, statsWindowParams } from "../statsWindow";

interface Member {
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

interface CampaignStats {
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  aggregate: {
    total_value: number;
    contribution_count: number;
    unique_contributors: number;
    small_bags: number;
    large_bags: number;
    pounds: number;
  };
  members: Member[];
}

interface StatsResponse {
  group_id: string;
  interval: string;
  is_member: boolean;
  is_admin: boolean;
  campaigns: CampaignStats[];
}

interface GeoPoint {
  latitude: number;
  longitude: number;
}

interface StatsEvent {
  id: string;
  title: string;
  description: string | null;
  scheduled_start: string;
  scheduled_end: string | null;
  status: string;
  image_url: string | null;
  lat: number;
  lng: number;
  max_attendees: number | null;
  going_count: number;
  is_past: boolean;
  is_ongoing: boolean;
  is_cohosted: boolean;
}

export default function GroupStatsAdminView({
  groupId,
  groupName,
  viewerUserId,
  fastapiUrl,
}: {
  groupId: string;
  groupName: string;
  viewerUserId: string;
  fastapiUrl: string;
}) {
  const [statsWindow, setStatsWindow] = useState<StatsWindow>({ interval: "month", anchor: new Date() });
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const [trend, setTrend] = useState<TrendBucket[] | null>(null);
  const [trendGranularity, setTrendGranularity] = useState<"hour" | "day">("day");
  const [trendRangeStart, setTrendRangeStart] = useState<string | null>(null);
  const [trendLoading, setTrendLoading] = useState(true);

  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [pointsLoading, setPointsLoading] = useState(true);

  const [events, setEvents] = useState<StatsEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [drilldownMember, setDrilldownMember] = useState<Member | null>(null);
  const [geoFocusRequest, setGeoFocusRequest] = useState<ExternalFocusRequest | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ ...statsWindowParams(statsWindow), viewer_user_id: viewerUserId });
    fetch(`${fastapiUrl}/api/groups/${groupId}/stats?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json: StatsResponse) => {
        setData(json);
        setCampaignId((prev) => {
          if (prev && json.campaigns.some((c) => c.campaign_id === prev)) return prev;
          return json.campaigns[0]?.campaign_id ?? null;
        });
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [groupId, viewerUserId, fastapiUrl, statsWindow]);

  useEffect(() => {
    if (!campaignId) {
      setTrend([]);
      setTrendLoading(false);
      return;
    }
    const controller = new AbortController();
    setTrendLoading(true);
    const params = new URLSearchParams({ campaign_id: campaignId, ...statsWindowParams(statsWindow), viewer_user_id: viewerUserId });
    fetch(`${fastapiUrl}/api/groups/${groupId}/stats/trend?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        setTrend(json?.buckets ?? []);
        setTrendGranularity(json?.granularity === "hour" ? "hour" : "day");
        setTrendRangeStart(json?.range_start ?? null);
      })
      .catch(() => {})
      .finally(() => setTrendLoading(false));
    return () => controller.abort();
  }, [groupId, campaignId, statsWindow, viewerUserId, fastapiUrl]);

  useEffect(() => {
    if (!campaignId) {
      setPoints([]);
      setPointsLoading(false);
      return;
    }
    const controller = new AbortController();
    setPointsLoading(true);
    const params = new URLSearchParams({ campaign_id: campaignId, ...statsWindowParams(statsWindow), viewer_user_id: viewerUserId });
    fetch(`${fastapiUrl}/api/groups/${groupId}/stats/geo-points?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setPoints(json?.points ?? []))
      .catch(() => {})
      .finally(() => setPointsLoading(false));
    return () => controller.abort();
  }, [groupId, campaignId, statsWindow, viewerUserId, fastapiUrl]);

  useEffect(() => {
    const controller = new AbortController();
    setEventsLoading(true);
    const params = new URLSearchParams({ ...statsWindowParams(statsWindow), viewer_user_id: viewerUserId });
    if (campaignId) params.set("campaign_id", campaignId);
    fetch(`${fastapiUrl}/api/groups/${groupId}/stats/events?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setEvents(Array.isArray(json) ? json : []))
      .catch(() => {})
      .finally(() => setEventsLoading(false));
    return () => controller.abort();
  }, [groupId, campaignId, statsWindow, viewerUserId, fastapiUrl]);

  const activeCampaign = data?.campaigns.find((c) => c.campaign_id === campaignId) ?? null;

  return (
    <div>
      <div className="mb-4">
        <IntervalPicker window={statsWindow} onChange={setStatsWindow} />
      </div>

      {loading && <div className="text-center text-zinc-600 text-sm py-10">Loading…</div>}
      {!loading && error && (
        <div className="text-center text-zinc-600 text-sm py-10">Couldn&apos;t load stats. Try again later.</div>
      )}
      {!loading && !error && data && data.campaigns.length === 0 && (
        <div className="text-center text-zinc-600 text-sm py-10">
          No contributions logged for this group in this time range.
        </div>
      )}

      {!loading && !error && data && data.campaigns.length > 0 && (
        <>
          {data.campaigns.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-5">
              {data.campaigns.map((c) => (
                <button
                  key={c.campaign_id}
                  onClick={() => setCampaignId(c.campaign_id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors touch-manipulation ${
                    campaignId === c.campaign_id
                      ? "bg-emerald-900/40 border-emerald-700/60 text-emerald-300"
                      : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
                  }`}
                >
                  {c.campaign_name}
                </button>
              ))}
            </div>
          )}

          {activeCampaign && (
            <>
              <section className="border border-zinc-800 rounded-xl overflow-hidden mb-6 shadow-elevation-2 bg-zinc-950">
                <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
                  <span className="text-sm font-semibold text-zinc-300">Trend</span>
                </div>
                <div className="px-5 py-4">
                  <GroupTrendChart
                    buckets={trend ?? []}
                    granularity={trendGranularity}
                    rangeStart={trendRangeStart}
                    loading={trendLoading}
                  />
                </div>
              </section>

              <section className="border border-zinc-800 rounded-xl overflow-hidden mb-6 shadow-elevation-2 bg-zinc-950">
                <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
                  <span className="text-sm font-semibold text-zinc-300">Breakdowns</span>
                </div>
                <div className="px-5 py-4">
                  <GroupStatBreakdownCharts
                    groupId={groupId}
                    campaignId={activeCampaign.campaign_id}
                    window={statsWindow}
                    viewerUserId={viewerUserId}
                    fastapiUrl={fastapiUrl}
                    members={activeCampaign.members}
                    smallBags={activeCampaign.aggregate.small_bags}
                    largeBags={activeCampaign.aggregate.large_bags}
                    onDrillGeo={setGeoFocusRequest}
                  />
                </div>
              </section>

              <section className="border border-zinc-800 rounded-xl overflow-hidden mb-6 shadow-elevation-2 bg-zinc-950">
                <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-300">Activity Map</span>
                  <span className="text-[11px] text-zinc-600">
                    {points.length} location{points.length === 1 ? "" : "s"} · {events.length} event{events.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="p-3">
                  {pointsLoading || eventsLoading ? (
                    <div className="text-center text-zinc-600 text-sm py-16">Loading…</div>
                  ) : points.length === 0 && events.length === 0 ? (
                    <div className="text-center text-zinc-600 text-sm py-16">No geotagged activity in this period.</div>
                  ) : (
                    <GroupEventsMap points={points} events={events} />
                  )}
                </div>
              </section>

              <section className="border border-zinc-800 rounded-xl overflow-hidden mb-6 shadow-elevation-2 bg-zinc-950">
                <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
                  <span className="text-sm font-semibold text-zinc-300">Geographic Deep Dive</span>
                </div>
                <div className="px-5 py-4">
                  <GroupGeoStatsExplorer
                    groupId={groupId}
                    campaignId={activeCampaign.campaign_id}
                    window={statsWindow}
                    viewerUserId={viewerUserId}
                    fastapiUrl={fastapiUrl}
                    externalFocusRequest={geoFocusRequest}
                  />
                </div>
              </section>

              <section className="border border-zinc-800 rounded-xl overflow-hidden mb-6 shadow-elevation-2 bg-zinc-950">
                <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
                  <span className="text-sm font-semibold text-zinc-300">Members</span>
                </div>
                {activeCampaign.members.length === 0 ? (
                  <div className="px-5 py-8 text-center text-zinc-600 text-sm">No member activity in this range.</div>
                ) : (
                  <ul className="divide-y divide-zinc-800/50">
                    {activeCampaign.members.map((m, i) => (
                      <li key={m.user_id}>
                        <button
                          onClick={() => setDrilldownMember(m)}
                          className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-zinc-900/40 transition-colors touch-manipulation"
                        >
                          <span className="text-zinc-600 text-sm w-6 text-center tabular-nums shrink-0">{i + 1}</span>
                          <Avatar avatarUrl={m.avatar_url} name={m.display_name ?? m.username ?? "?"} username={m.username} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-zinc-200 truncate font-medium">
                              {m.display_name ?? m.username ?? "Unknown"}
                            </div>
                            <div className="text-xs text-zinc-600">
                              {m.contribution_count} contribution{m.contribution_count === 1 ? "" : "s"}
                              {m.small_bags + m.large_bags > 0
                                ? ` · ${m.small_bags + m.large_bags} bags (${m.small_bags}S / ${m.large_bags}L)`
                                : ""}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-semibold text-zinc-300 tabular-nums">{formatPoints(m.total_value)}</div>
                            <div className="text-xs text-zinc-600">pts</div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}

      {drilldownMember && activeCampaign && (
        <MemberDrilldownModal
          groupId={groupId}
          campaignId={activeCampaign.campaign_id}
          window={statsWindow}
          userId={drilldownMember.user_id}
          displayName={drilldownMember.display_name ?? drilldownMember.username ?? "Unknown"}
          username={drilldownMember.username}
          avatarUrl={drilldownMember.avatar_url}
          viewerUserId={viewerUserId}
          fastapiUrl={fastapiUrl}
          onClose={() => setDrilldownMember(null)}
        />
      )}
    </div>
  );
}
