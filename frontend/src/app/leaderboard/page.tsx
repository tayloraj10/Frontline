import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { formatPoints } from "@/lib/formatPoints";
import type { Database } from "@/types/database";

type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "username" | "display_name" | "avatar_url" | "points"
>;

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-black text-sm w-6 text-center">1</span>;
  if (rank === 2) return <span className="text-zinc-300 font-black text-sm w-6 text-center">2</span>;
  if (rank === 3) return <span className="text-amber-600 font-black text-sm w-6 text-center">3</span>;
  return <span className="text-zinc-600 text-sm w-6 text-center tabular-nums">{rank}</span>;
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

    const lbRaw: { users: unknown[]; groups: unknown[] } = lbRes?.ok ? await lbRes.json() : { users: [], groups: [] };
    const smallBags = (bagRows ?? []).reduce((sum, r) => sum + (r.metrics_small_bags ?? 0), 0);
    const largeBags = (bagRows ?? []).reduce((sum, r) => sum + (r.metrics_large_bags ?? 0), 0);
    const totalPounds = (bagRows ?? []).reduce((sum, r) => sum + (r.metrics_pounds ?? 0), 0);
    const totalBags = smallBags + largeBags;

    return {
      tractsCount: tractsCount ?? 0,
      contribCount: contribCount ?? 0,
      totalBags,
      smallBags,
      largeBags,
      totalPounds,
      contributorCount: lbRaw.users.length + lbRaw.groups.length,
    };
  },
  ["trash-war-ranks-stats"],
  { revalidate: REVALIDATE_SECONDS }
);

export default async function GlobalLeaderboardPage() {
  const supabase = await createClient();
  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

  const [{ data: profilesData }, trashWarStats] = await Promise.all([
    supabase
      .schema("public")
      .from("profiles")
      .select("id, username, display_name, avatar_url, points")
      .gt("points", 0)
      .order("points", { ascending: false })
      .limit(100),
    getTrashWarStats(fastapiUrl),
  ]);

  const profiles = (profilesData ?? []) as Profile[];

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-zinc-100 leading-tight">Leaderboard</h1>
        <p className="text-sm text-zinc-500 mt-1">Trash War's pulse, plus all-time points across every campaign.</p>
      </div>

      {trashWarStats && (
        <div className="mb-8">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Trash War Activity</div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5">
              <dt className="text-xs text-zinc-500 flex items-baseline justify-between gap-1.5">
                Total bags
                <span className="text-sm font-semibold text-zinc-200 tabular-nums">{formatPoints(trashWarStats.totalBags)}</span>
              </dt>
              <div className="mt-1 text-[11px] text-zinc-500 tabular-nums">
                {formatPoints(trashWarStats.smallBags)} small · {formatPoints(trashWarStats.largeBags)} large · {formatPoints(trashWarStats.totalPounds)} lbs
              </div>
            </div>
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5">
              <dt className="text-xs text-zinc-500 flex items-baseline justify-between gap-1.5">
                Zip codes cleaned
                <span className="text-sm font-semibold text-zinc-200 tabular-nums">{trashWarStats.tractsCount.toLocaleString()}</span>
              </dt>
            </div>
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5">
              <dt className="text-xs text-zinc-500 flex items-baseline justify-between gap-1.5">
                Contributions
                <span className="text-sm font-semibold text-zinc-200 tabular-nums">{trashWarStats.contribCount.toLocaleString()}</span>
              </dt>
            </div>
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5">
              <dt className="text-xs text-zinc-500 flex items-baseline justify-between gap-1.5">
                Contributors
                <span className="text-sm font-semibold text-zinc-200 tabular-nums">{trashWarStats.contributorCount.toLocaleString()}</span>
              </dt>
            </div>
          </dl>
        </div>
      )}

      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">All-Time Points</div>
      <div className="border border-zinc-800 rounded-xl overflow-hidden">
        {profiles.length === 0 ? (
          <div className="px-5 py-10 text-center text-zinc-600 text-sm">
            No contributions yet.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/50">
            {profiles.map((p, i) => (
              <li key={p.id} className="px-5 py-3 flex items-center gap-3">
                <RankBadge rank={i + 1} />
                <Link
                  href={`/users/${p.username}`}
                  className="flex items-center gap-2.5 flex-1 min-w-0"
                >
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.display_name ?? p.username} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-zinc-400">
                        {(p.display_name ?? p.username)[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-zinc-200 truncate font-medium hover:text-zinc-100 transition-colors">
                    {p.display_name ?? p.username}
                  </span>
                </Link>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold text-zinc-300 tabular-nums">
                    {formatPoints(p.points ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-600">pts</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
