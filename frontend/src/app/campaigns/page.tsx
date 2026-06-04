import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

const CAMPAIGN_ICONS: Record<string, string> = {
  territory: "🗑️",
  collage: "🌿",
  choropleth: "🗳️",
  heatmap: "🌌",
};

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const campaigns = (data ?? []) as Campaign[];

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Active Campaigns</h1>
        <p className="text-zinc-400 mt-1">Join the fight. Every action counts.</p>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-24 text-zinc-500">
          <p className="text-4xl mb-3">🌍</p>
          <p>No active campaigns yet. Check back soon.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.slug}`}
              className="block p-6 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl transition-colors group"
            >
              <div className="flex items-start gap-4">
                <span className="text-3xl">{CAMPAIGN_ICONS[campaign.campaign_type] ?? "🏁"}</span>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-lg group-hover:text-emerald-400 transition-colors truncate">
                    {campaign.title}
                  </h2>
                  {campaign.description && (
                    <p className="text-zinc-400 text-sm mt-1 line-clamp-2">{campaign.description}</p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <span className="text-xs px-2 py-1 bg-zinc-800 text-zinc-300 rounded-full capitalize">
                      {campaign.campaign_type}
                    </span>
                    <span className="text-xs px-2 py-1 bg-zinc-800 text-zinc-300 rounded-full capitalize">
                      {campaign.contribution_type}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
