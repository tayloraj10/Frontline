import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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

export default async function GlobalLeaderboardPage() {
  const supabase = await createClient();

  const { data: profilesData } = await supabase
    .schema("public")
    .from("profiles")
    .select("id, username, display_name, avatar_url, points")
    .gt("points", 0)
    .order("points", { ascending: false })
    .limit(100);

  const profiles = (profilesData ?? []) as Profile[];

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-zinc-100 leading-tight">Global Leaderboard</h1>
        <p className="text-sm text-zinc-500 mt-1">Top contributors across every campaign.</p>
      </div>

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
                    {Math.round(p.points ?? 0).toLocaleString()}
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
