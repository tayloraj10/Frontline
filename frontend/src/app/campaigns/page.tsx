import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CAMPAIGN_TYPE_CONFIG, CONTRIBUTION_LABELS } from "@/config/campaigns";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const campaigns = (data ?? []) as Campaign[];

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 w-full">
      <div className="mb-10">
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
          Active Campaigns
        </h1>
        <p className="text-zinc-500 mt-2 text-sm">
          {campaigns.length} mission{campaigns.length !== 1 ? "s" : ""} running —{" "}
          pick your fight.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-28 text-zinc-600">
          <p className="text-5xl mb-4">🌍</p>
          <p className="font-semibold text-zinc-500">No active campaigns yet.</p>
          <p className="text-sm mt-1">Check back soon.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((campaign) => {
            const cfg = CAMPAIGN_TYPE_CONFIG[campaign.campaign_type] ?? {
              icon: "🏁",
              color: "text-zinc-400",
              bg: "bg-zinc-800/20",
              border: "border-zinc-700/50",
              bar: "bg-zinc-600",
            };

            return (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.slug}`}
                className="group relative block p-6 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-2xl transition-all duration-200 overflow-hidden"
              >
                {/* Colored top accent bar */}
                <div
                  className={`absolute top-0 left-0 right-0 h-0.5 ${cfg.bar} opacity-40 group-hover:opacity-80 transition-opacity`}
                />

                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Badges row */}
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.border} ${cfg.color}`}
                      >
                        <span>{cfg.icon}</span>
                        <span className="capitalize">{campaign.campaign_type}</span>
                      </span>
                      {campaign.contribution_type && (
                        <span className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs rounded-full">
                          {CONTRIBUTION_LABELS[campaign.contribution_type] ??
                            campaign.contribution_type}
                        </span>
                      )}
                    </div>

                    <h2 className="font-bold text-lg text-zinc-100 group-hover:text-white leading-snug">
                      {campaign.title}
                    </h2>
                    {campaign.description && (
                      <p className="text-zinc-500 text-sm mt-1.5 line-clamp-2 leading-relaxed">
                        {campaign.description}
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  <span className="text-zinc-600 group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all text-xl mt-0.5 flex-shrink-0">
                    →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
