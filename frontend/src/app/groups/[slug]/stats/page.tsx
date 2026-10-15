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

  const isAdmin = memberRow?.role === "admin";

  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 w-full">
      <div className="mb-2">
        <BackButton href={`/groups/${slug}`} label={group.name} />
      </div>
      <h1 className="font-display font-extrabold text-2xl text-zinc-100 mb-1 mt-6">{group.name} Stats</h1>
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
