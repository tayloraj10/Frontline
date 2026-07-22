import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GroupMembershipButton from "@/components/groups/GroupMembershipButton";
import { listGroupCleanupEvents } from "@/lib/cleanupEvents";
import type { Database } from "@/types/database";

type Group = Database["public"]["Tables"]["groups"]["Row"];
type GroupMember = Database["public"]["Tables"]["group_members"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const SOCIAL_LABELS: { key: keyof NonNullable<Group["social_links"]>; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "facebook", label: "Facebook" },
  { key: "twitter", label: "Twitter / X" },
];

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GroupProfilePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: groupData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("groups").select("*").eq("slug", slug).single(),
  ]);

  const group = groupData as Group | null;
  if (!group) notFound();

  const { data: membersData } = await supabase
    .from("group_members")
    .select("user_id, role, joined_at")
    .eq("group_id", group.id)
    .order("joined_at", { ascending: true });

  const members = (membersData ?? []) as Pick<GroupMember, "user_id" | "role" | "joined_at">[];
  const userIds = members.map((m) => m.user_id);

  const { data: profilesData } = userIds.length > 0
    ? await supabase.schema("public").from("profiles").select("id, username, display_name").in("id", userIds)
    : { data: [] as Pick<Profile, "id" | "username" | "display_name">[] };

  const profilesById = new Map((profilesData ?? []).map((p) => [p.id, p]));

  const isMember = user ? members.some((m) => m.user_id === user.id) : false;
  const isAdmin = user ? members.some((m) => m.user_id === user.id && m.role === "admin") : false;

  const groupEvents = await listGroupCleanupEvents(group.id, user?.id ?? null).catch(() => []);
  const upcomingEvents = groupEvents.filter((e) => !e.is_past && e.status !== "cancelled");
  const pastEvents = groupEvents.filter((e) => e.is_past || e.status === "cancelled");

  const formatEventDate = (start: string | null) =>
    start
      ? new Date(start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "Date TBD";

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <Link href="/groups" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
          ← Groups
        </Link>
      </div>

      <div className="mt-6 mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
            {group.image_url ? (
              <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-black text-zinc-300">{group.name[0].toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-zinc-100 leading-tight">{group.name}</h1>
              {group.verified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/60 bg-emerald-900/30 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                  ✓ Verified
                </span>
              )}
              {isAdmin && (
                <span className="inline-flex items-center rounded-full border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                  Admin
                </span>
              )}
            </div>
            {group.description && (
              <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">{group.description}</p>
            )}
            {group.social_links && Object.values(group.social_links).some(Boolean) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                {SOCIAL_LABELS.map(({ key, label }) => {
                  const url = group.social_links?.[key];
                  if (!url) return null;
                  return (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      {key === "website" ? url.replace(/^https?:\/\//, "") : label} ↗
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {isAdmin && (
            <Link
              href={`/groups/${slug}/events/new`}
              className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 rounded-lg transition-colors"
            >
              New event
            </Link>
          )}
          {isAdmin && (
            <Link
              href={`/groups/${slug}/edit`}
              className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 rounded-lg transition-colors"
            >
              Edit group
            </Link>
          )}
          {user && !isAdmin && (
            <GroupMembershipButton groupId={group.id} userId={user.id} isMember={isMember} />
          )}
          {!user && (
            <Link
              href={`/login?next=/groups/${slug}`}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Join Group
            </Link>
          )}
        </div>
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            Upcoming Events <span className="text-zinc-500 font-normal">({upcomingEvents.length})</span>
            <span
              title="This feature should work but is still being tested."
              className="text-xs text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5 cursor-help"
            >
              Beta
            </span>
          </span>
        </div>
        {upcomingEvents.length === 0 ? (
          <div className="px-5 py-8 text-center text-zinc-600 text-sm">No upcoming events.</div>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {upcomingEvents.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/cleanup-events/${e.id}`}
                  className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-zinc-900/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
                      {e.image_url ? (
                        <img src={e.image_url} alt={e.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg">🧹</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200 break-words">{e.title}</p>
                      <p className="text-xs text-zinc-500">
                        {formatEventDate(e.scheduled_start)}
                        {e.max_attendees ? ` · ${e.going_count}/${e.max_attendees} going` : e.going_count > 0 ? ` · ${e.going_count} going` : ""}
                      </p>
                    </div>
                  </div>
                  {e.is_ongoing && (
                    <span className="text-xs text-emerald-400 border border-emerald-700/60 rounded px-1.5 py-0.5 shrink-0">
                      Live
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isAdmin && (
        <div className="border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              Event History <span className="text-zinc-500 font-normal">({pastEvents.length})</span>
              <span
                title="This feature should work but is still being tested."
                className="text-xs text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5 cursor-help"
              >
                Beta
              </span>
            </span>
            <span className="text-xs text-zinc-600">Admin only</span>
          </div>
          {pastEvents.length === 0 ? (
            <div className="px-5 py-8 text-center text-zinc-600 text-sm">No past events yet.</div>
          ) : (
            <ul className="divide-y divide-zinc-800/60">
              {pastEvents.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/cleanup-events/${e.id}`}
                    className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-zinc-900/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center opacity-70">
                        {e.image_url ? (
                          <img src={e.image_url} alt={e.title} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg">🧹</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-300 break-words">{e.title}</p>
                        <p className="text-xs text-zinc-500">
                          {formatEventDate(e.scheduled_start)} · {e.going_count} RSVP&apos;d
                        </p>
                      </div>
                    </div>
                    {e.status === "cancelled" ? (
                      <span className="text-xs text-red-400 border border-red-800/60 rounded px-1.5 py-0.5 shrink-0">
                        Cancelled
                      </span>
                    ) : e.is_ongoing ? (
                      <span className="text-xs text-emerald-400 border border-emerald-700/60 rounded px-1.5 py-0.5 shrink-0">
                        Ongoing
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5 shrink-0">
                        Over
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-300">
            Members <span className="text-zinc-500 font-normal">({members.length})</span>
          </span>
        </div>
        {members.length === 0 ? (
          <div className="px-5 py-8 text-center text-zinc-600 text-sm">No members yet.</div>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {members.map((m) => {
              const profile = profilesById.get(m.user_id);
              return (
                <li key={m.user_id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">
                      {(profile?.display_name ?? profile?.username ?? "?")[0].toUpperCase()}
                    </div>
                    <span className="text-sm text-zinc-200 truncate">
                      {profile?.display_name ?? profile?.username ?? "Unknown"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.role === "admin" && (
                      <span className="text-xs text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">
                        admin
                      </span>
                    )}
                    <span className="text-xs text-zinc-600">
                      {new Date(m.joined_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
