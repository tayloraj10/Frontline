import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTeamEvent } from "@/lib/teamEvents";
import ReviewClient from "./ReviewClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TeamEventReviewPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const event = await getTeamEvent(id).catch(() => null);
  if (!event) notFound();

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 w-full">
      <div className="mb-6">
        <Link href={`/team-events/${id}`} className="text-xs font-medium text-sky-400 hover:text-sky-300">
          ← Back to event
        </Link>
        <h1 className="mt-2 text-2xl font-black text-zinc-100 leading-tight">{event.title} submissions</h1>
      </div>
      <ReviewClient teamEventId={id} userId={user?.id ?? null} teams={event.teams} />
    </main>
  );
}
