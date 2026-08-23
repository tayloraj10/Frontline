import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { formatPoints } from "@/lib/formatPoints";
import LeaderboardViewSwitch from "./LeaderboardViewSwitch";
import EntityLeaderboardTabs from "./EntityLeaderboardTabs";

interface TrashWarGroup {
  entity_id: string;
  name: string | null;
  slug: string | null;
  logo_url: string | null;
  total_value: number;
  contribution_count: number;
}

// Same 20s cache window as the campaign page's data fetch — this is public,
// no-per-user-variance data, so one cache entry can serve every visitor.
const REVALIDATE_SECONDS = 20;

const getTrashWarStats = unstable_cache(
  async (fastapiUrl: string) => {
    const supabase = createPublicClient();

    const { data: campaign } = await supabase
      .schema("public")
      .from("campaigns")
      .select("id")
      .eq("slug", "trash-war")
      .single();
    if (!campaign) return null;

    const [{ count: tractsCount }, { count: contribCount }, { data: bagRows }, lbRes] = await Promise.all([
      supabase.from("territory_claims").select("*", { count: "exact", head: true }).eq("campaign_id", campaign.id),
      supabase.from("contributions").select("*", { count: "exact", head: true }).eq("campaign_id", campaign.id),
      supabase.from("cleanups").select("metrics_small_bags, metrics_large_bags, metrics_pounds").eq("campaign_id", campaign.id),
      fetch(`${fastapiUrl}/api/campaigns/${campaign.id}/leaderboard`, { cache: "no-store" }).catch(() => null),
    ]);

    const lbRaw: { users: unknown[]; groups: TrashWarGroup[] } = lbRes?.ok
      ? await lbRes.json()
      : { users: [], groups: [] };
    const smallBags = (bagRows ?? []).reduce((sum, r) => sum + (r.metrics_small_bags ?? 0), 0);
    const largeBags = (bagRows ?? []).reduce((sum, r) => sum + (r.metrics_large_bags ?? 0), 0);
    const totalPounds = (bagRows ?? []).reduce((sum, r) => sum + (r.metrics_pounds ?? 0), 0);
    const totalBags = smallBags + largeBags;

    return {
      campaignId: campaign.id,
      tractsCount: tractsCount ?? 0,
      contribCount: contribCount ?? 0,
      totalBags,
      smallBags,
      largeBags,
      totalPounds,
      contributorCount: lbRaw.users.length + lbRaw.groups.length,
      groups: lbRaw.groups,
    };
  },
  ["trash-war-ranks-stats"],
  { revalidate: REVALIDATE_SECONDS }
);

export default async function GlobalLeaderboardPage() {
  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

  const trashWarStats = await getTrashWarStats(fastapiUrl);

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-zinc-100 leading-tight">Leaderboard</h1>
        <p className="text-sm text-zinc-500 mt-1">Trash War's pulse, plus points across every campaign.</p>
      </div>

      {trashWarStats && (
        <div className="mb-8">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Trash War Activity</div>
          <LeaderboardViewSwitch campaignId={trashWarStats.campaignId} fastapiUrl={fastapiUrl} unit="pts">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5 shadow-elevation-1">
                <dt className="text-xs text-zinc-500 flex items-baseline justify-between gap-1.5">
                  Total bags
                  <span className="text-sm font-semibold text-zinc-200 tabular-nums">{formatPoints(trashWarStats.totalBags)}</span>
                </dt>
                <div className="mt-1 text-[11px] text-zinc-500 tabular-nums">
                  {formatPoints(trashWarStats.smallBags)} small · {formatPoints(trashWarStats.largeBags)} large · {formatPoints(trashWarStats.totalPounds)} lbs
                </div>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5 shadow-elevation-1">
                <dt className="text-xs text-zinc-500 flex items-baseline justify-between gap-1.5">
                  Zip codes cleaned
                  <span className="text-sm font-semibold text-zinc-200 tabular-nums">{trashWarStats.tractsCount.toLocaleString()}</span>
                </dt>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5 shadow-elevation-1">
                <dt className="text-xs text-zinc-500 flex items-baseline justify-between gap-1.5">
                  Contributions
                  <span className="text-sm font-semibold text-zinc-200 tabular-nums">{trashWarStats.contribCount.toLocaleString()}</span>
                </dt>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5 shadow-elevation-1">
                <dt className="text-xs text-zinc-500 flex items-baseline justify-between gap-1.5">
                  Contributors
                  <span className="text-sm font-semibold text-zinc-200 tabular-nums">{trashWarStats.contributorCount.toLocaleString()}</span>
                </dt>
              </div>
            </dl>

            <EntityLeaderboardTabs fastapiUrl={fastapiUrl} />
          </LeaderboardViewSwitch>
        </div>
      )}
    </main>
  );
}
