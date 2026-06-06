import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Group = Pick<Database["public"]["Tables"]["groups"]["Row"], "id" | "name" | "slug">;

interface Props {
  params: Promise<{ username: string }>;
}

const CONTRIBUTION_ICON: Record<string, string> = {
  cleanup: "🗑️",
  photo: "📷",
  registration: "🗳️",
  advocacy: "✊",
};

const CONTRIBUTION_UNIT: Record<string, string> = {
  cleanup: "bags",
  photo: "photo",
  registration: "registration",
  advocacy: "action",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function RankBadge({ rank }: { rank: number | null }) {
  if (!rank) return null;
  const base = "text-sm font-black w-5 text-center shrink-0";
  if (rank === 1) return <span className={`${base} text-yellow-400`}>#1</span>;
  if (rank === 2) return <span className={`${base} text-zinc-300`}>#2</span>;
  if (rank === 3) return <span className={`${base} text-amber-600`}>#3</span>;
  return <span className={`${base} text-zinc-600 tabular-nums`}>#{rank}</span>;
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();

  const [{ data: { user: currentUser } }, { data: profileData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("*").eq("username", username).single(),
  ]);

  const profile = profileData as Profile | null;
  if (!profile) notFound();

  const isOwn = currentUser?.id === profile.id;

  const [
    { data: contribsData, count: contribCount },
    { data: membersData },
    { count: tractsClaimedCount },
    { data: lbEntriesData },
  ] = await Promise.all([
    supabase
      .from("contributions")
      .select("id, campaign_id, value, contribution_type, notes, submitted_at", { count: "exact" })
      .eq("user_id", profile.id)
      .order("submitted_at", { ascending: false })
      .limit(15),
    supabase
      .from("group_members")
      .select("group_id, role, joined_at")
      .eq("user_id", profile.id),
    supabase
      .from("territory_claims")
      .select("*", { count: "exact", head: true })
      .eq("claimed_by_user", profile.id),
    supabase
      .from("leaderboard_entries")
      .select("campaign_id, rank, total_value, contribution_count, tracts_claimed")
      .eq("entity_id", profile.id)
      .eq("entity_type", "user")
      .order("total_value", { ascending: false })
      .limit(5),
  ]);

  const groupIds = (membersData ?? []).map((m) => m.group_id);
  const contribCampaignIds = [...new Set((contribsData ?? []).map((c) => c.campaign_id).filter(Boolean) as string[])];
  const lbCampaignIds = (lbEntriesData ?? []).map((e) => e.campaign_id);
  const allCampaignIds = [...new Set([...contribCampaignIds, ...lbCampaignIds])];

  const [{ data: groupsData }, { data: campaignsData }] = await Promise.all([
    groupIds.length > 0
      ? supabase.from("groups").select("id, name, slug").in("id", groupIds)
      : Promise.resolve({ data: [] as Group[] }),
    allCampaignIds.length > 0
      ? supabase.from("campaigns").select("id, title, slug, campaign_type").in("id", allCampaignIds)
      : Promise.resolve({ data: [] as { id: string; title: string; slug: string; campaign_type: string }[] }),
  ]);

  const groupsById = new Map((groupsData ?? []).map((g) => [g.id, g]));
  const campaignsById = new Map((campaignsData ?? []).map((c) => [c.id, c]));
  const lbByCampaign = new Map((lbEntriesData ?? []).map((e) => [e.campaign_id, e]));

  const contribs = contribsData ?? [];

  const joinedDate = new Date(profile.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-zinc-800 border border-zinc-700 text-2xl font-black text-zinc-300 shrink-0">
            {(profile.display_name ?? profile.username)[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-zinc-100 leading-tight">
              {profile.display_name ?? profile.username}
            </h1>
            <p className="text-sm text-zinc-500">@{profile.username}</p>
            {profile.bio && (
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{profile.bio}</p>
            )}
            <p className="mt-1 text-xs text-zinc-600">Member since {joinedDate}</p>
          </div>
        </div>
        {isOwn && (
          <Link
            href="/settings/profile"
            className="shrink-0 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 rounded-lg transition-colors"
          >
            Edit profile
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Contributions", value: (contribCount ?? 0).toLocaleString() },
          { label: "Tracts claimed", value: (tractsClaimedCount ?? 0).toLocaleString() },
          { label: "Groups", value: (membersData?.length ?? 0).toLocaleString() },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="border border-zinc-800 rounded-xl px-4 py-3 bg-zinc-900/30 text-center"
          >
            <div className="text-xl font-black text-zinc-100 tabular-nums">{value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Campaign Participation */}
      {(lbEntriesData ?? []).length > 0 && (
        <div className="border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
            <span className="text-sm font-semibold text-zinc-300">Campaigns</span>
          </div>
          <ul className="divide-y divide-zinc-800/60">
            {(lbEntriesData ?? []).map((entry) => {
              const campaign = campaignsById.get(entry.campaign_id);
              if (!campaign) return null;
              return (
                <li key={entry.campaign_id} className="px-5 py-3 flex items-center gap-3">
                  <RankBadge rank={entry.rank} />
                  <Link
                    href={`/campaigns/${campaign.slug}`}
                    className="flex-1 text-sm text-zinc-200 hover:text-zinc-100 transition-colors font-medium truncate min-w-0"
                  >
                    {campaign.title}
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-zinc-300 tabular-nums">
                      {Math.round(entry.total_value).toLocaleString()} {CONTRIBUTION_UNIT[campaign.campaign_type] ?? "pts"}
                    </div>
                    <div className="text-xs text-zinc-600">{entry.tracts_claimed} tracts</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Groups */}
      {(membersData ?? []).length > 0 && (
        <div className="border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
            <span className="text-sm font-semibold text-zinc-300">Groups</span>
          </div>
          <ul className="divide-y divide-zinc-800/60">
            {(membersData ?? []).map((m) => {
              const group = groupsById.get(m.group_id);
              if (!group) return null;
              return (
                <li key={m.group_id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <Link
                    href={`/groups/${group.slug}`}
                    className="text-sm text-zinc-200 hover:text-zinc-100 transition-colors font-medium"
                  >
                    {group.name}
                  </Link>
                  <span className="text-xs text-zinc-600 capitalize">{m.role}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Recent Activity */}
      <div className="border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
          <span className="text-sm font-semibold text-zinc-300">Recent activity</span>
        </div>
        {contribs.length === 0 ? (
          <div className="px-5 py-8 text-center text-zinc-600 text-sm">No contributions yet.</div>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {contribs.map((c) => {
              const campaign = c.campaign_id ? campaignsById.get(c.campaign_id) : null;
              const icon = CONTRIBUTION_ICON[c.contribution_type] ?? "📌";
              const unit = CONTRIBUTION_UNIT[c.contribution_type] ?? "pts";
              return (
                <li key={c.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs shrink-0 mt-0.5">
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-zinc-300 tabular-nums">
                        {c.value ?? 1} {unit}
                      </span>
                      {campaign && (
                        <>
                          <span className="text-xs text-zinc-600">in</span>
                          <Link
                            href={`/campaigns/${campaign.slug}`}
                            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                          >
                            {campaign.title}
                          </Link>
                        </>
                      )}
                    </div>
                    {c.notes && (
                      <p className="mt-0.5 text-xs text-zinc-600 line-clamp-1">{c.notes}</p>
                    )}
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0 mt-0.5">
                    {timeAgo(c.submitted_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
