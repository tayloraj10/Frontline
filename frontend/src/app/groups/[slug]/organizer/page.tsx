import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/ui/BackButton";
import OrganizerDashboardView from "./OrganizerDashboardView";
import type { Database } from "@/types/database";

type Group = Database["public"]["Tables"]["groups"]["Row"];

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function GroupOrganizerPage({ params }: Props) {
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
    redirect(`/groups/${slug}`);
  }

  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <BackButton href={`/groups/${slug}`} label={group.name} />
      </div>
      <h1 className="text-2xl font-black text-zinc-100 mb-1 mt-6">{group.name} Organizer Dashboard</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Actions that need your attention as an organizer of {group.name}.
      </p>
      <OrganizerDashboardView
        groupId={group.id}
        groupSlug={slug}
        viewerUserId={user!.id}
        fastapiUrl={fastapiUrl}
      />
    </main>
  );
}
