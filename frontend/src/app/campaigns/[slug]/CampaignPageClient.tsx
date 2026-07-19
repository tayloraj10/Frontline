"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import CampaignMapWrapper, { type ClaimLabel } from "@/components/map/CampaignMapWrapper";
import type { MapBusiness, MapCleanupEvent } from "@/components/map/CampaignMap";
import ContributionPanel from "@/components/contributions/ContributionPanel";
import CreateTimedEventButton from "@/components/events/CreateTimedEventButton";
import AdminDialog from "@/components/map/AdminDialog";
import type { SelectedArea } from "@/app/admin/EventAreaMapPicker";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { listCampaignCleanupRoutes, type CampaignCleanupRoute, type RouteLineString } from "@/lib/cleanupRoutes";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];
type Contribution = Database["public"]["Tables"]["contributions"]["Row"];

function displayStatValue(n: number): string {
  return n.toLocaleString();
}

function StatBarItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5 shrink-0">
      <span className={`text-sm font-bold tabular-nums ${highlight ? "text-red-400" : "text-zinc-100"}`}>
        {value}
      </span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}

export function CampaignStatBar({
  campaignId,
  campaignType,
  eventsCount,
  initialTotalBags,
  initialTractsCount,
  initialContributionCount,
}: {
  campaignId: string;
  campaignType: string | null;
  eventsCount: number;
  initialTotalBags: number;
  initialTractsCount: number;
  initialContributionCount: number;
}) {
  const [totalBags, setTotalBags] = useState(initialTotalBags);
  const [tractsCount, setTractsCount] = useState(initialTractsCount);
  const [contributionCount, setContributionCount] = useState(initialContributionCount);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`stat-bar:${campaignId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contributions", filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const contribution = payload.new as Contribution;
          setTotalBags((prev) => prev + (contribution?.value ?? 0));
          setContributionCount((prev) => prev + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "territory_claims", filter: `campaign_id=eq.${campaignId}` },
        () => {
          setTractsCount((prev) => prev + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId]);

  return (
    <div className="px-5 py-2 border-b border-zinc-800/60 bg-zinc-950/40 flex items-center gap-6 overflow-x-auto scrollbar-none">
      {campaignType === "collage" ? (
        <StatBarItem label="Photos submitted" value={displayStatValue(contributionCount)} />
      ) : campaignType === "choropleth" ? (
        <>
          <StatBarItem label="Total registrations" value={displayStatValue(totalBags)} />
          <StatBarItem label="States active" value={tractsCount} />
          <StatBarItem label="Contributions" value={displayStatValue(contributionCount)} />
        </>
      ) : campaignType === "heatmap" ? (
        <StatBarItem label="Unfollows logged" value={displayStatValue(contributionCount)} />
      ) : campaignType === "hex_bloom" ? (
        <>
          <StatBarItem label="World Bloom Score" value={displayStatValue(totalBags)} />
          <StatBarItem label="Hexes bloomed" value={tractsCount} />
          <StatBarItem label="Actions logged" value={displayStatValue(contributionCount)} />
        </>
      ) : (
        <>
          <StatBarItem label="Tracts claimed" value={tractsCount} />
          <StatBarItem label="Bags collected" value={displayStatValue(totalBags)} />
          <StatBarItem label="Contributions" value={displayStatValue(contributionCount)} />
        </>
      )}
      {eventsCount > 0 && <StatBarItem label="Hotspots" value={eventsCount} highlight />}
    </div>
  );
}

export interface ProblemReportMapData {
  id: string;
  geo_unit_id: string | null;
  severity: string;
  reported_at: string;
  photo_url: string | null;
  latitude: number;
  longitude: number;
  unit_type: string | null;
  status: string;
  claimed_by_user_id: string | null;
  claim_before_deadline_at: string | null;
  claim_after_deadline_at: string | null;
  flag_count: number;
}

export interface ProblemReports {
  reports: ProblemReportMapData[];
  counts_by_geo_unit: Record<string, number>;
  threshold: number | null;
  flag_auto_hide_threshold: number;
}

interface Coords {
  latitude: number;
  longitude: number;
}

// Mirrors CLEANUP_EVENT_PROXIMITY_METERS/CLEANUP_EVENT_GRACE_MINUTES_BEFORE/_AFTER in
// backend/app/api/routes/cleanup_events.py — the client-side geofence prompt uses the
// same thresholds as the server-side check-in validation so the prompt and the actual
// check-in window agree.
const CLEANUP_EVENT_PROXIMITY_METERS = 150.0;
const CLEANUP_EVENT_GRACE_MINUTES_BEFORE = 30;
const CLEANUP_EVENT_GRACE_MINUTES_AFTER = 120;
const EARTH_RADIUS_METERS = 6371000;

function distanceMeters(a: Coords, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.latitude);
  const dLng = toRad(b.lng - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function isWithinCleanupEventWindow(event: MapCleanupEvent, now: Date): boolean {
  if (!event.scheduled_start) return false;
  const start = new Date(event.scheduled_start);
  const windowStart = new Date(start.getTime() - CLEANUP_EVENT_GRACE_MINUTES_BEFORE * 60000);
  const endBase = event.scheduled_end ? new Date(event.scheduled_end) : start;
  const windowEnd = new Date(endBase.getTime() + CLEANUP_EVENT_GRACE_MINUTES_AFTER * 60000);
  return now >= windowStart && now <= windowEnd;
}

export interface LeaderboardEntry {
  entity_id: string;
  name: string;
  total_value: number;
  contribution_count: number;
  tracts_claimed: number;
}

export interface ActivityItem {
  id: string;
  user_id: string | null;
  actorName: string;
  actorUsername: string | null;
  groupName: string | null;
  groupSlug: string | null;
  value: number | null;
  notes: string | null;
  submitted_at: string;
}

interface Props {
  campaign: Campaign;
  claims: TerritoryClaim[];
  activeEvents: CampaignEvent[];
  claimLabels: Record<string, ClaimLabel>;
  userId: string | null;
  isAdmin?: boolean;
  userDisplayName: string | null;
  userUsername: string | null;
  userGroups: { id: string; name: string; image_url?: string | null }[];
  leaderboard: { users: LeaderboardEntry[]; groups: LeaderboardEntry[] };
  activity: ActivityItem[];
  unit: string;
  problemReports?: ProblemReports | null;
  eventCentroids?: Record<string, { lat: number; lng: number }>;
  eventGeoUnitIds?: Record<string, string[]>;
  partnerBusinesses?: MapBusiness[];
  cleanupEvents?: MapCleanupEvent[];
  focusCoords?: { latitude: number; longitude: number } | null;
}

interface NewContribution {
  lat: number;
  lng: number;
  value: number;
  photoUrl?: string;
  isGroupEvent?: boolean;
  key: number;
}

interface NewReport {
  id: string;
  lat: number;
  lng: number;
  severity: string;
  photoUrl?: string;
  key: number;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function RankBadge({ rank }: { rank: number }) {
  const base = "text-sm font-black w-5 text-center shrink-0";
  if (rank === 1) return <span className={`${base} text-yellow-400`}>1</span>;
  if (rank === 2) return <span className={`${base} text-zinc-300`}>2</span>;
  if (rank === 3) return <span className={`${base} text-amber-600`}>3</span>;
  return <span className={`${base} text-zinc-600 tabular-nums`}>{rank}</span>;
}

function LeaderboardPanel({
  users,
  groups,
  unit,
  campaignType,
}: {
  users: LeaderboardEntry[];
  groups: LeaderboardEntry[];
  unit: string;
  campaignType: string;
}) {
  const claimedLabel =
    campaignType === "territory" ? "tracts" :
    campaignType === "choropleth" ? "states" :
    null;

  return (
    <div className="py-2 space-y-3">
      <section>
        <div className="px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Individuals
        </div>
        {users.length === 0 ? (
          <div className="px-4 py-4 text-xs text-zinc-600 text-center">No individual contributions yet.</div>
        ) : (
          <ul className="divide-y divide-zinc-800/50">
            {users.map((entry, i) => (
              <li key={entry.entity_id} className="px-4 py-2.5 flex items-center gap-2.5">
                <RankBadge rank={i + 1} />
                <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">
                  {(entry.name || "?")[0].toUpperCase()}
                </div>
                <span className="flex-1 min-w-0 text-xs text-zinc-200 break-words">{entry.name}</span>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold text-zinc-300 tabular-nums">
                    {Math.round(entry.total_value).toLocaleString()} {unit}
                  </div>
                  {claimedLabel && (
                    <div className="text-xs text-zinc-600">{entry.tracts_claimed} {claimedLabel}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Groups
        </div>
        {groups.length === 0 ? (
          <div className="px-4 py-4 text-xs text-zinc-600 text-center">No group contributions yet.</div>
        ) : (
          <ul className="divide-y divide-zinc-800/50">
            {groups.map((entry, i) => (
              <li key={entry.entity_id} className="px-4 py-2.5 flex items-center gap-2.5">
                <RankBadge rank={i + 1} />
                <div className="w-6 h-6 rounded-full bg-emerald-900/40 border border-emerald-700/60 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
                  {(entry.name || "?")[0].toUpperCase()}
                </div>
                <span className="flex-1 min-w-0 text-xs text-zinc-200 break-words">{entry.name}</span>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold text-zinc-300 tabular-nums">
                    {Math.round(entry.total_value).toLocaleString()} {unit}
                  </div>
                  {claimedLabel && (
                    <div className="text-xs text-zinc-600">{entry.tracts_claimed} {claimedLabel}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function daysSince(dateStr: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000));
}

function StatsPanel({
  claims,
  leaderboard,
  campaignType,
  unit,
  eventCount,
  startsAt,
  userId,
}: {
  claims: TerritoryClaim[];
  leaderboard: { users: LeaderboardEntry[]; groups: LeaderboardEntry[] };
  campaignType: string;
  unit: string;
  eventCount: number;
  startsAt: string | null;
  userId: string | null;
}) {
  const totalValue = Math.round(claims.reduce((s, c) => s + (c.total_value ?? 0), 0));
  const claimedLabel =
    campaignType === "territory" ? "Tracts claimed" :
    campaignType === "choropleth" ? "States claimed" :
    campaignType === "hex_bloom" ? "Hexes claimed" :
    "Areas claimed";
  const contributorCount = leaderboard.users.length + leaderboard.groups.length;
  const topUser = leaderboard.users[0];
  const topGroup = leaderboard.groups[0];
  const daysRunning = startsAt ? daysSince(startsAt) : null;
  const userRank = userId ? leaderboard.users.findIndex((u) => u.entity_id === userId) + 1 : 0;

  const stats: { label: string; value: string }[] = [
    { label: "Total contributed", value: displayUnit(totalValue, unit) },
    { label: claimedLabel, value: claims.length.toLocaleString() },
    { label: "Contributors", value: contributorCount.toLocaleString() },
    { label: "Active events", value: eventCount.toLocaleString() },
  ];
  if (daysRunning !== null) {
    stats.push({ label: "Days running", value: daysRunning.toLocaleString() });
  }

  return (
    <div className="py-3">
      <dl className="grid grid-cols-2 gap-3 px-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5">
            <dt className="text-xs text-zinc-500">{s.label}</dt>
            <dd className="text-sm font-semibold text-zinc-200 tabular-nums mt-0.5">{s.value}</dd>
          </div>
        ))}
      </dl>

      {(topUser || topGroup) && (
        <div className="mt-4 px-4 space-y-2">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Leading the way</div>
          {topUser && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300">🏆 {topUser.name}</span>
              <span className="text-zinc-500 tabular-nums">{displayUnit(topUser.total_value, unit)}</span>
            </div>
          )}
          {topGroup && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-400">🏆 {topGroup.name}</span>
              <span className="text-zinc-500 tabular-nums">{displayUnit(topGroup.total_value, unit)}</span>
            </div>
          )}
        </div>
      )}

      {userRank > 0 && (
        <div className="mt-4 px-4">
          <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg px-3 py-2.5 flex items-center justify-between">
            <span className="text-xs text-emerald-300">Your rank</span>
            <span className="text-sm font-bold text-emerald-300 tabular-nums">#{userRank}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function displayUnit(value: number, unit: string): string {
  const n = Math.round(value);
  if (n === 1) return `1 ${unit.replace(/s$/, "")}`;
  return `${n.toLocaleString()} ${unit.endsWith("s") ? unit : unit + "s"}`;
}

function ActivityPanel({ items, unit, emptyMessage = "No activity yet." }: { items: ActivityItem[]; unit: string; emptyMessage?: string }) {
  if (items.length === 0) {
    return <div className="px-4 py-10 text-center text-zinc-600 text-xs">{emptyMessage}</div>;
  }
  return (
    <ul className="divide-y divide-zinc-800/50">
      {items.map((item) => (
        <li key={item.id} className="px-4 py-3 flex items-start gap-2.5">
          <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0 mt-0.5">
            {(item.actorName || "?")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1 flex-wrap">
              {item.actorUsername ? (
                <Link
                  href={`/users/${item.actorUsername}`}
                  className="text-xs font-semibold text-zinc-200 hover:text-zinc-100 transition-colors"
                >
                  {item.actorName}
                </Link>
              ) : (
                <span className="text-xs font-semibold text-zinc-200">{item.actorName}</span>
              )}
              {item.groupName && item.groupSlug && (
                <>
                  <span className="text-xs text-zinc-600">via</span>
                  <Link
                    href={`/groups/${item.groupSlug}`}
                    className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {item.groupName}
                  </Link>
                </>
              )}
              <span className="text-xs text-zinc-500">
                {displayUnit(item.value ?? 1, unit)}
              </span>
            </div>
            {item.notes && (
              <p className="mt-0.5 text-xs text-zinc-600 line-clamp-1">{item.notes}</p>
            )}
          </div>
          <span className="text-xs text-zinc-600 shrink-0 mt-0.5">{timeAgo(item.submitted_at)}</span>
        </li>
      ))}
    </ul>
  );
}

const BLOOM_MILESTONES = [
  { threshold: 5_000,   label: "First Sparks" },
  { threshold: 15_000,  label: "Growing Network" },
  { threshold: 40_000,  label: "Grid Rising" },
  { threshold: 100_000, label: "Solarpunk World" },
] as const;

export default function CampaignPageClient({
  campaign,
  claims,
  activeEvents,
  claimLabels,
  userId,
  isAdmin,
  userDisplayName,
  userUsername,
  userGroups,
  leaderboard,
  activity,
  unit,
  problemReports,
  eventCentroids,
  eventGeoUnitIds,
  partnerBusinesses,
  cleanupEvents,
  focusCoords,
}: Props) {
  const [hexEventsExpanded, setHexEventsExpanded] = useState(false);
  const [pinPickerActive, setPinPickerActive] = useState(false);
  const [pinPickerInitialCoords, setPinPickerInitialCoords] = useState<Coords | null>(null);
  const [pinPickerConstrained, setPinPickerConstrained] = useState(true);
  const [pinPickerLabel, setPinPickerLabel] = useState<string | undefined>(undefined);
  const [placedPinCoords, setPlacedPinCoords] = useState<Coords | null>(null);
  const [newContribution, setNewContribution] = useState<NewContribution | null>(null);
  const [newReport, setNewReport] = useState<NewReport | null>(null);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [locationError, setLocationError] = useState<number | null>(null);
  // The map's GeolocateControl is the single geolocation source for the page (see
  // CampaignMap) — this lets ContributionPanel request a fix without making its own
  // competing geolocation call.
  const triggerGeolocateRef = useRef<(() => boolean) | null>(null);
  const [activeMapStyle, setActiveMapStyle] = useState("outdoor");
  const [nycNeighborhoodsVisible, setNycNeighborhoodsVisible] = useState(false);
  const [openPanel, setOpenPanel] = useState<"leaderboard" | "activity" | "mine" | "stats" | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>(activity);
  const [localProblemReports, setLocalProblemReports] = useState<ProblemReports | null | undefined>(problemReports);
  const [clickedReport, setClickedReport] = useState<ProblemReportMapData | null>(null);
  const [areaPickerActive, setAreaPickerActive] = useState(false);
  const [pickedAreas, setPickedAreas] = useState<SelectedArea[]>([]);
  const [routePickerActive, setRoutePickerActive] = useState(false);
  const [liveRouteVertices, setLiveRouteVertices] = useState<[number, number][]>([]);
  const [placedRouteVertices, setPlacedRouteVertices] = useState<[number, number][] | null>(null);
  const [showTimedEventModal, setShowTimedEventModal] = useState(false);
  const [timedEventFormKey, setTimedEventFormKey] = useState(0);
  const [activeEventsList, setActiveEventsList] = useState<CampaignEvent[]>(activeEvents);
  const [localEventGeoUnitIds, setLocalEventGeoUnitIds] = useState<Record<string, string[]>>(eventGeoUnitIds ?? {});

  // Geofence auto-prompt: surfaces a banner when the user's live GPS position is near a
  // group-hosted cleanup event during its scheduled window (+ grace), so attendees don't
  // have to remember to open the contribute modal manually. Dismissing a given event's
  // banner suppresses it for the rest of the session (userLocation keeps updating on every
  // GeolocateControl fix, so without this it would just reappear on the next tick).
  const [dismissedCleanupEventIds, setDismissedCleanupEventIds] = useState<Set<string>>(new Set());
  const [pendingCleanupEventId, setPendingCleanupEventId] = useState<string | null>(null);

  // Raw proximity check, independent of banner dismissal — this is what actually feeds the
  // "count this toward the event?" checkbox inside the log dialog, so dismissing the banner
  // must not suppress it (the banner and the log-dialog checkbox are separate concerns).
  const nearbyCleanupEventRaw = useMemo(() => {
    if (!userLocation || !cleanupEvents || cleanupEvents.length === 0) return null;
    const now = new Date();
    return (
      cleanupEvents.find(
        (event) =>
          isWithinCleanupEventWindow(event, now) &&
          distanceMeters(userLocation, event) <= CLEANUP_EVENT_PROXIMITY_METERS,
      ) ?? null
    );
  }, [userLocation, cleanupEvents]);

  const nearbyCleanupEvent = useMemo(() => {
    if (!nearbyCleanupEventRaw || dismissedCleanupEventIds.has(nearbyCleanupEventRaw.id)) return null;
    return nearbyCleanupEventRaw;
  }, [nearbyCleanupEventRaw, dismissedCleanupEventIds]);

  // NYC neighborhoods mosaic overlay: too confusing layered over the zip choropleth for
  // a general audience, so there's no visible toggle for it in the normal UI. Kept
  // reachable for admins via the admin dialog (gear button) instead.
  const nycNeighborhoodsAvailable = !!isAdmin && campaign.slug === "trash-war";
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  // "Hide until next page refresh" (triggered from inside AdminDialog) — mirrors
  // CreateTimedEventButton's own dismiss pattern. Lets an admin clear the gear
  // button out of screenshots/recordings without needing to remember anything;
  // it comes back on the next page load.
  const [adminControlsHidden, setAdminControlsHidden] = useState(false);

  const [cleanupRoutesList, setCleanupRoutesList] = useState<CampaignCleanupRoute[]>([]);

  useEffect(() => {
    let cancelled = false;
    listCampaignCleanupRoutes(campaign.id)
      .then((routes) => { if (!cancelled) setCleanupRoutesList(routes); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [campaign.id]);

  const handleRouteAdded = (route: { id: string; route: RouteLineString }) => {
    const full: CampaignCleanupRoute = {
      id: route.id,
      route: route.route,
      group_id: null,
      group_name: null,
      group_logo_url: null,
      buffer: null,
    };
    setCleanupRoutesList((prev) => [full, ...prev.filter((r) => r.id !== route.id)]);
  };

  const handleContributionSubmitted = (
    lat: number | null,
    lng: number | null,
    value: number,
    photoUrl?: string,
    resolvedReportId?: string,
    newRoute?: { id: string; route: RouteLineString },
    isGroupEvent?: boolean,
  ) => {
    if (lat !== null && lng !== null) {
      setNewContribution({ lat, lng, value, photoUrl, isGroupEvent, key: Date.now() });
    }
    if (newRoute) {
      handleRouteAdded(newRoute);
    }
    if (resolvedReportId) {
      setLocalProblemReports((prev) =>
        prev ? { ...prev, reports: prev.reports.filter((r) => r.id !== resolvedReportId) } : prev,
      );
    }
    if (userId) {
      setActivityItems((prev) => [
        {
          id: `optimistic-${Date.now()}`,
          user_id: userId,
          actorName: userDisplayName ?? "You",
          actorUsername: userUsername,
          groupName: null,
          groupSlug: null,
          value,
          notes: null,
          submitted_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  };

  const handleReportSubmitted = (lat: number, lng: number, severity: string, photoUrl?: string) => {
    setNewReport({ id: `optimistic-${Date.now()}`, lat, lng, severity, photoUrl, key: Date.now() });
  };

  // Claim-a-report challenge mode: patch a single report's claim fields in place (claimed,
  // before-photo submitted, expired) rather than removing it — it stays visible on the map
  // with a different treatment until fully resolved.
  const handleReportClaimUpdated = (reportId: string, patch: Partial<ProblemReportMapData>) => {
    setLocalProblemReports((prev) =>
      prev
        ? { ...prev, reports: prev.reports.map((r) => (r.id === reportId ? { ...r, ...patch } : r)) }
        : prev,
    );
  };

  // The after-photo step resolves the report server-side immediately (independent of
  // whether the user goes on to finish logging bags/pounds), so the pin comes off the map
  // right away — same removal as the plain in-range "resolve_report_id" flow.
  const handleReportClaimResolved = (reportId: string) => {
    setLocalProblemReports((prev) =>
      prev ? { ...prev, reports: prev.reports.filter((r) => r.id !== reportId) } : prev,
    );
  };

  // Challenge mode is one-active-claim-per-user — this is the single source of truth for
  // "which report (if any) does the current user have claimed right now", derived from the
  // same live report list the map renders, so it stays in sync with every claim/before-photo/
  // after-photo update and with the local optimistic expiry patch in ContributionPanel.
  const myActiveClaimReport = useMemo(() => {
    if (!userId || !localProblemReports) return null;
    return (
      localProblemReports.reports.find(
        (r) => r.claimed_by_user_id === userId && (r.status === "scheduled" || r.status === "in_progress"),
      ) ?? null
    );
  }, [localProblemReports, userId]);

  const handleEnterPinPicker = (coords: Coords, constrained = true, label?: string) => {
    setPlacedPinCoords(null);
    setPinPickerInitialCoords(coords);
    setPinPickerConstrained(constrained);
    setPinPickerLabel(label);
    setPinPickerActive(true);
  };

  const handlePinPlaced = (lat: number, lng: number) => {
    setPlacedPinCoords({ latitude: lat, longitude: lng });
    setPinPickerActive(false);
  };

  const handlePinCancelled = () => {
    setPlacedPinCoords(null);
    setPinPickerActive(false);
  };

  const handleEnterRoutePicker = () => {
    setPlacedRouteVertices(null);
    setLiveRouteVertices([]);
    setRoutePickerActive(true);
  };

  const handleRoutePickerFinish = () => {
    setPlacedRouteVertices(liveRouteVertices);
    setRoutePickerActive(false);
  };

  const handleRoutePickerCancel = () => {
    setPlacedRouteVertices(null);
    setRoutePickerActive(false);
  };

  const togglePanel = (panel: "leaderboard" | "activity" | "mine" | "stats") => {
    setOpenPanel((p) => (p === panel ? null : panel));
  };

  const handleRequestAreaPick = () => {
    setShowTimedEventModal(false);
    setAreaPickerActive(true);
  };

  const handleTimedEventModalOpenChange = (open: boolean) => {
    setShowTimedEventModal(open);
    if (!open) {
      setPickedAreas([]);
      setTimedEventFormKey((k) => k + 1);
    }
  };

  const handleAreaPickerConfirm = () => {
    setAreaPickerActive(false);
    setShowTimedEventModal(true);
  };

  const handleAreaPickerCancel = () => {
    setAreaPickerActive(false);
    setShowTimedEventModal(true);
  };

  const isHexBloom = campaign.campaign_type === "hex_bloom";
  const showEventsChip = activeEventsList.length > 0 && !isHexBloom;
  const statsButtonActive = !openPanel && !pinPickerActive && !areaPickerActive && !routePickerActive;
  const bloomTotal = isHexBloom
    ? Math.round(claims.reduce((s, c) => s + (c.total_value ?? 0), 0))
    : 0;
  const nextMilestoneIdx = BLOOM_MILESTONES.findIndex((m) => bloomTotal < m.threshold);
  const nextMilestone = nextMilestoneIdx >= 0 ? BLOOM_MILESTONES[nextMilestoneIdx] : null;
  const prevThreshold = nextMilestoneIdx > 0 ? BLOOM_MILESTONES[nextMilestoneIdx - 1].threshold : 0;
  const bloomProgressPct = nextMilestone
    ? Math.min(((bloomTotal - prevThreshold) / (nextMilestone.threshold - prevThreshold)) * 100, 100)
    : 100;

  return (
    <>
      <CampaignMapWrapper
        campaign={campaign}
        claims={claims}
        activeEvents={activeEventsList}
        claimLabels={claimLabels}
        campaignType={campaign.campaign_type ?? undefined}
        pinPickerActive={pinPickerActive}
        pinPickerInitialCoords={pinPickerInitialCoords}
        pinPickerConstrained={pinPickerConstrained}
        pinPickerLabel={pinPickerLabel}
        onPinPlaced={handlePinPlaced}
        onPinCancelled={handlePinCancelled}
        areaPickerActive={areaPickerActive}
        onAreaPickerChange={setPickedAreas}
        onAreaPickerConfirm={handleAreaPickerConfirm}
        onAreaPickerCancel={handleAreaPickerCancel}
        routePickerActive={routePickerActive}
        onRoutePickerChange={setLiveRouteVertices}
        onRoutePickerFinish={handleRoutePickerFinish}
        onRoutePickerCancel={handleRoutePickerCancel}
        newContribution={newContribution}
        newReport={newReport}
        userLocation={userLocation}
        focusCoords={focusCoords}
        activeStyle={activeMapStyle}
        nycNeighborhoodsVisible={nycNeighborhoodsVisible}
        problemReports={localProblemReports}
        onReportClick={setClickedReport}
        eventCentroids={eventCentroids}
        eventGeoUnitIds={localEventGeoUnitIds}
        cleanupRoutes={cleanupRoutesList}
        partnerBusinesses={partnerBusinesses}
        cleanupEvents={cleanupEvents}
        onUserLocationChange={(coords) => {
          setUserLocation(coords);
          if (coords) setLocationError(null);
        }}
        onUserLocationError={setLocationError}
        onGeolocateTrigger={(trigger) => { triggerGeolocateRef.current = trigger; }}
        onMobileStatsClick={
          statsButtonActive && (showEventsChip || (campaign.geo_unit?.includes("zip") ?? false))
            ? () => togglePanel("leaderboard")
            : undefined
        }
      />

      {/* Side panel */}
      {openPanel && !pinPickerActive && !areaPickerActive && !routePickerActive && (
        <div className="absolute bottom-0 left-0 right-0 h-[55vh] sm:h-auto sm:inset-y-0 sm:left-auto sm:right-0 sm:w-72 bg-zinc-950/95 backdrop-blur-sm border-t sm:border-t-0 sm:border-l border-zinc-800 flex flex-col z-20 overflow-hidden">
          {/* Header: tab buttons + close */}
          <div className="flex items-center border-b border-zinc-800 shrink-0 px-2 pt-2 pb-0 gap-1">
            <button
              onClick={() => setOpenPanel("leaderboard")}
              className={`flex-1 py-2 text-xs font-semibold rounded-t-md transition-colors ${
                openPanel === "leaderboard"
                  ? "text-zinc-100 border-b-2 border-zinc-300"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Leaderboard
            </button>
            <button
              onClick={() => setOpenPanel("activity")}
              className={`flex-1 py-2 text-xs font-semibold rounded-t-md transition-colors ${
                openPanel === "activity"
                  ? "text-zinc-100 border-b-2 border-zinc-300"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Activity
            </button>
            {userId && (
              <button
                onClick={() => setOpenPanel("mine")}
                className={`flex-1 py-2 text-xs font-semibold rounded-t-md transition-colors ${
                  openPanel === "mine"
                    ? "text-emerald-300 border-b-2 border-emerald-400"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Mine
              </button>
            )}
            <button
              onClick={() => setOpenPanel("stats")}
              className={`flex-1 py-2 text-xs font-semibold rounded-t-md transition-colors ${
                openPanel === "stats"
                  ? "text-zinc-100 border-b-2 border-zinc-300"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Stats
            </button>
            <button
              onClick={() => setOpenPanel(null)}
              aria-label="Close panel"
              className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 mb-0.5"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {openPanel === "leaderboard" && (
              <LeaderboardPanel users={leaderboard.users} groups={leaderboard.groups} unit={unit} campaignType={campaign.campaign_type ?? ""} />
            )}
            {openPanel === "activity" && (
              <ActivityPanel items={activityItems} unit={unit} />
            )}
            {openPanel === "mine" && (
              <>
                {userUsername && (
                  <div className="px-4 pt-3 pb-1 flex items-center justify-between border-b border-zinc-800/60">
                    <span className="text-xs text-zinc-500">Your submissions</span>
                    <Link href={`/users/${userUsername}`} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                      Manage on profile →
                    </Link>
                  </div>
                )}
                <ActivityPanel items={activityItems.filter((a) => a.user_id === userId)} unit={unit} emptyMessage="You haven't contributed yet." />
              </>
            )}
            {openPanel === "stats" && (
              <StatsPanel
                claims={claims}
                leaderboard={leaderboard}
                campaignType={campaign.campaign_type ?? ""}
                unit={unit}
                eventCount={activeEventsList.length}
                startsAt={campaign.starts_at}
                userId={userId}
              />
            )}
          </div>
        </div>
      )}

      {/* Activity button — opens the Leaderboard/Activity/Mine panel. Hidden when panel open. */}
      {statsButtonActive && (
        <>
          {/* Desktop: always top-right, clear of native map controls */}
          <div className="hidden sm:block absolute top-3 right-[3.25rem] z-20">
            <button
              onClick={() => togglePanel("leaderboard")}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors backdrop-blur-sm shadow-md bg-zinc-900/80 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              📊 Activity
            </button>
          </div>
          {/* Mobile: next to the Events chip if it's showing (handled inside CampaignMap), otherwise
              upper-left — stacked above the World Bloom widget for hex_bloom campaigns via the
              shared flex column below, so it never overlaps it. */}
          {!showEventsChip && !isHexBloom && !(campaign.geo_unit?.includes("zip") ?? false) && (
            <div className="sm:hidden absolute left-4 z-20 top-4">
              <button
                onClick={() => togglePanel("leaderboard")}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors backdrop-blur-sm shadow-md bg-zinc-900/80 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                📊 Activity
              </button>
            </div>
          )}
        </>
      )}

      {isAdmin && !pinPickerActive && (
        <>
          {!adminControlsHidden && (
            <button
              onClick={() => setShowAdminDialog(true)}
              title="Admin controls"
              className="absolute z-20 top-4 right-[3.25rem] sm:top-11 w-8 h-8 flex items-center justify-center text-base rounded-lg border transition-colors backdrop-blur-sm shadow-md bg-zinc-900/80 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              ⚙️
            </button>
          )}
          <AdminDialog
            open={showAdminDialog}
            onOpenChange={setShowAdminDialog}
            onOpenTimedEvent={() => {
              setShowAdminDialog(false);
              setShowTimedEventModal(true);
            }}
            showNycToggle={nycNeighborhoodsAvailable}
            nycNeighborhoodsVisible={nycNeighborhoodsVisible}
            onNycNeighborhoodsVisibleChange={setNycNeighborhoodsVisible}
            onHideControls={() => {
              setAdminControlsHidden(true);
              setShowAdminDialog(false);
            }}
          />
          <CreateTimedEventButton
            campaignId={campaign.id}
            formKey={timedEventFormKey}
            open={showTimedEventModal}
            onOpenChange={handleTimedEventModalOpenChange}
            areaPicker={{ mode: "external", areas: pickedAreas, onRequestPick: handleRequestAreaPick }}
            hideTrigger
            onCreated={(event) => {
              if (event.started_at && new Date(event.started_at).getTime() > Date.now()) return;
              setActiveEventsList((prev) => [
                {
                  id: event.id,
                  campaign_id: event.campaign_id,
                  trigger_id: null,
                  geo_unit_id: pickedAreas[0]?.geoUnitId ?? null,
                  event_type: event.event_type,
                  title: event.title,
                  description: event.description,
                  effect_config: null,
                  status: event.status as CampaignEvent["status"],
                  started_at: event.started_at,
                  ends_at: event.ends_at,
                  resolved_at: null,
                  image_url: event.image_url,
                },
                ...prev,
              ]);
              setLocalEventGeoUnitIds((prev) => ({
                ...prev,
                [event.id]: pickedAreas.map((a) => a.geoUnitId),
              }));
              setPickedAreas([]);
            }}
          />
        </>
      )}

      {isHexBloom && !pinPickerActive && !areaPickerActive && (
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
          {activeEventsList.length > 0 && (
            <button
              onClick={() => setHexEventsExpanded((e) => !e)}
              className="self-start sm:hidden px-3 py-1.5 bg-emerald-950/90 border border-emerald-700 rounded-lg backdrop-blur-sm text-emerald-300 text-xs font-semibold"
            >
              ⚡ {activeEventsList.length} Event{activeEventsList.length > 1 ? "s" : ""} {hexEventsExpanded ? "▲" : "▼"}
            </button>
          )}
          {activeEventsList.length > 0 && (
            <div className={`${hexEventsExpanded ? "flex" : "hidden"} sm:flex flex-col gap-2`}>
              {activeEventsList.map((event) => (
                <div
                  key={event.id}
                  className="w-56 px-3 py-2 bg-emerald-950/90 border border-emerald-700 rounded-lg backdrop-blur-sm"
                >
                  <p className="text-emerald-300 text-xs font-semibold">{event.title}</p>
                  {event.description && (
                    <p className="text-emerald-500 text-xs mt-0.5">{event.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-start gap-2">
            <div className="w-48 px-3 py-2 bg-zinc-950/90 rounded-lg border border-zinc-800 backdrop-blur-sm pointer-events-none">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">World Bloom</span>
                <span className="text-[10px] text-emerald-400/80 tabular-nums font-mono">
                  {bloomTotal.toLocaleString()} pts
                </span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-emerald-400 transition-all duration-700"
                  style={{ width: `${bloomProgressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-emerald-400/60 font-medium">
                  {nextMilestone ? nextMilestone.label : "Max reached!"}
                </span>
                {nextMilestone && (
                  <span className="text-[10px] text-zinc-600 tabular-nums font-mono">
                    {(nextMilestone.threshold - bloomTotal).toLocaleString()} to go
                  </span>
                )}
              </div>
            </div>
            {statsButtonActive && (
              <div className="sm:hidden z-20 shrink-0">
                <button
                  onClick={() => togglePanel("leaderboard")}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors backdrop-blur-sm shadow-md bg-zinc-900/80 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                >
                  📊 Activity
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {nearbyCleanupEvent && !pinPickerActive && !areaPickerActive && (
        <div className="absolute top-4 left-4 right-16 sm:top-auto sm:right-auto sm:inset-x-auto sm:bottom-24 sm:left-1/2 sm:-translate-x-1/2 z-20 sm:w-[calc(100%-2rem)] sm:max-w-sm px-4 py-3 rounded-xl bg-sky-950/95 border border-sky-700/50 backdrop-blur-sm shadow-lg flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 rounded-full bg-sky-900/60 border border-sky-700/50 flex items-center justify-center text-lg">
            🧹
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sky-300 text-xs font-semibold truncate">{nearbyCleanupEvent.title}</p>
            <p className="text-sky-500 text-xs">You&apos;re at this cleanup — log your contribution</p>
          </div>
          <button
            onClick={() => setDismissedCleanupEventIds((prev) => new Set(prev).add(nearbyCleanupEvent.id))}
            className="shrink-0 text-sky-500 hover:text-sky-300 text-sm px-1"
            aria-label="Dismiss"
          >
            ✕
          </button>
          <button
            onClick={() => setPendingCleanupEventId(nearbyCleanupEvent.id)}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-sky-950 text-xs font-semibold shadow-sm transition-colors"
          >
            Log here
          </button>
        </div>
      )}

      <ContributionPanel
        campaignId={campaign.id}
        campaignContributionType={campaign.contribution_type}
        userId={userId}
        userGroups={userGroups}
        onEnterPinPicker={handleEnterPinPicker}
        pinPickerActive={pinPickerActive}
        placedPinCoords={placedPinCoords}
        onEnterRoutePicker={handleEnterRoutePicker}
        routePickerActive={routePickerActive}
        placedRouteVertices={placedRouteVertices}
        onContributionSubmitted={handleContributionSubmitted}
        onReportSubmitted={handleReportSubmitted}
        onRouteAdded={handleRouteAdded}
        userLocation={userLocation}
        locationError={locationError}
        requestLocation={() => triggerGeolocateRef.current?.() ?? false}
        activeMapStyle={activeMapStyle}
        onStyleChange={setActiveMapStyle}
        pendingCleanupEventId={pendingCleanupEventId}
        onPendingCleanupEventConsumed={() => setPendingCleanupEventId(null)}
        nearbyCleanupEvent={nearbyCleanupEventRaw}
        clickedReport={clickedReport}
        onClickedReportConsumed={() => setClickedReport(null)}
        onClaimReportUpdated={handleReportClaimUpdated}
        onClaimReportResolved={handleReportClaimResolved}
        myActiveClaimReport={myActiveClaimReport}
      />
    </>
  );
}
