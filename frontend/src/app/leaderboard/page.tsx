import { Fragment } from "react";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { formatPoints } from "@/lib/formatPoints";
import { PageShell, PageHeader } from "@/components/ui/PageShell";
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

    const lbRaw: { users: unknown[]; groups: TrashWarGroup[]; unique_contributors?: number } = lbRes?.ok
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
      // The lists are capped at the top 20, so use the backend's real distinct count.
      contributorCount: lbRaw.unique_contributors ?? lbRaw.users.length,
      groups: lbRaw.groups,
    };
  },
  ["trash-war-ranks-stats"],
  { revalidate: REVALIDATE_SECONDS }
);

interface StreakHolder {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

const getTopStreak = unstable_cache(
  async (fastapiUrl: string) => {
    const res = await fetch(`${fastapiUrl}/api/leaderboard/streaks`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return null;
    const data: { streak_weeks: number; users: StreakHolder[] } = await res.json();
    return data.users.length > 0 ? data : null;
  },
  ["top-active-streak"],
  { revalidate: REVALIDATE_SECONDS }
);

export default async function GlobalLeaderboardPage() {
  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

  const [trashWarStats, topStreak] = await Promise.all([getTrashWarStats(fastapiUrl), getTopStreak(fastapiUrl)]);

  return (
    <PageShell>
      <PageHeader eyebrow="Leaderboard" title="Who's cleaning the most" subtitle="Trash War's pulse, plus points across every campaign." />

      {topStreak && (
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[20px] bg-zinc-900 px-4 py-2.5">
          <div className="shrink-0 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {topStreak.users.length > 1 ? "Streak freaks" : "Streak freak"}
            <span className="ml-2 font-display text-sm font-extrabold tabular-nums normal-case tracking-normal text-emerald-400">
              {topStreak.streak_weeks} {topStreak.streak_weeks === 1 ? "week" : "weeks"}
            </span>
            <span className="ml-2 text-[11px] font-medium normal-case tracking-normal text-zinc-600">Longest active streak</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {topStreak.users.map((u, i) => {
              const name = u.display_name ?? u.username ?? "?";
              return (
                <Fragment key={u.user_id}>
                  {i > 0 && <span className="text-xs font-bold text-emerald-400/70">&amp;</span>}
                  <Link
                    href={`/users/${u.username}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 py-0.5 pl-0.5 pr-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 transition-colors"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-700 text-[11px] font-bold text-zinc-300">
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        name[0].toUpperCase()
                      )}
                    </span>
                    {name}
                  </Link>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      {trashWarStats && (
        <div className="mb-8">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Trash War Activity</div>
          <LeaderboardViewSwitch campaignId={trashWarStats.campaignId} fastapiUrl={fastapiUrl} unit="pts">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-900 rounded-[20px] p-4">
                <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500 flex flex-col gap-1">
                  Total bags
                  <span className="font-display text-2xl font-extrabold tracking-tight text-zinc-100 normal-case tabular-nums">{formatPoints(trashWarStats.totalBags)}</span>
                </dt>
                <div className="mt-1 text-[11px] text-zinc-500 tabular-nums">
                  {formatPoints(trashWarStats.smallBags)} small · {formatPoints(trashWarStats.largeBags)} large · {formatPoints(trashWarStats.totalPounds)} lbs
                </div>
              </div>
              <div className="bg-zinc-900 rounded-[20px] p-4">
                <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500 flex flex-col gap-1">
                  Zip codes cleaned
                  <span className="font-display text-2xl font-extrabold tracking-tight text-zinc-100 normal-case tabular-nums">{trashWarStats.tractsCount.toLocaleString()}</span>
                </dt>
              </div>
              <div className="bg-zinc-900 rounded-[20px] p-4">
                <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500 flex flex-col gap-1">
                  Contributions
                  <span className="font-display text-2xl font-extrabold tracking-tight text-zinc-100 normal-case tabular-nums">{trashWarStats.contribCount.toLocaleString()}</span>
                </dt>
              </div>
              <div className="bg-zinc-900 rounded-[20px] p-4">
                <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500 flex flex-col gap-1">
                  Contributors
                  <span className="font-display text-2xl font-extrabold tracking-tight text-zinc-100 normal-case tabular-nums">{trashWarStats.contributorCount.toLocaleString()}</span>
                </dt>
              </div>
            </dl>

            <EntityLeaderboardTabs fastapiUrl={fastapiUrl} />
          </LeaderboardViewSwitch>
        </div>
      )}
    </PageShell>
  );
}
