import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTeamEvent, getTeamEventStats } from "@/lib/teamEvents";
import StatsClient from "./StatsClient";
import EventLeaderboardSection from "./EventLeaderboardSection";
import EventGeoSection from "./EventGeoSection";
import EventStatsSection from "./EventStatsSection";
import EventShareExportSection from "./EventShareExportSection";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TeamEventStatsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const event = await getTeamEvent(id).catch(() => null);
  if (!event) notFound();

  const stats = await getTeamEventStats(id).catch(() => []);

  return (
    <main className="max-w-lg mx-auto px-6 py-10 w-full space-y-6">
      <div>
        <Link href={`/team-events/${id}`} className="text-xs font-medium text-sky-400 hover:text-sky-300">
          ← Back to event
        </Link>
        <div className="mt-2">
          <h1 className="text-2xl font-black text-zinc-100 leading-tight">{event.title} Stats</h1>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-3">Event stats</h2>
        <EventStatsSection teamEventId={id} />
      </div>

      <div>
        <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-3">Team scoreboard</h2>
        <StatsClient teamEventId={id} initialStats={stats} />
      </div>

      <EventLeaderboardSection teamEventId={id} />
      <EventGeoSection teamEventId={id} />

      <div>
        <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-3">Share &amp; export</h2>
        <EventShareExportSection
          teamEventId={id}
          eventTitle={event.title}
          eventLogoUrl={event.image_url}
          teams={event.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, logo_url: t.logo_url }))}
          userId={user?.id ?? null}
        />
      </div>
    </main>
  );
}
