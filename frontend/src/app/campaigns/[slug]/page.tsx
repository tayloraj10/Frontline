import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import CampaignPageClient, { CampaignStatBar } from "./CampaignPageClient";
import type { LeaderboardEntry, ActivityItem } from "./CampaignPageClient";
import { CAMPAIGN_TYPE_CONFIG } from "@/config/campaigns";
import type { Database } from "@/types/database";
import type { MapBusiness, MapBusinessLocation, MapCleanupEvent } from "@/components/map/CampaignMap";
import CampaignInstructionsModal from "@/components/CampaignInstructionsModal";
import BackButton from "@/components/ui/BackButton";
import ShareButton from "@/components/ShareButton";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lat?: string; lng?: string; zoom?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createPublicClient();
  const { data: campaign } = await supabase
    .schema("public")
    .from("campaigns")
    .select("title, description")
    .eq("slug", slug)
    .single();

  if (!campaign) return {};

  const title = campaign.title;
  const description = campaign.description ?? `Join the ${campaign.title} campaign on Frontline.`;

  return {
    title,
    description,
    openGraph: { title, description, url: `/campaigns/${slug}` },
    twitter: { title, description },
  };
}

type ProblemReportMapData = {
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
};
type ProblemReports = { reports: ProblemReportMapData[]; counts_by_geo_unit: Record<string, number>; threshold: number | null; flag_auto_hide_threshold: number };
type EventCentroid = { geo_unit_id: string; lat: number; lng: number };
type RawLbEntry = {
  entity_id: string;
  total_value: number;
  contribution_count: number;
  tracts_claimed: number;
  territory_types?: string[];
  small_bags?: number;
  large_bags?: number;
  pounds?: number;
};
type PartnerBusinessRow = {
  id: string; name: string; slug: string; description: string | null; logo_url: string | null;
  website_url: string | null; status: string;
  partner_business_locations: { id: string; label: string | null; lat: number; lng: number; google_maps_url: string | null; status: string }[];
};
type OfferRequirement = { title: string; mode: "spend" | "threshold"; requirement: number; location_id: string | null };

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
      eventCentroidsRes,
      { data: bagMetricsData },
    ] = await Promise.all([
      supabase.from("territory_claims").select("*").eq("campaign_id", campaign.id),
      supabase.from("campaign_events").select("*").eq("campaign_id", campaign.id).eq("status", "active").lte("started_at", new Date().toISOString()),
      supabase.from("contributions").select("*", { count: "exact", head: true }).eq("campaign_id", campaign.id),
      fetch(`${fastapiUrl}/api/campaigns/${campaign.id}/leaderboard`, { cache: "no-store" }).catch(() => null),
      supabase
        .from("contributions")
        .select("id, user_id, group_id, value, notes, submitted_at, cleanup_id, cleanups!cleanup_id(metrics_small_bags, metrics_large_bags, metrics_pounds)")
        .eq("campaign_id", campaign.id)
        .order("submitted_at", { ascending: false })
        .limit(20),
      campaign.campaign_type === "territory"
        ? fetch(`${fastapiUrl}/api/events/campaign/${campaign.id}/centroids`, { cache: "no-store" }).catch(() => null)
        : Promise.resolve(null),
      campaign.campaign_type === "territory"
        ? supabase.from("cleanups").select("metrics_small_bags, metrics_large_bags, metrics_pounds").eq("campaign_id", campaign.id)
        : Promise.resolve({ data: [] as { metrics_small_bags: number | null; metrics_large_bags: number | null; metrics_pounds: number | null }[] }),
    ]);

    const eventCentroidList: EventCentroid[] = eventCentroidsRes?.ok ? await eventCentroidsRes.json() : [];
    const eventCentroids: Record<string, { lat: number; lng: number }> = Object.fromEntries(
      eventCentroidList.map((c) => [c.geo_unit_id, { lat: c.lat, lng: c.lng }])
    );

    const events = (eventsData ?? []) as CampaignEvent[];
    const eventIds = events.map((e) => e.id);
    const { data: eventGeoUnitRows } = eventIds.length > 0
      ? await supabase.from("campaign_event_geo_units").select("event_id, geo_unit_id").in("event_id", eventIds)
      : { data: [] as { event_id: string; geo_unit_id: string }[] };
    const eventGeoUnitIds: Record<string, string[]> = {};
    for (const row of eventGeoUnitRows ?? []) {
      (eventGeoUnitIds[row.event_id] ??= []).push(row.geo_unit_id);
    }

    const { data: businessLinkRows } = await supabase
      .from("campaign_partner_businesses")
      .select(
        "partner_businesses(id, name, slug, description, logo_url, website_url, status, partner_business_locations(id, label, lat, lng, google_maps_url, status))"
      )
      .eq("campaign_id", campaign.id);
    const linkedBusinesses = (businessLinkRows ?? [])
      .map((row) => row.partner_businesses as unknown as PartnerBusinessRow | null)
      .filter((b): b is PartnerBusinessRow => !!b && b.status === "active" && b.partner_business_locations.some((l) => l.status === "active"));

    const businessIds = linkedBusinesses.map((b) => b.id);
    const { data: activeOfferRows } = businessIds.length > 0
      ? await supabase
          .from("partner_offers")
          .select("business_id, title, starts_at, ends_at, redemption_mode, points_cost, points_threshold, location_id")
          .in("business_id", businessIds)
          .eq("status", "active")
      : {
          data: [] as {
            business_id: string; title: string; starts_at: string; ends_at: string | null;
            redemption_mode: "spend" | "threshold"; points_cost: number | null; points_threshold: number | null;
            location_id: string | null;
          }[],
        };
    const nowIso = new Date().toISOString();
    // Full active-offer catalog is public data (same rows /partners already exposes), so it's
    // safe to keep inside the shared cache. Per-viewer affordability is computed from this
    // afterward, outside the cache boundary — see the comment on getCampaignPageData. Each
    // offer carries its own location_id (null = valid at every location of the business), so
    // per-location filtering happens where MapBusiness.locations is built below.
    const activeOffersByBusiness = new Map<string, OfferRequirement[]>();
    for (const row of activeOfferRows ?? []) {
      if (row.starts_at > nowIso) continue;
      if (row.ends_at && row.ends_at <= nowIso) continue;
      const requirement = row.redemption_mode === "spend" ? row.points_cost ?? 0 : row.points_threshold ?? 0;
      const list = activeOffersByBusiness.get(row.business_id) ?? [];
      list.push({ title: row.title, mode: row.redemption_mode, requirement, location_id: row.location_id });
      activeOffersByBusiness.set(row.business_id, list);
    }

    const partnerBusinesses: MapBusiness[] = linkedBusinesses.map((b) => {
      const businessOffers = activeOffersByBusiness.get(b.id) ?? [];
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        description: b.description,
        logo_url: b.logo_url,
        website_url: b.website_url,
        locations: b.partner_business_locations
          .filter((l) => l.status === "active")
          .map((l): MapBusinessLocation => {
            const offersForLocation = businessOffers.filter((o) => o.location_id === null || o.location_id === l.id);
            return {
              id: l.id,
              label: l.label,
              lat: l.lat,
              lng: l.lng,
              google_maps_url: l.google_maps_url,
              activeOfferTitle: offersForLocation[0]?.title ?? null,
              offers: offersForLocation,
            };
          }),
      };
    });

    const lbRaw: { users: RawLbEntry[]; groups: RawLbEntry[]; total_value?: number } = lbRes?.ok
      ? await lbRes.json()
      : { users: [], groups: [] };

    const bagMetrics = (bagMetricsData ?? []).reduce(
      (acc, c) => {
        acc.small += c.metrics_small_bags ?? 0;
        acc.large += c.metrics_large_bags ?? 0;
        acc.pounds += c.metrics_pounds ?? 0;
        return acc;
      },
      { small: 0, large: 0, pounds: 0 }
    );

    return {
      campaign,
      claims: (claimsData ?? []) as TerritoryClaim[],
      events,
      contribCount: contribCount ?? 0,
      actContribs: actContribsData ?? [],
      eventCentroids,
      eventGeoUnitIds,
      partnerBusinesses,
      lbRaw,
      bagMetrics,
    };
  },
  ["campaign-page-data"],
  { revalidate: REVALIDATE_SECONDS }
);

export default async function CampaignPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { lat, lng, zoom } = await searchParams;
  const focusCoords =
    lat && lng && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))
      ? {
          latitude: Number(lat),
          longitude: Number(lng),
          zoom: zoom && !Number.isNaN(Number(zoom)) ? Number(zoom) : undefined,
        }
      : null;
  const supabase = await createClient();
  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

  const [{ data: { user } }, pageData] = await Promise.all([
    supabase.auth.getUser(),
    getCampaignPageData(slug, fastapiUrl),
  ]);

  if (!pageData) notFound();
  const { campaign, claims, events, contribCount, actContribs, eventCentroids, eventGeoUnitIds, partnerBusinesses, lbRaw, bagMetrics } = pageData;

  // Fetched uncached (unlike the rest of this page's data, which is batched behind a
  // 20s unstable_cache) so a just-created event shows up immediately instead of waiting
  // out the cache window — mirrors how groups/[slug]/page.tsx fetches its events list.
  const cleanupEventsRes = await fetch(`${fastapiUrl}/api/cleanup-events/campaign/${campaign.id}`, { cache: "no-store" }).catch(() => null);
  const cleanupEvents: MapCleanupEvent[] = cleanupEventsRes?.ok ? await cleanupEventsRes.json() : [];

  // Also fetched uncached, same reason: problem_reports mutate constantly via the
  // claim flow (claim/before-photo/after-photo/release), and serving a claim off a
  // stale 20s-cached snapshot was causing the just-claimed report to appear reverted
  // to "open" or to vanish entirely on the very next page data refresh.
  const problemReportsRes = campaign.campaign_type === "territory"
    ? await fetch(`${fastapiUrl}/api/problem-reports/campaign/${campaign.id}`, { cache: "no-store" }).catch(() => null)
    : null;
  const problemReports: ProblemReports | null = problemReportsRes?.ok ? await problemReportsRes.json() : null;

  const [{ data: membershipData }, { data: adminProfile }, { data: myContribsData }] = await Promise.all([
    user
      ? supabase.from("group_members").select("group_id, role").eq("user_id", user.id)
      : Promise.resolve({ data: [] as { group_id: string; role: string }[] }),
    user
      ? supabase.schema("public").from("profiles").select("is_admin, points, spendable_points").eq("id", user.id).single()
      : Promise.resolve({ data: null as { is_admin: boolean; points: number; spendable_points: number } | null }),
    // Per-viewer, so fetched here rather than inside getCampaignPageData's shared cache — the
    // cached "activity" feed above is only the 20 most-recent contributions campaign-wide, so a
    // user's own contributions can easily fall out of that window on an active campaign even
    // though they still have plenty of history. This guarantees "Mine" always reflects reality.
    user
      ? supabase
          .from("contributions")
          .select("id, user_id, group_id, value, notes, submitted_at, cleanup_id, cleanups!cleanup_id(metrics_small_bags, metrics_large_bags, metrics_pounds)")
          .eq("campaign_id", campaign.id)
          .eq("user_id", user.id)
          .order("submitted_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as typeof actContribs }),
  ]);
  const isAdmin = adminProfile?.is_admin ?? false;

  // Per-viewer, so computed here rather than inside getCampaignPageData's shared cache
  // (see the cache-boundary comment above it) — otherwise one visitor's eligibility would
  // leak onto the cached response served to every other visitor of this campaign page.
  const partnerBusinessesWithEligibility: MapBusiness[] = partnerBusinesses.map((b) => ({
    ...b,
    locations: b.locations.map((l) => {
      const offers = l.offers ?? [];
      const affordable = adminProfile
        ? offers.find((o) =>
            o.mode === "spend"
              ? adminProfile.spendable_points >= o.requirement
              : adminProfile.points >= o.requirement
          )
        : undefined;
      return { ...l, affordableOfferTitle: affordable?.title ?? null };
    }),
  }));

  const tractsCount = claims.length;
  const totalBags = Math.round(
    lbRaw.total_value ?? claims.reduce((s, c) => s + (c.total_value ?? 0), 0)
  );
  const contributionCount = contribCount ?? 0;

  const unit =
    campaign.campaign_type === "territory" ? "pts" :
    campaign.campaign_type === "choropleth" ? "registrations" :
    campaign.campaign_type === "heatmap" ? "unfollows" :
    campaign.campaign_type === "hex_bloom" ? "bloom points" :
    "photos";

  // Collect all IDs to resolve
  const userGroupIds = (membershipData ?? []).map((m) => m.group_id);
  const adminGroupIds = new Set((membershipData ?? []).filter((m) => m.role === "admin").map((m) => m.group_id));
  const claimedUserIds = [...new Set(claims.filter((c) => c.claimed_by_user).map((c) => c.claimed_by_user!))];
  const claimedGroupIds = [...new Set(claims.filter((c) => c.claimed_by_group).map((c) => c.claimed_by_group!))];
  const lbUserIds = lbRaw.users.map((u) => u.entity_id);
  const lbGroupIds = lbRaw.groups.map((g) => g.entity_id);
  const myContribs = myContribsData ?? [];
  const actUserIds = [...new Set([...actContribs, ...myContribs].filter((c) => c.user_id).map((c) => c.user_id!))];
  const actGroupIds = [...new Set([...actContribs, ...myContribs].filter((c) => c.group_id).map((c) => c.group_id!))];

  const allUserIds = [...new Set([...claimedUserIds, ...lbUserIds, ...actUserIds, ...(user?.id ? [user.id] : [])])];
  const allGroupIds = [...new Set([...claimedGroupIds, ...lbGroupIds, ...actGroupIds, ...userGroupIds])];

  const [{ data: profilesData }, { data: groupsData }] = await Promise.all([
    allUserIds.length > 0
      ? supabase.schema("public").from("profiles").select("id, username, display_name, avatar_url").in("id", allUserIds)
      : Promise.resolve({ data: [] as { id: string; username: string; display_name: string | null; avatar_url: string | null }[] }),
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
    .map((g) => ({ id: g.id, name: g.name, image_url: g.image_url, isAdmin: adminGroupIds.has(g.id) }));

  // Enriched leaderboard
  const leaderboard = {
    users: lbRaw.users.map((u): LeaderboardEntry => {
      const p = profilesById.get(u.entity_id);
      return {
        ...u,
        name: p ? (p.display_name ?? p.username) : "Unknown",
        username: p?.username ?? null,
        avatar_url: p?.avatar_url ?? null,
      };
    }),
    groups: lbRaw.groups.map((g): LeaderboardEntry => ({
      ...g,
      name: groupsById.get(g.entity_id)?.name ?? "Unknown Group",
    })),
  };

  // Enriched activity — merges the shared cached "recent global" feed with the current
  // viewer's own contributions (fetched uncached above) so "Mine" doesn't miss real
  // history that fell outside the global feed's top-20 window; deduped by id.
  const mergedContribsById = new Map([...actContribs, ...myContribs].map((c) => [c.id, c]));
  const mergedContribs = [...mergedContribsById.values()].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );
  const activity: ActivityItem[] = mergedContribs.map((c) => {
    const profile = c.user_id ? profilesById.get(c.user_id) : null;
    const group = c.group_id ? groupsById.get(c.group_id) : null;
    const cleanup = c.cleanups as unknown as { metrics_small_bags: number | null; metrics_large_bags: number | null; metrics_pounds: number | null } | null;
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
      small_bags: cleanup?.metrics_small_bags ?? null,
      large_bags: cleanup?.metrics_large_bags ?? null,
      pounds: cleanup?.metrics_pounds ?? null,
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
      <div className="px-3 sm:px-6 py-2 sm:py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <BackButton href="/campaigns" label="Campaigns" labelClassName="hidden sm:inline" />
          <span className="text-zinc-700 shrink-0 hidden sm:inline">|</span>
          <div className="min-w-0 flex items-baseline gap-2 sm:gap-3">
            <h1 className="text-sm sm:text-base font-bold text-zinc-100 truncate leading-tight shrink-0">
              {campaign.title}
            </h1>
            {campaign.description && (
              <p className="hidden sm:block text-xs text-zinc-500 truncate leading-tight min-w-0">
                {campaign.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ShareButton variant="icon" content={{ title: campaign.title, text: campaign.description ?? undefined }} />
          <CampaignInstructionsModal slug={campaign.slug} description={campaign.description} />
          {events.length > 0 && (
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-red-900/40 border border-red-700/60 text-red-300 text-xs font-semibold rounded-full animate-pulse">
              ⚡ {events.length}
            </span>
          )}
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}
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
        initialSmallBags={bagMetrics.small}
        initialLargeBags={bagMetrics.large}
        initialPounds={bagMetrics.pounds}
      />

      {campaign.campaign_type === "heatmap" && (
        <div className="hidden sm:flex px-5 py-2 border-b border-zinc-800/60 bg-zinc-950/60 items-center gap-2 flex-wrap">
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
          isAdmin={isAdmin}
          userDisplayName={userDisplayName}
          userUsername={userUsername}
          userGroups={userGroups}
          leaderboard={leaderboard}
          activity={activity}
          unit={unit}
          problemReports={problemReports}
          eventCentroids={eventCentroids}
          eventGeoUnitIds={eventGeoUnitIds}
          partnerBusinesses={partnerBusinessesWithEligibility}
          cleanupEvents={cleanupEvents}
          focusCoords={focusCoords}
          bagMetrics={bagMetrics}
          contributionCount={contributionCount}
        />
      </div>
    </div>
  );
}
