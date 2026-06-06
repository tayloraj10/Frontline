"use client";

import { useState } from "react";
import Link from "next/link";
import CampaignMapWrapper, { type ClaimLabel } from "@/components/map/CampaignMapWrapper";
import ContributionPanel from "@/components/contributions/ContributionPanel";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface Coords {
  latitude: number;
  longitude: number;
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
  userGroups: { id: string; name: string }[];
  leaderboard: { users: LeaderboardEntry[]; groups: LeaderboardEntry[] };
  activity: ActivityItem[];
  unit: string;
}

interface NewContribution {
  lat: number;
  lng: number;
  value: number;
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
                <span className="flex-1 text-xs text-zinc-200 truncate">{entry.name}</span>
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
                <span className="flex-1 text-xs text-zinc-200 truncate">{entry.name}</span>
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

function displayUnit(value: number, unit: string): string {
  const n = Math.round(value);
  if (n === 1) return `1 ${unit.replace(/s$/, "")}`;
  return `${n.toLocaleString()} ${unit.endsWith("s") ? unit : unit + "s"}`;
}

function ActivityPanel({ items, unit }: { items: ActivityItem[]; unit: string }) {
  if (items.length === 0) {
    return <div className="px-4 py-10 text-center text-zinc-600 text-xs">No activity yet.</div>;
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

export default function CampaignPageClient({
  campaign,
  claims,
  activeEvents,
  claimLabels,
  userId,
  userGroups,
  leaderboard,
  activity,
  unit,
}: Props) {
  const [pinPickerActive, setPinPickerActive] = useState(false);
  const [pinPickerInitialCoords, setPinPickerInitialCoords] = useState<Coords | null>(null);
  const [pinPickerConstrained, setPinPickerConstrained] = useState(true);
  const [placedPinCoords, setPlacedPinCoords] = useState<Coords | null>(null);
  const [newContribution, setNewContribution] = useState<NewContribution | null>(null);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [activeMapStyle, setActiveMapStyle] = useState("outdoor");
  const [openPanel, setOpenPanel] = useState<"leaderboard" | "activity" | null>(null);

  const handleContributionSubmitted = (lat: number | null, lng: number | null, value: number, photoUrl?: string) => {
    if (lat === null || lng === null) return; // no-location contributions don't update the map
    setNewContribution({ lat, lng, value, photoUrl, key: Date.now() });
  };

  const handleEnterPinPicker = (coords: Coords, constrained = true) => {
    setPlacedPinCoords(null);
    setPinPickerInitialCoords(coords);
    setPinPickerConstrained(constrained);
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

  const togglePanel = (panel: "leaderboard" | "activity") => {
    setOpenPanel((p) => (p === panel ? null : panel));
  };

  return (
    <>
      <CampaignMapWrapper
        campaign={campaign}
        claims={claims}
        activeEvents={activeEvents}
        claimLabels={claimLabels}
        campaignType={campaign.campaign_type ?? undefined}
        pinPickerActive={pinPickerActive}
        pinPickerInitialCoords={pinPickerInitialCoords}
        pinPickerConstrained={pinPickerConstrained}
        onPinPlaced={handlePinPlaced}
        onPinCancelled={handlePinCancelled}
        newContribution={newContribution}
        userLocation={userLocation}
        activeStyle={activeMapStyle}
      />

      {/* Side panel */}
      {openPanel && !pinPickerActive && (
        <div className="absolute bottom-0 left-0 right-0 h-[55vh] sm:h-auto sm:inset-y-0 sm:left-auto sm:right-0 sm:w-72 bg-zinc-950/95 backdrop-blur-sm border-t sm:border-t-0 sm:border-l border-zinc-800 flex flex-col z-10 overflow-hidden">
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
              <ActivityPanel items={activity} unit={unit} />
            )}
          </div>
        </div>
      )}

      {/* Floating toggle buttons — only visible when panel is closed */}
      {!openPanel && !pinPickerActive && (
        <div className="absolute top-14 sm:top-3 left-4 sm:left-auto sm:right-[3.25rem] z-20 flex gap-1.5">
          <button
            onClick={() => setOpenPanel("leaderboard")}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors backdrop-blur-sm shadow-md bg-zinc-900/80 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          >
            Leaderboard
          </button>
          <button
            onClick={() => setOpenPanel("activity")}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors backdrop-blur-sm shadow-md bg-zinc-900/80 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          >
            Activity
          </button>
        </div>
      )}

      {userId ? (
        <ContributionPanel
          campaignId={campaign.id}
          campaignContributionType={campaign.contribution_type}
          userId={userId}
          userGroups={userGroups}
          onEnterPinPicker={handleEnterPinPicker}
          pinPickerActive={pinPickerActive}
          placedPinCoords={placedPinCoords}
          onContributionSubmitted={handleContributionSubmitted}
          onLocationCaptured={setUserLocation}
          activeMapStyle={activeMapStyle}
          onStyleChange={setActiveMapStyle}
        />
      ) : (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2.5 bg-zinc-950/90 backdrop-blur-sm border border-zinc-800 rounded-xl shadow-xl">
          <span className="text-xs text-zinc-400">Sign in to participate</span>
          <Link
            href="/login"
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100 text-xs font-semibold rounded-lg transition-colors"
          >
            Sign Up
          </Link>
        </div>
      )}
    </>
  );
}
