"use client";

import { useEffect, useState } from "react";
import type { DashboardLocation } from "@/app/partners/dashboard/PartnerDashboardClient";
import RadiusRadarMap from "./RadiusRadarMap";

type RadiusTier = "block" | "neighborhood" | "wide";

const TIER_LABELS: Record<RadiusTier, string> = {
  block: "Block",
  neighborhood: "Neighborhood",
  wide: "District",
};

// Below this, a tier's activity (contributions + cleanup events + trash reports) is
// treated as noise rather than a meaningful "cleaner area" signal.
export const MIN_TIER_ACTIVITY = 3;

type StatsBlock = {
  contribution_count: number;
  total_value: number;
  unique_contributors: number;
  trash_report_count: number;
};

type CampaignStats = {
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  local: StatsBlock;
  citywide: StatsBlock;
  floor_state: "building" | null;
};

type RadiusStatsResponse = {
  location_id: string;
  radius_tier: RadiusTier;
  radius_meters: number;
  campaigns: CampaignStats[];
};

const METERS_TO_FEET = 3.28084;

function formatFeet(meters: number): string {
  const feet = Math.round((meters * METERS_TO_FEET) / 50) * 50;
  return `${feet.toLocaleString()}ft`;
}

export default function BusinessRadiusView({
  businessId,
  locations,
  fastapiUrl,
  viewerUserId,
  onActivityChange,
}: {
  businessId: string;
  locations: DashboardLocation[];
  fastapiUrl: string;
  viewerUserId: string;
  onActivityChange?: (hasActivity: boolean) => void;
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [tier, setTier] = useState<RadiusTier>("neighborhood");
  const [data, setData] = useState<RadiusStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tierMeters, setTierMeters] = useState<Record<RadiusTier, number> | null>(null);
  const [tierActivity, setTierActivity] = useState<Record<RadiusTier, number> | null>(null);

  useEffect(() => {
    fetch(`${fastapiUrl}/api/partners/radius-tiers`)
      .then((res) => res.json())
      .then((json: Record<RadiusTier, number>) => setTierMeters(json))
      .catch(() => {});
  }, [fastapiUrl]);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    const params = new URLSearchParams({ viewer_user_id: viewerUserId });
    fetch(`${fastapiUrl}/api/partners/businesses/${businessId}/locations/${locationId}/tier-activity?${params}`)
      .then((res) => res.json())
      .then((json: Record<RadiusTier, number>) => {
        if (!cancelled) setTierActivity(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [businessId, locationId, fastapiUrl, viewerUserId]);

  const shownTiers = (Object.keys(TIER_LABELS) as RadiusTier[]).filter(
    (t) => !tierActivity || tierActivity[t] >= MIN_TIER_ACTIVITY
  );
  // Until tierActivity has loaded we don't know yet — assume active so the section doesn't
  // flash away and back. Once loaded, no activity in any tier means nothing to show at all.
  const hasActivity = !tierActivity || shownTiers.length > 0;

  useEffect(() => {
    onActivityChange?.(hasActivity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActivity]);

  useEffect(() => {
    if (tierActivity && shownTiers.length > 0 && !shownTiers.includes(tier)) {
      setTier(shownTiers[shownTiers.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierActivity]);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ viewer_user_id: viewerUserId, radius_tier: tier });
    fetch(`${fastapiUrl}/api/partners/businesses/${businessId}/locations/${locationId}/radius-stats?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? "Failed to load radius stats");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, locationId, tier, fastapiUrl, viewerUserId]);

  if (locations.length === 0) {
    return <p className="text-xs text-zinc-600">Add a location to see radius-of-influence stats.</p>;
  }

  const selectedLocation = locations.find((l) => l.id === locationId) ?? null;

  return (
    <div className="space-y-4">
      {locations.length > 1 && (
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label ?? l.address_line1 ?? l.id}
            </option>
          ))}
        </select>
      )}

      {!hasActivity ? (
        <p className="text-xs text-zinc-600">
          {locations.length > 1
            ? "No nearby activity for this location yet — try another location, or check back once cleanups, events, or trash reports happen close by."
            : "No nearby activity yet — this will show up once cleanups, events, or trash reports happen close by."}
        </p>
      ) : (
        <>
          <div className="flex gap-1">
            {shownTiers.map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={`flex-1 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors duration-150 ${
                  tier === t
                    ? "bg-emerald-700 text-white"
                    : "bg-zinc-900 text-zinc-500 hover:text-zinc-300 border border-zinc-800"
                }`}
              >
                {TIER_LABELS[t]}
                {tierMeters && (
                  <span className="block text-[10px] font-normal opacity-80">
                    {formatFeet(tierMeters[t])}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading && <p className="text-xs text-zinc-600">Loading…</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}

          {data && data.campaigns.length === 0 && (
            <p className="text-xs text-zinc-600">This business isn't linked to any campaigns yet.</p>
          )}

          {data?.campaigns.map((c) => (
            <div key={c.campaign_id} className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/40">
              <p className="text-sm font-semibold text-zinc-200 mb-2">{c.campaign_name}</p>
              {c.floor_state === "building" ? (
                <p className="text-xs text-zinc-500">
                  This spot is just getting started — activity nearby will show up here as it comes in.
                </p>
              ) : (
                <div className="space-y-4">
                  {selectedLocation?.lat != null && selectedLocation?.lng != null && (
                    <RadiusRadarMap
                      businessId={businessId}
                      locationId={locationId}
                      campaignId={c.campaign_id}
                      centerLat={selectedLocation.lat}
                      centerLng={selectedLocation.lng}
                      radiusTier={tier}
                      fastapiUrl={fastapiUrl}
                      viewerUserId={viewerUserId}
                    />
                  )}
                  <div className="space-y-1.5">
                    <p className="text-2xl font-black text-emerald-400">
                      {c.local.total_value.toLocaleString()}
                      <span className="text-xs font-normal text-zinc-500 ml-1.5">points earned in this radius</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {c.local.contribution_count} cleanup{c.local.contribution_count !== 1 ? "s" : ""} ·{" "}
                      {c.local.trash_report_count} trash report{c.local.trash_report_count !== 1 ? "s" : ""} ·{" "}
                      {c.local.unique_contributors} contributor{c.local.unique_contributors !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
