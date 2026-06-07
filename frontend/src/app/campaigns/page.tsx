import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CAMPAIGN_TYPE_CONFIG, CONTRIBUTION_LABELS } from "@/config/campaigns";
import type { Database } from "@/types/database";
import OnboardingModalClient from "@/components/OnboardingModalClient";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

export default async function CampaignsPage() {
  const supabase = await createClient();
  const [{ data }, { data: { user } }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("status", "active").order("created_at", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  const campaigns = (data ?? []) as Campaign[];

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 w-full">
      {user && <OnboardingModalClient campaigns={campaigns} />}
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
                className="group relative block overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/80 p-5 pl-[18px] transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:shadow-xl hover:shadow-black/40"
              >
                {/* Left accent border */}
                <div className={`absolute inset-y-0 left-0 w-[3px] rounded-l-2xl ${cfg.bar} opacity-50 transition-opacity duration-300 group-hover:opacity-100`} />

<div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Badges + live indicator row */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                        <span>{cfg.icon}</span>
                        <span className="capitalize">{campaign.campaign_type}</span>
                      </span>
                      {campaign.contribution_type && (
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.border} ${cfg.color}`}>
                          {CONTRIBUTION_LABELS[campaign.contribution_type] ?? campaign.contribution_type}
                        </span>
                      )}
                      {(campaign.geo_scope as { scope?: string } | null)?.scope === "nationwide" && (
                        <span className="rounded-full border border-red-700/50 bg-red-900/20 px-2.5 py-1 text-xs font-semibold text-red-400">
                          US only
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-[10px] font-bold tracking-widest text-emerald-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                        LIVE
                      </span>
                    </div>

                    <h2 className="text-lg font-bold leading-snug text-zinc-100 group-hover:text-white">
                      {campaign.title}
                    </h2>
                    {campaign.description && (
                      <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                        {campaign.slug === "brainrot" ? (
                          <>
                            <strong className="font-semibold text-zinc-300">
                              {campaign.description.split(". ")[0]}.
                            </strong>{" "}
                            {campaign.description.split(". ").slice(1).join(". ")}
                          </>
                        ) : (
                          campaign.description
                        )}
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  <span className="mt-0.5 flex-shrink-0 text-xl text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-300">
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
