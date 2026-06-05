import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CampaignPageClient from "./CampaignPageClient";
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

  const [{ data: claimsData }, { data: eventsData }, { count: contribCount }, { data: membershipData }] =
    await Promise.all([
      supabase
        .from("territory_claims")
        .select("*")
        .eq("campaign_id", campaign.id),
      supabase
        .from("campaign_events")
        .select("*")
        .eq("campaign_id", campaign.id)
        .eq("status", "active"),
      supabase
        .from("contributions")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id),
      user
        ? supabase.from("group_members").select("group_id").eq("user_id", user.id)
        : Promise.resolve({ data: [] as { group_id: string }[] }),
    ]);

  const claims = (claimsData ?? []) as TerritoryClaim[];
  const events = (eventsData ?? []) as CampaignEvent[];
  const tractsCount = claims.length;

  const userGroupIds = (membershipData ?? []).map((m) => m.group_id);
  const { data: userGroupsData } = userGroupIds.length > 0
    ? await supabase.from("groups").select("id, name").in("id", userGroupIds)
    : { data: [] as { id: string; name: string }[] };
  const userGroups = (userGroupsData ?? []) as { id: string; name: string }[];
  const totalBags = Math.round(claims.reduce((s, c) => s + (c.total_value ?? 0), 0));
  const contributionCount = contribCount ?? 0;

  // Enrich claims with claimer display names
  const claimedUserIds = [...new Set(claims.filter((c) => c.claimed_by_user).map((c) => c.claimed_by_user!))];
  const claimedGroupIds = [...new Set(claims.filter((c) => c.claimed_by_group).map((c) => c.claimed_by_group!))];

  const [{ data: profilesData }, { data: groupsData }] = await Promise.all([
    claimedUserIds.length > 0
      ? supabase.from("profiles").select("id, username, display_name").in("id", claimedUserIds)
      : Promise.resolve({ data: [] as { id: string; username: string; display_name: string | null }[] }),
    claimedGroupIds.length > 0
      ? supabase.from("groups").select("id, name").in("id", claimedGroupIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const profilesById = new Map((profilesData ?? []).map((p) => [p.id, p.display_name ?? p.username]));
  const groupsById = new Map((groupsData ?? []).map((g) => [g.id, g.name]));

  type ClaimLabel = { name: string; isGroup: boolean };
  const claimLabels: Record<string, ClaimLabel> = {};
  for (const claim of claims) {
    if (!claim.geo_unit_id) continue;
    if (claim.claimed_by_group && groupsById.has(claim.claimed_by_group)) {
      claimLabels[claim.geo_unit_id] = { name: groupsById.get(claim.claimed_by_group)!, isGroup: true };
    } else if (claim.claimed_by_user && profilesById.has(claim.claimed_by_user)) {
      claimLabels[claim.geo_unit_id] = { name: profilesById.get(claim.claimed_by_user)!, isGroup: false };
    }
  }

  const cfg = CAMPAIGN_TYPE_CONFIG[campaign.campaign_type] ?? {
    icon: "🏁",
    color: "text-zinc-400",
    bg: "bg-zinc-800/20",
    border: "border-zinc-700/50",
    bar: "bg-zinc-600",
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-4">
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

        <div className="flex items-center gap-2 shrink-0">
          {events.length > 0 && (
            <span className="px-3 py-1 bg-red-900/40 border border-red-700/60 text-red-300 text-xs font-semibold rounded-full animate-pulse">
              ⚡ {events.length} Event{events.length > 1 ? "s" : ""}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}
          >
            {cfg.icon}
            <span className="capitalize">{campaign.campaign_type}</span>
          </span>
        </div>
      </div>

      <div className="px-5 py-2 border-b border-zinc-800/60 bg-zinc-950/40 flex items-center gap-6 overflow-x-auto scrollbar-none">
        <CampaignStat label="Tracts claimed" value={tractsCount} />
        <CampaignStat label="Bags collected" value={totalBags.toLocaleString()} />
        <CampaignStat label="Contributions" value={contributionCount.toLocaleString()} />
        {events.length > 0 && (
          <CampaignStat label="Boss events" value={events.length} highlight />
        )}
      </div>

      <div className="flex flex-col flex-1 min-h-0 relative">
        <CampaignPageClient
          campaign={campaign}
          claims={claims}
          activeEvents={events}
          claimLabels={claimLabels}
          userId={user?.id ?? null}
          userGroups={userGroups}
        />
      </div>
    </div>
  );
}
