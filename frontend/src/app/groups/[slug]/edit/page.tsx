import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GroupEditForm from "./GroupEditForm";
import MemberManager from "./MemberManager";
import DeleteGroupSection from "./DeleteGroupSection";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GroupEditPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: groupData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("groups").select("*").eq("slug", slug).single(),
  ]);

  if (!user) redirect(`/login?next=/groups/${slug}/edit`);
  if (!groupData) notFound();

  const [{ data: membershipData }, { data: profileData }] = await Promise.all([
    supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupData.id)
      .eq("user_id", user.id)
      .single(),
    supabase.schema("public").from("profiles").select("is_admin").eq("id", user.id).single(),
  ]);

  const isGroupAdmin = membershipData?.role === "admin";
  const isSiteAdmin = Boolean(profileData?.is_admin);

  if (!isGroupAdmin && !isSiteAdmin) {
    redirect(`/groups/${slug}`);
  }

  const { data: membersData } = await supabase
    .from("group_members")
    .select("user_id, role, joined_at")
    .eq("group_id", groupData.id)
    .order("joined_at", { ascending: true });

  const userIds = (membersData ?? []).map((m) => m.user_id);
  const { data: profilesData } = userIds.length > 0
    ? await supabase.schema("public").from("profiles").select("id, username, display_name").in("id", userIds)
    : { data: [] };

  const profilesById = new Map((profilesData ?? []).map((p) => [p.id, p]));

  const members = (membersData ?? []).map((m) => {
    const p = profilesById.get(m.user_id);
    return {
      userId: m.user_id,
      username: p?.username ?? m.user_id,
      displayName: p?.display_name ?? null,
      role: m.role,
      joinedAt: m.joined_at,
    };
  });

  return (
    <main className="max-w-lg mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <Link href={`/groups/${slug}`} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
          ← {groupData.name}
        </Link>
      </div>

      <h1 className="text-xl font-black text-zinc-100 mt-6 mb-8">Edit group</h1>

      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30 mb-8">
        <GroupEditForm
          groupId={groupData.id}
          slug={slug}
          name={groupData.name}
          description={groupData.description}
          socialLinks={groupData.social_links}
          logoUrl={groupData.image_url}
        />
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
          <span className="text-sm font-semibold text-zinc-300">
            Members <span className="text-zinc-500 font-normal">({members.length})</span>
          </span>
        </div>
        <div className="px-5">
          <MemberManager
            groupId={groupData.id}
            currentUserId={user.id}
            initialMembers={members}
          />
        </div>
      </div>

      {isGroupAdmin && isSiteAdmin && (
        <div className="mt-8">
          <DeleteGroupSection groupId={groupData.id} groupName={groupData.name} currentUserId={user.id} />
        </div>
      )}
    </main>
  );
}
