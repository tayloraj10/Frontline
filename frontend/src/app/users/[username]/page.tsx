import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import UserActivityList from "@/components/contributions/UserActivityList";

const CAMPAIGN_UNIT: Record<string, string> = {
  territory: "bags",
  choropleth: "registrations",
  heatmap: "unfollows",
  hex_bloom: "pts",
};

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Group = Pick<Database["public"]["Tables"]["groups"]["Row"], "id" | "name" | "slug">;

interface Props {
  params: Promise<{ username: string }>;
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
    { data: allContribsData },
    { data: tractsData },
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
      .from("contributions")
      .select("campaign_id, value")
      .eq("user_id", profile.id),
    supabase
      .from("territory_claims")
      .select("campaign_id")
      .eq("claimed_by_user", profile.id),
  ]);

  // Aggregate campaign participation from contributions + territory_claims
  const campaignStats = new Map<string, { total_value: number; contribution_count: number; tracts_claimed: number }>();
  for (const c of allContribsData ?? []) {
    if (!c.campaign_id) continue;
    const s = campaignStats.get(c.campaign_id) ?? { total_value: 0, contribution_count: 0, tracts_claimed: 0 };
    s.total_value += c.value ?? 1;
    s.contribution_count += 1;
    campaignStats.set(c.campaign_id, s);
  }
  for (const t of tractsData ?? []) {
    if (!t.campaign_id) continue;
    const s = campaignStats.get(t.campaign_id) ?? { total_value: 0, contribution_count: 0, tracts_claimed: 0 };
    s.tracts_claimed += 1;
    campaignStats.set(t.campaign_id, s);
  }

  const allCampaignIds = [...campaignStats.keys()];
  const groupIds = (membersData ?? []).map((m) => m.group_id);
  const contribCampaignIds = [...new Set((contribsData ?? []).map((c) => c.campaign_id).filter(Boolean) as string[])];
  const allNeededCampaignIds = [...new Set([...allCampaignIds, ...contribCampaignIds])];

  const [{ data: groupsData }, { data: campaignsData }] = await Promise.all([
    groupIds.length > 0
      ? supabase.from("groups").select("id, name, slug").in("id", groupIds)
      : Promise.resolve({ data: [] as Group[] }),
    allNeededCampaignIds.length > 0
      ? supabase.from("campaigns").select("id, title, slug, campaign_type").in("id", allNeededCampaignIds)
      : Promise.resolve({ data: [] as { id: string; title: string; slug: string; campaign_type: string }[] }),
  ]);

  const groupsById = new Map((groupsData ?? []).map((g) => [g.id, g]));
  const campaignsById = new Map((campaignsData ?? []).map((c) => [c.id, c]));

  const contribs = contribsData ?? [];
  const totalTractsCount = tractsData?.length ?? 0;

  const joinedDate = new Date(profile.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Sort campaigns by total_value descending
  const campaignEntries = [...campaignStats.entries()]
    .sort(([, a], [, b]) => b.total_value - a.total_value)
    .slice(0, 5);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name ?? profile.username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-black text-zinc-300">
                {(profile.display_name ?? profile.username)[0].toUpperCase()}
              </span>
            )}
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
          { label: "Tracts claimed", value: totalTractsCount.toLocaleString() },
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
      {campaignEntries.length > 0 && (
        <div className="border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
            <span className="text-sm font-semibold text-zinc-300">Campaigns</span>
          </div>
          <ul className="divide-y divide-zinc-800/60">
            {campaignEntries.map(([campaignId, stats]) => {
              const campaign = campaignsById.get(campaignId);
              if (!campaign) return null;
              const unit = CAMPAIGN_UNIT[campaign.campaign_type] ?? "pts";
              return (
                <li key={campaignId} className="px-5 py-3 flex items-center gap-3">
                  <Link
                    href={`/campaigns/${campaign.slug}`}
                    className="flex-1 text-sm text-zinc-200 hover:text-zinc-100 transition-colors font-medium truncate min-w-0"
                  >
                    {campaign.title}
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-zinc-300 tabular-nums">
                      {Math.round(stats.total_value).toLocaleString()} {unit}
                    </div>
                    <div className="text-xs text-zinc-600">{stats.tracts_claimed} tracts</div>
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
        <UserActivityList
          initialContribs={contribs as { id: string; campaign_id: string | null; value: number | null; contribution_type: string; notes: string | null; submitted_at: string }[]}
          campaigns={campaignsData ?? []}
          isOwn={isOwn}
          userId={currentUser?.id ?? null}
        />
      </div>
    </main>
  );
}
