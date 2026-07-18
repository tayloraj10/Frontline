import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateCleanupEventForm from "@/components/cleanups/CreateCleanupEventForm";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function NewCleanupEventPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: groupData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("groups").select("id, name").eq("slug", slug).single(),
  ]);

  if (!user) redirect(`/login?next=/groups/${slug}/events/new`);
  if (!groupData) notFound();

  const { data: membershipData } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupData.id)
    .eq("user_id", user.id)
    .single();

  if (!membershipData || membershipData.role !== "admin") {
    redirect(`/groups/${slug}`);
  }

  const { data: campaignsData } = await supabase
    .schema("public")
    .from("campaigns")
    .select("id, title")
    .eq("status", "active")
    .order("title", { ascending: true });

  const campaigns = campaignsData ?? [];

  return (
    <main className="max-w-lg mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <Link href={`/groups/${slug}`} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
          ← {groupData.name}
        </Link>
      </div>

      <h1 className="text-xl font-black text-zinc-100 mt-6 mb-8 flex items-center gap-2">
        New cleanup event
        <span
          title="This feature should work but is still being tested."
          className="text-xs text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5 font-normal cursor-help"
        >
          Beta
        </span>
      </h1>

      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
        <CreateCleanupEventForm
          groupId={groupData.id}
          groupSlug={slug}
          organizerUserId={user.id}
          campaigns={campaigns}
        />
      </div>
    </main>
  );
}
