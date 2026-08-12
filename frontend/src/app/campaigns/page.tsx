import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { CAMPAIGN_TYPE_CONFIG, CONTRIBUTION_LABELS, CAMPAIGN_SLUG_ORDER } from "@/config/campaigns";
import type { Database } from "@/types/database";
import OnboardingModalClient from "@/components/OnboardingModalClient";
import OtherCampaignRow from "@/components/OtherCampaignRow";
import ShareButton from "@/components/ShareButton";

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

// TODO: swap for a real rights-cleared cleanup/volunteer photo when one is picked.
const FEATURED_CARD_IMAGE_URL: string | null = null;

function CampaignCard({ campaign, featured = false }: { campaign: Campaign; featured?: boolean }) {
  const cfg = CAMPAIGN_TYPE_CONFIG[campaign.campaign_type] ?? {
    icon: "🏁",
    color: "text-zinc-400",
    bg: "bg-zinc-800/20",
    border: "border-zinc-700/50",
    bar: "bg-zinc-600",
  };

  return (
    <div
      key={campaign.id}
      className={`group relative overflow-hidden rounded-2xl p-5 pl-[18px] shadow-elevation-1 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] active:duration-100 ${
        featured
          ? "border border-emerald-700/60 bg-gradient-to-br from-emerald-950/50 via-zinc-900 to-zinc-900 shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_20px_50px_-15px_rgba(16,185,129,0.35)] hover:border-emerald-500/80 hover:shadow-[0_0_0_1px_rgba(16,185,129,0.15),0_25px_60px_-15px_rgba(16,185,129,0.5)] active:border-emerald-500/80"
          : "border border-zinc-800/80 bg-zinc-900/80 hover:border-zinc-700 hover:shadow-xl hover:shadow-black/40 active:border-zinc-700"
      }`}
    >
      {/* Full-card click target — sits below the content/share button (z-10) so both stay clickable. */}
      <Link
        href={`/campaigns/${campaign.slug}`}
        className="absolute inset-0 z-0 touch-manipulation"
        aria-label={campaign.title}
      />

      {featured && (
        <>
          {/* Background photo (or a stand-in texture until a real photo is chosen), heavily scrimmed so text stays legible */}
          {FEATURED_CARD_IMAGE_URL ? (
            <div
              className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-25 transition-opacity duration-300 group-hover:opacity-35"
              style={{ backgroundImage: `url(${FEATURED_CARD_IMAGE_URL})` }}
            />
          ) : (
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, rgb(16,185,129) 0px, rgb(16,185,129) 1.5px, transparent 1.5px, transparent 14px)",
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-zinc-950/90 via-zinc-950/70 to-emerald-950/40" />
          {/* Ambient glow */}
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl transition-opacity duration-300 group-hover:opacity-80" />
          {/* Oversized watermark emblem */}
          <span className="pointer-events-none absolute -right-3 -bottom-6 text-[9rem] leading-none text-emerald-500/10 select-none">
            {cfg.icon}
          </span>
        </>
      )}

      {/* Left accent border */}
      <div
        className={`absolute inset-y-0 left-0 rounded-l-2xl ${cfg.bar} transition-opacity duration-300 ${
          featured ? "w-[4px] opacity-90 group-hover:opacity-100" : "w-[3px] opacity-50 group-hover:opacity-100"
        }`}
      />

      <div className="relative z-10 flex items-start justify-between gap-3 pointer-events-none">
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

          <h2
            className={`font-black leading-snug text-zinc-100 group-hover:text-white ${
              featured ? "text-2xl tracking-tight bg-gradient-to-r from-white to-emerald-200 bg-clip-text text-transparent" : "text-lg font-bold"
            }`}
          >
            {campaign.title}
          </h2>
          {campaign.description && (
            <p className={`mt-1.5 leading-relaxed text-zinc-500 ${featured ? "text-sm max-w-md" : "text-sm"}`}>
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
        <div className="relative flex flex-shrink-0 flex-col items-end gap-2">
          <span className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            LIVE
          </span>
          <ShareButton
            variant="icon"
            size="sm"
            className="pointer-events-auto"
            content={{ title: campaign.title, text: campaign.description ?? undefined, url: `/campaigns/${campaign.slug}` }}
          />
          <span
            className={`text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-300 ${
              featured ? "text-2xl" : "text-xl"
            }`}
          >
            →
          </span>
        </div>
      </div>
    </div>
  );
}

export default async function CampaignsPage() {
  const supabase = await createClient();
  const [campaignsData, { data: { user } }] = await Promise.all([
    getActiveCampaigns(),
    supabase.auth.getUser(),
  ]);

  let contribCount: number | null = null;
  let userCount: number | null = null;
  if (user) {
    const [{ count: contribs }, { count: users }] = await Promise.all([
      supabase.from("contributions").select("*", { count: "exact", head: true }),
      supabase.schema("public").from("profiles").select("*", { count: "exact", head: true }),
    ]);
    contribCount = contribs ?? 0;
    userCount = users ?? 0;
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
        <p className="text-emerald-400/80 mt-1 text-xs font-semibold tracking-wide">
          Join us on the frontline.
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
              <CampaignCard campaign={featuredCampaign} featured />
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
                  {userCount !== null && (
                    <div className="flex-1 max-w-[130px] rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-3 py-2.5 text-center">
                      <div className="text-lg font-bold text-emerald-400 tabular-nums">{userCount.toLocaleString()}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 tracking-wide">users on the platform</div>
                    </div>
                  )}
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
