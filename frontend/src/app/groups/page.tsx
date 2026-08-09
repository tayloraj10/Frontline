import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { Database } from "@/types/database";
import GroupsListClient from "./GroupsListClient";

type Group = Database["public"]["Tables"]["groups"]["Row"];
type OwnSubmission = Pick<Group, "id" | "slug" | "name" | "status" | "image_url">;

// Public, RLS-open data shared across all visitors — bounds these two
// (currently unfiltered, whole-table) queries to once per 30s regardless of
// traffic instead of once per page view.
const getGroupsListData = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const [{ data: groupsData }, { data: membersData }, { data: eventsData }] = await Promise.all([
      supabase.from("groups").select("*").order("created_at", { ascending: false }),
      supabase.from("group_members").select("group_id, user_id"),
      supabase
        .from("cleanups")
        .select("id, group_id")
        .eq("is_group_event", true)
        .neq("status", "cancelled")
        .gt("scheduled_start", new Date().toISOString()),
    ]);

    const eventIds = (eventsData ?? []).map((e) => e.id);
    const { data: cohostsData } = eventIds.length
      ? await supabase.from("cleanup_event_cohosts").select("cleanup_id, group_id").in("cleanup_id", eventIds)
      : { data: [] as { cleanup_id: string; group_id: string }[] };

    return {
      groups: (groupsData ?? []) as Group[],
      members: membersData ?? ([] as { group_id: string; user_id: string }[]),
      events: eventsData ?? ([] as { id: string; group_id: string | null }[]),
      cohosts: cohostsData ?? ([] as { cleanup_id: string; group_id: string }[]),
    };
  },
  ["groups-list-data"],
  { revalidate: 30 }
);

export default async function GroupsPage() {
  const supabase = await createClient();

  const [{ data: { user } }, { groups: groupsData, members: membersData, events: eventsData, cohosts: cohostsData }] = await Promise.all([
    supabase.auth.getUser(),
    getGroupsListData(),
  ]);

  const canCreateGroup = !!user;
  let ownSubmissions: OwnSubmission[] = [];
  if (user) {
    const { data: submissions } = await supabase
      .from("groups")
      .select("id, slug, name, status, image_url")
      .eq("created_by", user.id)
      .neq("status", "approved");
    ownSubmissions = submissions ?? [];
  }

  const groups = (groupsData ?? []) as Group[];

  const memberCountByGroup: Record<string, number> = {};
  const userGroupIds: string[] = [];
  const userGroupIdSet = new Set<string>();
  for (const m of membersData ?? []) {
    memberCountByGroup[m.group_id] = (memberCountByGroup[m.group_id] ?? 0) + 1;
    if (user && m.user_id === user.id && !userGroupIdSet.has(m.group_id)) {
      userGroupIdSet.add(m.group_id);
      userGroupIds.push(m.group_id);
    }
  }

  const upcomingEventCountByGroup: Record<string, number> = {};
  for (const e of eventsData ?? []) {
    if (!e.group_id) continue;
    upcomingEventCountByGroup[e.group_id] = (upcomingEventCountByGroup[e.group_id] ?? 0) + 1;
  }
  for (const c of cohostsData ?? []) {
    upcomingEventCountByGroup[c.group_id] = (upcomingEventCountByGroup[c.group_id] ?? 0) + 1;
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 w-full">
      <div className="mb-10 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            Groups
          </h1>
          <p className="text-zinc-500 mt-2 text-sm">
            {groups.length} group{groups.length !== 1 ? "s" : ""} — organize your collective.
          </p>
        </div>
        {canCreateGroup && (
          <Link
            href="/groups/apply"
            className="shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.96] touch-manipulation"
          >
            Add Your Group
          </Link>
        )}
      </div>

      {ownSubmissions.length > 0 && (
        <div className="mb-8 rounded-2xl border border-amber-800/50 bg-amber-950/20 p-5 shadow-elevation-1">
          <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">
            Your submission{ownSubmissions.length !== 1 ? "s" : ""}
          </h2>
          <div className="space-y-2">
            {ownSubmissions.map((g) => (
              <Link
                key={g.id}
                href={`/groups/${g.slug}`}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 shadow-elevation-1 transition-[background-color,border-color,transform] duration-150 hover:border-zinc-600 active:scale-[0.98] touch-manipulation"
              >
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
                  {g.image_url ? (
                    <img src={g.image_url} alt={g.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-zinc-300">{(g.name || "?")[0].toUpperCase()}</span>
                  )}
                </div>
                <span className="flex-1 text-sm font-semibold text-zinc-200">{g.name}</span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    g.status === "pending"
                      ? "bg-amber-900/60 text-amber-400 border-amber-800"
                      : "bg-red-900/60 text-red-400 border-red-800"
                  }`}
                >
                  {g.status === "pending" ? "Pending review" : "Rejected"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-28 text-zinc-600">
          <p className="text-5xl mb-4">🏴</p>
          <p className="font-semibold text-zinc-500">No groups yet.</p>
          {canCreateGroup && (
            <p className="text-sm mt-1">
              <Link href="/groups/apply" className="text-emerald-400 hover:text-emerald-300 active:text-emerald-300 transition-colors duration-150">
                Add the first one.
              </Link>
            </p>
          )}
        </div>
      ) : (
        <GroupsListClient
          groups={groups}
          memberCountByGroup={memberCountByGroup}
          upcomingEventCountByGroup={upcomingEventCountByGroup}
          userGroupIds={userGroupIds}
          isLoggedIn={!!user}
        />
      )}
    </main>
  );
}
