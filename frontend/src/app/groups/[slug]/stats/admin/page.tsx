import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/ui/BackButton";
import GroupStatsAdminView from "./GroupStatsAdminView";
import type { Database } from "@/types/database";

type Group = Database["public"]["Tables"]["groups"]["Row"];

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GroupStatsAdminPage({ params }: Props) {
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

  if (!isAdmin) {
    return (
      <main className="max-w-lg mx-auto px-6 py-16 w-full text-center">
        <div className="mb-2 text-left">
          <BackButton href={`/groups/${slug}/stats`} label={group.name} />
        </div>
        <p className="text-5xl mb-4">🔒</p>
        <h1 className="text-2xl font-black text-zinc-100 mb-2">Admins only</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          The deep-dive dashboard is only visible to {group.name} admins.
        </p>
      </main>
    );
  }

  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <BackButton href={`/groups/${slug}/stats`} label={group.name} />
      </div>
      <h1 className="text-2xl font-black text-zinc-100 mb-1 mt-6">{group.name} Deep Dive</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Trends, activity map, and per-member drill-in for {group.name}.
      </p>
      <GroupStatsAdminView
        groupId={group.id}
        groupName={group.name}
        viewerUserId={user!.id}
        fastapiUrl={fastapiUrl}
      />
    </main>
  );
}
