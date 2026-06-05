import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CampaignTabNav from "../CampaignTabNav";
import type { Database } from "@/types/database";

type Profile = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "username" | "display_name">;
type Group = Pick<Database["public"]["Tables"]["groups"]["Row"], "id" | "name">;

interface LeaderboardEntry {
  entity_id: string;
  total_value: number;
  contribution_count: number;
  tracts_claimed: number;
}

interface Props {
  params: Promise<{ slug: string }>;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-black text-sm w-6 text-center">1</span>;
  if (rank === 2) return <span className="text-zinc-300 font-black text-sm w-6 text-center">2</span>;
  if (rank === 3) return <span className="text-amber-600 font-black text-sm w-6 text-center">3</span>;
  return <span className="text-zinc-600 text-sm w-6 text-center tabular-nums">{rank}</span>;
}

function LeaderboardTable({
  entries,
  nameMap,
  unit,
  type,
}: {
  entries: LeaderboardEntry[];
  nameMap: Map<string, string>;
  unit: string;
  type: "user" | "group";
}) {
  if (entries.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-zinc-600 text-sm">
        No {type === "user" ? "individual" : "group"} contributions yet.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-zinc-800/50">
      {entries.map((entry, i) => {
        const name = nameMap.get(entry.entity_id) ?? (type === "group" ? "Unknown Group" : "Unknown User");
        return (
          <li key={entry.entity_id} className="px-5 py-3 flex items-center gap-3">
            <RankBadge rank={i + 1} />
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${
                type === "group"
                  ? "bg-emerald-900/40 border-emerald-700/60 text-emerald-400"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400"
              }`}>
                {name[0].toUpperCase()}
              </div>
              <span className="text-sm text-zinc-200 truncate font-medium">{name}</span>
            </div>
            <div className="flex items-center gap-4 shrink-0 text-right">
              <div className="hidden sm:block text-right">
                <div className="text-xs font-semibold text-zinc-300 tabular-nums">
                  {Math.round(entry.total_value).toLocaleString()}
                </div>
                <div className="text-xs text-zinc-600">{unit}</div>
              </div>
              <div className="hidden sm:block text-right">
                <div className="text-xs font-semibold text-zinc-400 tabular-nums">
                  {entry.contribution_count}
                </div>
                <div className="text-xs text-zinc-600">logs</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-zinc-400 tabular-nums">
                  {entry.tracts_claimed}
                </div>
                <div className="text-xs text-zinc-600">tracts</div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function LeaderboardPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: campaignData } = await supabase
    .from("campaigns")
    .select("id, title, description, campaign_type")
    .eq("slug", slug)
    .single();

  if (!campaignData) notFound();

  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";
  const res = await fetch(`${fastapiUrl}/api/campaigns/${campaignData.id}/leaderboard`, {
    next: { revalidate: 30 },
  });

  const leaderboard: { users: LeaderboardEntry[]; groups: LeaderboardEntry[] } = res.ok
    ? await res.json()
    : { users: [], groups: [] };

  const userIds = leaderboard.users.map((u) => u.entity_id);
  const groupIds = leaderboard.groups.map((g) => g.entity_id);

  const [{ data: profilesData }, { data: groupsData }] = await Promise.all([
    userIds.length > 0
      ? supabase.from("profiles").select("id, username, display_name").in("id", userIds)
      : Promise.resolve({ data: [] as Profile[] }),
    groupIds.length > 0
      ? supabase.from("groups").select("id, name").in("id", groupIds)
      : Promise.resolve({ data: [] as Group[] }),
  ]);

  const profilesById = new Map(
    (profilesData ?? []).map((p) => [p.id, p.display_name ?? p.username])
  );
  const groupsById = new Map((groupsData ?? []).map((g) => [g.id, g.name]));

  const unit = campaignData.campaign_type === "territory" ? "bags" : "pts";

  return (
    <div className="flex flex-col flex-1">
      <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-zinc-100 truncate leading-tight">
              {campaignData.title}
            </h1>
            {campaignData.description && (
              <p className="text-zinc-500 text-xs truncate">{campaignData.description}</p>
            )}
          </div>
        </div>
        <CampaignTabNav slug={slug} active="leaderboard" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
              <span className="text-sm font-semibold text-zinc-300">Individuals</span>
            </div>
            <LeaderboardTable
              entries={leaderboard.users}
              nameMap={profilesById}
              unit={unit}
              type="user"
            />
          </div>

          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
              <span className="text-sm font-semibold text-zinc-300">Groups</span>
            </div>
            <LeaderboardTable
              entries={leaderboard.groups}
              nameMap={groupsById}
              unit={unit}
              type="group"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
