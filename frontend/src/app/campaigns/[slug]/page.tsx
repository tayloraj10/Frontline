import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CampaignMapWrapper from "@/components/map/CampaignMapWrapper";
import ContributionPanel from "@/components/contributions/ContributionPanel";
import { CAMPAIGN_TYPE_CONFIG } from "@/config/campaigns";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface Props {
  params: Promise<{ slug: string }>;
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

  const [{ data: claimsData }, { data: eventsData }] =
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
    ]);

  const claims = (claimsData ?? []) as TerritoryClaim[];
  const events = (eventsData ?? []) as CampaignEvent[];

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

      <div className="flex flex-col flex-1 min-h-0 relative">
        <CampaignMapWrapper
          campaign={campaign}
          claims={claims}
          activeEvents={events}
        />
        {user && (
          <ContributionPanel
            campaignId={campaign.id}
            campaignContributionType={campaign.contribution_type}
            userId={user.id}
          />
        )}
      </div>
    </div>
  );
}
