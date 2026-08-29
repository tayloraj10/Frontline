import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTeamEvent, getTeamEventStats } from "@/lib/teamEvents";
import StatsClient from "./StatsClient";
import EventLeaderboardSection from "./EventLeaderboardSection";
import EventGeoSection from "./EventGeoSection";
import EventStatsSection from "./EventStatsSection";

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
        <div className="mt-2 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black text-zinc-100 leading-tight">{event.title} stats</h1>
          <Link
            href={`/team-events/${id}/stats/admin`}
            className="touch-manipulation active:scale-[0.97] shrink-0 text-xs font-semibold text-sky-400 border border-sky-900 rounded-lg px-3 py-1.5"
          >
            Full dashboard
          </Link>
        </div>
      </div>

      <EventLeaderboardSection teamEventId={id} />
      <EventGeoSection teamEventId={id} />

      <div>
        <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-3">Team scoreboard</h2>
        <StatsClient teamEventId={id} initialStats={stats} />
      </div>

      <div>
        <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-3">Event stats</h2>
        <EventStatsSection
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
