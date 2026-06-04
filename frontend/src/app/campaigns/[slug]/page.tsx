import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CampaignMap from "@/components/map/CampaignMap";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"] & {
  geo_units: { geojson: unknown; unit_id: string; display_name: string | null } | null;
};
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CampaignPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("slug", slug)
    .single();

  const campaign = data as Campaign | null;
  if (!campaign) notFound();

  const { data: claimsData } = await supabase
    .from("territory_claims")
    .select("*, geo_units(geojson, unit_id, display_name)")
    .eq("campaign_id", campaign.id);

  const { data: eventsData } = await supabase
    .from("campaign_events")
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("status", "active");

  const claims = (claimsData ?? []) as TerritoryClaim[];
  const events = (eventsData ?? []) as CampaignEvent[];

  return (
    <div className="flex flex-col flex-1">
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{campaign.title}</h1>
          {campaign.description && (
            <p className="text-zinc-400 text-sm">{campaign.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {events.length > 0 && (
            <span className="px-3 py-1 bg-red-900/50 border border-red-700 text-red-300 text-xs font-medium rounded-full animate-pulse">
              {events.length} Active Event{events.length > 1 ? "s" : ""}
            </span>
          )}
          <span className="px-3 py-1 bg-emerald-900/50 border border-emerald-700 text-emerald-300 text-xs font-medium rounded-full capitalize">
            {campaign.campaign_type}
          </span>
        </div>
      </div>

      <div className="flex-1">
        <CampaignMap campaign={campaign} claims={claims} activeEvents={events} />
      </div>
    </div>
  );
}
