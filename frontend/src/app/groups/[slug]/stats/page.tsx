import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/ui/BackButton";
import GroupStatsView from "./GroupStatsView";
import type { Database } from "@/types/database";

type Group = Database["public"]["Tables"]["groups"]["Row"];

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GroupStatsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: groupData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("groups").select("*").eq("slug", slug).single(),
  ]);

  const group = groupData as Group | null;
  if (!group || group.status !== "approved") notFound();

  const { data: memberRow } = user
    ? await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", group.id)
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  const isMember = !!memberRow;
  const isAdmin = memberRow?.role === "admin";

  if (!isMember) {
    return (
      <main className="max-w-lg mx-auto px-6 py-16 w-full text-center">
        <div className="mb-2 text-left">
          <BackButton href={`/groups/${slug}`} label={group.name} />
        </div>
        <p className="text-5xl mb-4">🔒</p>
        <h1 className="text-2xl font-black text-zinc-100 mb-2">Members only</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          This group&apos;s stats dashboard is only visible to {group.name} members.
        </p>
      </main>
    );
  }

  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <BackButton href={`/groups/${slug}`} label={group.name} />
      </div>
      <h1 className="text-2xl font-black text-zinc-100 mb-1 mt-6">{group.name} Stats</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Every contribution logged as {group.name}, broken down by member.
      </p>
      <GroupStatsView
        groupId={group.id}
        groupName={group.name}
        groupLogoUrl={group.image_url}
        viewerUserId={user?.id ?? null}
        isAdmin={isAdmin}
        fastapiUrl={fastapiUrl}
        slug={slug}
      />
    </main>
  );
}
