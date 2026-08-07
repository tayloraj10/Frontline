import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { CAMPAIGN_TYPE_CONFIG, CONTRIBUTION_LABELS, CAMPAIGN_SLUG_ORDER } from "@/config/campaigns";
import type { Database } from "@/types/database";
import OnboardingModalClient from "@/components/OnboardingModalClient";
import OtherCampaignRow from "@/components/OtherCampaignRow";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

// Public, RLS-open data shared across all visitors — bounds the query to
// once per 30s regardless of traffic instead of once per page view.
const getActiveCampaigns = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .schema("public")
      .from("campaigns")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    return (data ?? []) as Campaign[];
  },
  ["active-campaigns"],
  { revalidate: 30 }
);

function CampaignCard({ campaign }: { campaign: Campaign }) {
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
          {/* Badges row */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.border} ${cfg.color}`}>
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
            </span>
            {campaign.contribution_type && (
              <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.border} ${cfg.color}`}>
                {CONTRIBUTION_LABELS[campaign.contribution_type] ?? campaign.contribution_type}
              </span>
            )}
            {campaign.slug !== "trash-war" && (campaign.geo_scope as { scope?: string; countries?: string[] } | null)?.scope === "nationwide" && (
              <span className="rounded-full border border-red-700/50 bg-red-900/20 px-2.5 py-1 text-xs font-semibold text-red-400">
                {(campaign.geo_scope as { countries?: string[] }).countries?.length
                  ? `${(campaign.geo_scope as { countries?: string[] }).countries!.join(" & ")} only`
                  : "US only"}
              </span>
            )}
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

        {/* Live indicator + arrow, always grouped together regardless of badge wrap */}
        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          <span className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            LIVE
          </span>
          <span className="text-xl text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-300">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function CampaignsPage() {
  const supabase = await createClient();
  const [campaignsData, { data: { user } }] = await Promise.all([
    getActiveCampaigns(),
    supabase.auth.getUser(),
  ]);

  let contribCount: number | null = null;
  if (user) {
    const { count } = await supabase.from("contributions").select("*", { count: "exact", head: true });
    contribCount = count ?? 0;
  }

  const campaigns = [...campaignsData].sort((a, b) => {
    const ai = CAMPAIGN_SLUG_ORDER.indexOf(a.slug);
    const bi = CAMPAIGN_SLUG_ORDER.indexOf(b.slug);
    const aOrder = ai === -1 ? Infinity : ai;
    const bOrder = bi === -1 ? Infinity : bi;
    return aOrder - bOrder;
  });

  const featuredCampaign = campaigns.find((c) => c.slug === "trash-war") ?? null;
  const otherCampaigns = campaigns.filter((c) => c.slug !== "trash-war");

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 w-full">
      {user && <OnboardingModalClient campaigns={campaigns} />}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
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
        <>
          {featuredCampaign && (
            <div className="mx-auto mt-6 max-w-xl">
              <CampaignCard campaign={featuredCampaign} />
              {user && contribCount !== null && (
                <div className="mt-4 flex justify-center gap-3">
                  <div className="flex-1 max-w-[130px] rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-3 py-2.5 text-center">
                    <div className="text-lg font-bold text-emerald-400 tabular-nums">{campaigns.length}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 tracking-wide">active campaigns</div>
                  </div>
                  <div className="flex-1 max-w-[130px] rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-3 py-2.5 text-center">
                    <div className="text-lg font-bold text-emerald-400 tabular-nums">{contribCount.toLocaleString()}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 tracking-wide">contributions logged</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {otherCampaigns.length > 0 && (
            <div className={featuredCampaign ? "mt-10" : ""}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                Other campaigns
              </h2>
              <div className="grid items-start gap-2 sm:grid-cols-2">
                {otherCampaigns.map((campaign) => (
                  <OtherCampaignRow key={campaign.id} campaign={campaign} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
