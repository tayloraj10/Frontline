import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import CampaignPageClient, { CampaignStatBar } from "./CampaignPageClient";
import type { LeaderboardEntry, ActivityItem } from "./CampaignPageClient";
import { CAMPAIGN_TYPE_CONFIG } from "@/config/campaigns";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface Props {
  params: Promise<{ slug: string }>;
}

type ProblemReportMapData = { id: string; geo_unit_id: string | null; severity: string; reported_at: string; photo_url: string | null; latitude: number; longitude: number; unit_type: string | null };
type ProblemReports = { reports: ProblemReportMapData[]; counts_by_geo_unit: Record<string, number>; threshold: number | null };
type EventCentroid = { geo_unit_id: string; lat: number; lng: number };
type RawLbEntry = { entity_id: string; total_value: number; contribution_count: number; tracts_claimed: number };

// Everything here is public, RLS-open data (or FastAPI-computed data with no
// per-user variance), so it's safe to share one cache entry across all
// visitors. Bounds Supabase/FastAPI reads to once per REVALIDATE_SECONDS
// regardless of traffic, instead of once per page view. In-session updates
// (new claims, cleanups, reports) still arrive live via the Supabase
// Realtime subscriptions in CampaignMap.tsx, so this only affects how fresh
// a brand-new page load's initial numbers are.
const REVALIDATE_SECONDS = 20;

const getCampaignPageData = unstable_cache(
  async (slug: string, fastapiUrl: string) => {
    const supabase = createPublicClient();

    const { data } = await supabase.schema("public").from("campaigns").select("*").eq("slug", slug).single();
    const campaign = data as Campaign | null;
    if (!campaign) return null;
    // geo_unit can come back from Postgres as a nested array (e.g. [['zip', 'uk_postcode_district']])
    // depending on how it was last written; flatten once here so callers can rely on a flat array.
    campaign.geo_unit = campaign.geo_unit?.flat() ?? null;

    const [
      { data: claimsData },
      { data: eventsData },
      { count: contribCount },
      lbRes,
      { data: actContribsData },
      problemReportsRes,
      eventCentroidsRes,
    ] = await Promise.all([
      supabase.from("territory_claims").select("*").eq("campaign_id", campaign.id),
      supabase.from("campaign_events").select("*").eq("campaign_id", campaign.id).eq("status", "active"),
      supabase.from("contributions").select("*", { count: "exact", head: true }).eq("campaign_id", campaign.id),
      fetch(`${fastapiUrl}/api/campaigns/${campaign.id}/leaderboard`, { cache: "no-store" }).catch(() => null),
      supabase
        .from("contributions")
        .select("id, user_id, group_id, value, notes, submitted_at")
        .eq("campaign_id", campaign.id)
        .order("submitted_at", { ascending: false })
        .limit(20),
      campaign.campaign_type === "territory"
        ? fetch(`${fastapiUrl}/api/problem-reports/campaign/${campaign.id}`, { cache: "no-store" }).catch(() => null)
        : Promise.resolve(null),
      campaign.campaign_type === "territory"
        ? fetch(`${fastapiUrl}/api/events/campaign/${campaign.id}/centroids`, { cache: "no-store" }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const problemReports: ProblemReports | null = problemReportsRes?.ok ? await problemReportsRes.json() : null;

    const eventCentroidList: EventCentroid[] = eventCentroidsRes?.ok ? await eventCentroidsRes.json() : [];
    const eventCentroids: Record<string, { lat: number; lng: number }> = Object.fromEntries(
      eventCentroidList.map((c) => [c.geo_unit_id, { lat: c.lat, lng: c.lng }])
    );

    const lbRaw: { users: RawLbEntry[]; groups: RawLbEntry[]; total_value?: number } = lbRes?.ok
      ? await lbRes.json()
      : { users: [], groups: [] };

    return {
      campaign,
      claims: (claimsData ?? []) as TerritoryClaim[],
      events: (eventsData ?? []) as CampaignEvent[],
      contribCount: contribCount ?? 0,
      actContribs: actContribsData ?? [],
      problemReports,
      eventCentroids,
      lbRaw,
    };
  },
  ["campaign-page-data"],
  { revalidate: REVALIDATE_SECONDS }
);

export default async function CampaignPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

  const [{ data: { user } }, pageData] = await Promise.all([
    supabase.auth.getUser(),
    getCampaignPageData(slug, fastapiUrl),
  ]);

  if (!pageData) notFound();
  const { campaign, claims, events, contribCount, actContribs, problemReports, eventCentroids, lbRaw } = pageData;

  const { data: membershipData } = user
    ? await supabase.from("group_members").select("group_id").eq("user_id", user.id)
    : { data: [] as { group_id: string }[] };

  const tractsCount = claims.length;
  const totalBags = Math.round(
    lbRaw.total_value ?? claims.reduce((s, c) => s + (c.total_value ?? 0), 0)
  );
  const contributionCount = contribCount ?? 0;

  const unit =
    campaign.campaign_type === "territory" ? "bags" :
    campaign.campaign_type === "choropleth" ? "registrations" :
    campaign.campaign_type === "heatmap" ? "unfollows" :
    campaign.campaign_type === "hex_bloom" ? "bloom points" :
    "photos";

  // Collect all IDs to resolve
  const userGroupIds = (membershipData ?? []).map((m) => m.group_id);
  const claimedUserIds = [...new Set(claims.filter((c) => c.claimed_by_user).map((c) => c.claimed_by_user!))];
  const claimedGroupIds = [...new Set(claims.filter((c) => c.claimed_by_group).map((c) => c.claimed_by_group!))];
  const lbUserIds = lbRaw.users.map((u) => u.entity_id);
  const lbGroupIds = lbRaw.groups.map((g) => g.entity_id);
  const actUserIds = [...new Set(actContribs.filter((c) => c.user_id).map((c) => c.user_id!))];
  const actGroupIds = [...new Set(actContribs.filter((c) => c.group_id).map((c) => c.group_id!))];

  const allUserIds = [...new Set([...claimedUserIds, ...lbUserIds, ...actUserIds, ...(user?.id ? [user.id] : [])])];
  const allGroupIds = [...new Set([...claimedGroupIds, ...lbGroupIds, ...actGroupIds, ...userGroupIds])];

  const [{ data: profilesData }, { data: groupsData }] = await Promise.all([
    allUserIds.length > 0
      ? supabase.schema("public").from("profiles").select("id, username, display_name").in("id", allUserIds)
      : Promise.resolve({ data: [] as { id: string; username: string; display_name: string | null }[] }),
    allGroupIds.length > 0
      ? supabase.from("groups").select("id, name, slug, image_url").in("id", allGroupIds)
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string; image_url: string | null }[] }),
  ]);

  const profilesById = new Map((profilesData ?? []).map((p) => [p.id, p]));
  const groupsById = new Map((groupsData ?? []).map((g) => [g.id, g]));

  // Claim labels for map
  type ClaimLabel = { name: string; isGroup: boolean; groupSlug?: string };
  const claimLabels: Record<string, ClaimLabel> = {};
  for (const claim of claims) {
    if (!claim.geo_unit_id) continue;
    if (claim.claimed_by_group && groupsById.has(claim.claimed_by_group)) {
      const g = groupsById.get(claim.claimed_by_group)!;
      claimLabels[claim.geo_unit_id] = { name: g.name, isGroup: true, groupSlug: g.slug };
    } else if (claim.claimed_by_user && profilesById.has(claim.claimed_by_user)) {
      const p = profilesById.get(claim.claimed_by_user)!;
      claimLabels[claim.geo_unit_id] = { name: p.display_name ?? p.username, isGroup: false };
    }
  }

  // User groups for contribution panel
  const userGroups = userGroupIds
    .map((id) => groupsById.get(id))
    .filter((g): g is { id: string; name: string; slug: string; image_url: string | null } => !!g)
    .map((g) => ({ id: g.id, name: g.name, image_url: g.image_url }));

  // Enriched leaderboard
  const leaderboard = {
    users: lbRaw.users.map((u): LeaderboardEntry => ({
      ...u,
      name: (() => { const p = profilesById.get(u.entity_id); return p ? (p.display_name ?? p.username) : "Unknown"; })(),
    })),
    groups: lbRaw.groups.map((g): LeaderboardEntry => ({
      ...g,
      name: groupsById.get(g.entity_id)?.name ?? "Unknown Group",
    })),
  };

  // Enriched activity
  const activity: ActivityItem[] = actContribs.map((c) => {
    const profile = c.user_id ? profilesById.get(c.user_id) : null;
    const group = c.group_id ? groupsById.get(c.group_id) : null;
    return {
      id: c.id,
      user_id: c.user_id,
      actorName: profile ? (profile.display_name ?? profile.username) : "Unknown",
      actorUsername: profile?.username ?? null,
      groupName: group?.name ?? null,
      groupSlug: group?.slug ?? null,
      value: c.value,
      notes: c.notes,
      submitted_at: c.submitted_at,
    };
  });

  const currentUserProfile = user?.id ? profilesById.get(user.id) : null;
  const userDisplayName = currentUserProfile ? (currentUserProfile.display_name ?? currentUserProfile.username) : null;
  const userUsername = currentUserProfile?.username ?? null;

  const cfg = CAMPAIGN_TYPE_CONFIG[campaign.campaign_type] ?? {
    icon: "🏁",
    label: campaign.campaign_type,
    color: "text-zinc-400",
    bg: "bg-zinc-800/20",
    border: "border-zinc-700/50",
    bar: "bg-zinc-600",
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="px-4 sm:px-6 py-3 border-b border-zinc-800 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/campaigns"
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors shrink-0"
          >
            ← Campaigns
          </Link>
          <span className="text-zinc-700 shrink-0">|</span>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-zinc-100 truncate leading-tight">
              {campaign.title}
            </h1>
            {campaign.description && (
              <p className="text-zinc-500 text-xs break-words">{campaign.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {events.length > 0 && (
            <span className="px-3 py-1 bg-red-900/40 border border-red-700/60 text-red-300 text-xs font-semibold rounded-full animate-pulse">
              ⚡ {events.length} Event{events.length > 1 ? "s" : ""}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}
          >
            {cfg.icon}
            <span>{cfg.label ?? campaign.campaign_type}</span>
          </span>
        </div>
      </div>

      <CampaignStatBar
        campaignId={campaign.id}
        campaignType={campaign.campaign_type}
        eventsCount={events.length}
        initialTotalBags={totalBags}
        initialTractsCount={tractsCount}
        initialContributionCount={contributionCount}
      />

      {campaign.campaign_type === "heatmap" && (
        <div className="px-5 py-2 border-b border-zinc-800/60 bg-zinc-950/60 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider shrink-0">What counts:</span>
          {[
            "Rage-bait accounts",
            "Outrage addiction",
            "Drama channels",
            "Overconsumption hauls",
            "Clout chasers",
            "Narcissist influencers",
            "Content farms",
            "Doomscroll traps",
          ].map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded-full bg-orange-900/20 border border-orange-700/30 text-orange-400/80 text-[10px] font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col flex-1 min-h-0 relative">
        <CampaignPageClient
          campaign={campaign}
          claims={claims}
          activeEvents={events}
          claimLabels={claimLabels}
          userId={user?.id ?? null}
          userDisplayName={userDisplayName}
          userUsername={userUsername}
          userGroups={userGroups}
          leaderboard={leaderboard}
          activity={activity}
          unit={unit}
          problemReports={problemReports}
          eventCentroids={eventCentroids}
        />
      </div>
    </div>
  );
}
