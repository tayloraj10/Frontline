import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CampaignPageClient from "./CampaignPageClient";
import type { LeaderboardEntry, ActivityItem } from "./CampaignPageClient";
import { CAMPAIGN_TYPE_CONFIG } from "@/config/campaigns";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface Props {
  params: Promise<{ slug: string }>;
}

function CampaignStat({
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

export default async function CampaignPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("campaigns").select("*").eq("slug", slug).single(),
  ]);

  const campaign = data as Campaign | null;
  if (!campaign) notFound();

  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

  const [
    { data: claimsData },
    { data: eventsData },
    { count: contribCount },
    { data: membershipData },
    lbRes,
    { data: actContribsData },
    problemReportsRes,
    eventCentroidsRes,
  ] = await Promise.all([
    supabase.from("territory_claims").select("*").eq("campaign_id", campaign.id),
    supabase.from("campaign_events").select("*").eq("campaign_id", campaign.id).eq("status", "active"),
    supabase.from("contributions").select("*", { count: "exact", head: true }).eq("campaign_id", campaign.id),
    user
      ? supabase.from("group_members").select("group_id").eq("user_id", user.id)
      : Promise.resolve({ data: [] as { group_id: string }[] }),
    fetch(`${fastapiUrl}/api/campaigns/${campaign.id}/leaderboard`, { next: { revalidate: 30 } }).catch(() => null),
    supabase
      .from("contributions")
      .select("id, user_id, group_id, value, notes, submitted_at")
      .eq("campaign_id", campaign.id)
      .order("submitted_at", { ascending: false })
      .limit(20),
    campaign.campaign_type === "territory"
      ? fetch(`${fastapiUrl}/api/problem-reports/campaign/${campaign.id}`, { next: { revalidate: 60 } }).catch(() => null)
      : Promise.resolve(null),
    campaign.campaign_type === "territory"
      ? fetch(`${fastapiUrl}/api/events/campaign/${campaign.id}/centroids`, { next: { revalidate: 60 } }).catch(() => null)
      : Promise.resolve(null),
  ]);

  type ProblemReportMapData = { id: string; geo_unit_id: string | null; severity: string; reported_at: string; photo_url: string | null; latitude: number; longitude: number };
  type ProblemReports = { reports: ProblemReportMapData[]; counts_by_geo_unit: Record<string, number>; threshold: number | null };
  const problemReports: ProblemReports | null = problemReportsRes?.ok ? await problemReportsRes.json() : null;

  type EventCentroid = { geo_unit_id: string; lat: number; lng: number };
  const eventCentroidList: EventCentroid[] = eventCentroidsRes?.ok ? await eventCentroidsRes.json() : [];
  const eventCentroids: Record<string, { lat: number; lng: number }> = Object.fromEntries(
    eventCentroidList.map((c) => [c.geo_unit_id, { lat: c.lat, lng: c.lng }])
  );

  const claims = (claimsData ?? []) as TerritoryClaim[];
  const events = (eventsData ?? []) as CampaignEvent[];
  const tractsCount = claims.length;
  const totalBags = Math.round(claims.reduce((s, c) => s + (c.total_value ?? 0), 0));
  const contributionCount = contribCount ?? 0;

  const unit =
    campaign.campaign_type === "territory" ? "bags" :
    campaign.campaign_type === "choropleth" ? "registrations" :
    campaign.campaign_type === "heatmap" ? "unfollows" :
    campaign.campaign_type === "hex_bloom" ? "bloom points" :
    "photos";

  // Leaderboard raw data
  type RawLbEntry = { entity_id: string; total_value: number; contribution_count: number; tracts_claimed: number };
  const lbRaw: { users: RawLbEntry[]; groups: RawLbEntry[] } = lbRes?.ok
    ? await lbRes.json()
    : { users: [], groups: [] };

  const actContribs = actContribsData ?? [];

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
      ? supabase.from("profiles").select("id, username, display_name").in("id", allUserIds)
      : Promise.resolve({ data: [] as { id: string; username: string; display_name: string | null }[] }),
    allGroupIds.length > 0
      ? supabase.from("groups").select("id, name, slug, logo_url").in("id", allGroupIds)
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string; logo_url: string | null }[] }),
  ]);

  const profilesById = new Map((profilesData ?? []).map((p) => [p.id, p]));
  const groupsById = new Map((groupsData ?? []).map((g) => [g.id, g]));

  // Claim labels for map
  type ClaimLabel = { name: string; isGroup: boolean };
  const claimLabels: Record<string, ClaimLabel> = {};
  for (const claim of claims) {
    if (!claim.geo_unit_id) continue;
    if (claim.claimed_by_group && groupsById.has(claim.claimed_by_group)) {
      claimLabels[claim.geo_unit_id] = { name: groupsById.get(claim.claimed_by_group)!.name, isGroup: true };
    } else if (claim.claimed_by_user && profilesById.has(claim.claimed_by_user)) {
      const p = profilesById.get(claim.claimed_by_user)!;
      claimLabels[claim.geo_unit_id] = { name: p.display_name ?? p.username, isGroup: false };
    }
  }

  // User groups for contribution panel
  const userGroups = userGroupIds
    .map((id) => groupsById.get(id))
    .filter((g): g is { id: string; name: string; slug: string; logo_url: string | null } => !!g)
    .map((g) => ({ id: g.id, name: g.name, logo_url: g.logo_url }));

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
      <div className="px-4 sm:px-6 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-3">
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
              <p className="text-zinc-500 text-xs truncate">{campaign.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
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

      <div className="px-5 py-2 border-b border-zinc-800/60 bg-zinc-950/40 flex items-center gap-6 overflow-x-auto scrollbar-none">
        {campaign.campaign_type === "collage" ? (
          <CampaignStat label="Photos submitted" value={contributionCount.toLocaleString()} />
        ) : campaign.campaign_type === "choropleth" ? (
          <>
            <CampaignStat label="Total registrations" value={totalBags.toLocaleString()} />
            <CampaignStat label="States active" value={tractsCount} />
            <CampaignStat label="Contributions" value={contributionCount.toLocaleString()} />
          </>
        ) : campaign.campaign_type === "heatmap" ? (
          <CampaignStat label="Unfollows logged" value={contributionCount.toLocaleString()} />
        ) : campaign.campaign_type === "hex_bloom" ? (
          <>
            <CampaignStat label="World Bloom Score" value={totalBags.toLocaleString()} />
            <CampaignStat label="Hexes bloomed" value={tractsCount} />
            <CampaignStat label="Actions logged" value={contributionCount.toLocaleString()} />
          </>
        ) : (
          <>
            <CampaignStat label="Tracts claimed" value={tractsCount} />
            <CampaignStat label="Bags collected" value={totalBags.toLocaleString()} />
            <CampaignStat label="Contributions" value={contributionCount.toLocaleString()} />
          </>
        )}
        {events.length > 0 && (
          <CampaignStat label="Hotspots" value={events.length} highlight />
        )}
      </div>

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
