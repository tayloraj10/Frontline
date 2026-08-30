import { notFound } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import { getTeamEvent } from "@/lib/teamEvents";
import EventAdminDashboardView from "./EventAdminDashboardView";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TeamEventStatsAdminPage({ params }: Props) {
  const { id } = await params;

  const event = await getTeamEvent(id).catch(() => null);
  if (!event) notFound();

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <BackButton href={`/team-events/${id}/stats`} label={event.title} />
      </div>
      <h1 className="text-2xl font-black text-zinc-100 mb-1 mt-6">{event.title} Dashboard</h1>
      <p className="text-sm text-zinc-500 mb-6">Overall trends, breakdowns, and team comparisons.</p>
      <EventAdminDashboardView teamEventId={id} />
    </main>
  );
}
