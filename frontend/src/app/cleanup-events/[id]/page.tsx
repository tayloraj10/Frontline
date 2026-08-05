import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCleanupEvent } from "@/lib/cleanupEvents";
import CleanupEventDetail from "@/components/cleanups/CleanupEventDetail";
import BackButton from "@/components/ui/BackButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CleanupEventPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const event = await getCleanupEvent(id, user?.id ?? null).catch(() => null);
  if (!event) notFound();

  return (
    <main className="max-w-lg mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <BackButton href={`/campaigns/${event.campaign_slug}`} label="Back to campaign" />
      </div>
      <div className="mt-6">
        <CleanupEventDetail initialEvent={event} userId={user?.id ?? null} />
      </div>
    </main>
  );
}
