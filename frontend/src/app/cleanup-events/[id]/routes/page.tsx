import { notFound } from "next/navigation";
import { getCleanupEvent, getEventAttendeeRoutes } from "@/lib/cleanupEvents";
import EventRoutesList from "@/components/cleanups/EventRoutesList";
import BackToCampaignButton from "@/components/ui/BackToCampaignButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EventRoutesPage({ params }: Props) {
  const { id } = await params;

  const [event, routes] = await Promise.all([
    getCleanupEvent(id).catch(() => null),
    getEventAttendeeRoutes(id).catch(() => []),
  ]);
  if (!event) notFound();

  return (
    <main className="max-w-lg mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <BackToCampaignButton campaignSlug={event.campaign_slug} />
      </div>
      <h1 className="mt-6 text-xl font-bold text-zinc-100">Routes &amp; photos</h1>
      <p className="mt-1 text-sm text-zinc-500">{event.title}</p>
      <div className="mt-6">
        <EventRoutesList routes={routes} />
      </div>
    </main>
  );
}
