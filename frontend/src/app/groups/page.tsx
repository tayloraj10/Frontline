import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Group = Database["public"]["Tables"]["groups"]["Row"];

export default async function GroupsPage() {
  const supabase = await createClient();

  const [{ data: { user } }, { data: groupsData }, { data: membersData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("groups").select("*").order("created_at", { ascending: false }),
    supabase.from("group_members").select("group_id, user_id"),
  ]);

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    isAdmin = profile?.is_admin ?? false;
  }

  const groups = (groupsData ?? []) as Group[];

  const memberCountByGroup = new Map<string, number>();
  const userGroupIds = new Set<string>();
  for (const m of membersData ?? []) {
    memberCountByGroup.set(m.group_id, (memberCountByGroup.get(m.group_id) ?? 0) + 1);
    if (user && m.user_id === user.id) userGroupIds.add(m.group_id);
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
        {isAdmin && (
          <Link
            href="/groups/new"
            className="shrink-0 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            + Create Group
          </Link>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-28 text-zinc-600">
          <p className="text-5xl mb-4">🏴</p>
          <p className="font-semibold text-zinc-500">No groups yet.</p>
          {isAdmin && (
            <p className="text-sm mt-1">
              <Link href="/groups/new" className="text-emerald-400 hover:text-emerald-300">
                Create the first one.
              </Link>
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => {
            const count = memberCountByGroup.get(group.id) ?? 0;
            const isMember = userGroupIds.has(group.id);

            return (
              <Link
                key={group.id}
                href={`/groups/${group.slug}`}
                className="group relative block overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/80 p-5 pl-[18px] transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-700 hover:shadow-xl hover:shadow-black/40"
              >
                <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl bg-emerald-500 opacity-40 transition-opacity duration-300 group-hover:opacity-100" />

                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
                        {group.logo_url ? (
                          <img src={group.logo_url} alt={group.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-zinc-300">{(group.name || "?")[0].toUpperCase()}</span>
                        )}
                      </div>
                      {group.verified && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/60 bg-emerald-900/30 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                          ✓ Verified
                        </span>
                      )}
                      {isMember && (
                        <span className="inline-flex items-center rounded-full border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                          Member
                        </span>
                      )}
                      <span className="ml-auto text-xs text-zinc-500">
                        {count} member{count !== 1 ? "s" : ""}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold leading-snug text-zinc-100 group-hover:text-white">
                      {group.name}
                    </h2>
                    {group.description && (
                      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                        {group.description}
                      </p>
                    )}
                  </div>

                  <span className="mt-0.5 flex-shrink-0 text-xl text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-300">
                    →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
