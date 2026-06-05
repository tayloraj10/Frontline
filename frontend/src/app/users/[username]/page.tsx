import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Group = Pick<Database["public"]["Tables"]["groups"]["Row"], "id" | "name" | "slug">;

interface Props {
  params: Promise<{ username: string }>;
}

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
  ] = await Promise.all([
    supabase
      .from("contributions")
      .select("id, campaign_id, value, contribution_type, notes, submitted_at", { count: "exact" })
      .eq("user_id", profile.id)
      .order("submitted_at", { ascending: false })
      .limit(10),
    supabase
      .from("group_members")
      .select("group_id, role, joined_at")
      .eq("user_id", profile.id),
  ]);

  const groupIds = (membersData ?? []).map((m) => m.group_id);
  const { data: groupsData } = groupIds.length > 0
    ? await supabase.from("groups").select("id, name, slug").in("id", groupIds)
    : { data: [] as Group[] };

  const groupsById = new Map((groupsData ?? []).map((g) => [g.id, g]));

  const contribs = contribsData ?? [];
  const totalValue = contribs.reduce((s, c) => s + (c.value ?? 0), 0);

  const campaignIds = [...new Set(contribs.map((c) => c.campaign_id).filter(Boolean))];
  const { data: campaignsData } = campaignIds.length > 0
    ? await supabase.from("campaigns").select("id, title, slug").in("id", campaignIds)
    : { data: [] as { id: string; title: string; slug: string }[] };
  const campaignsById = new Map((campaignsData ?? []).map((c) => [c.id, c]));

  const joinedDate = new Date(profile.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
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
          <span className="shrink-0 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 rounded-lg">
            Your profile
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Contributions", value: (contribCount ?? 0).toLocaleString() },
          { label: "Total bags", value: Math.round(totalValue).toLocaleString() },
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
              return (
                <li key={c.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs shrink-0 mt-0.5 text-zinc-500">
                    🗑️
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-zinc-300 tabular-nums">
                        {c.value ?? 1} bags
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
