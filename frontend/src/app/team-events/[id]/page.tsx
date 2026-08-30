import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamEvent } from "@/lib/teamEvents";
import TeamEventPageClient from "./TeamEventPageClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TeamEventPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const event = await getTeamEvent(id).catch(() => null);
  if (!event) notFound();

  let viewerTeamId: string | null = null;
  let viewerRepresentingGroupId: string | null = null;
  if (user) {
    const { data: participant } = await supabase
      .from("team_event_participants")
      .select("team_id, representing_group_id")
      .eq("team_event_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    viewerTeamId = participant?.team_id ?? null;
    viewerRepresentingGroupId = participant?.representing_group_id ?? null;
  }

  return (
    <main className="max-w-lg mx-auto px-6 py-10 w-full">
      <TeamEventPageClient
        initialEvent={event}
        userId={user?.id ?? null}
        initialViewerTeamId={viewerTeamId}
        initialViewerRepresentingGroupId={viewerRepresentingGroupId}
      />
    </main>
  );
}
