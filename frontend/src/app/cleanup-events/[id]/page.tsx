import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCleanupEvent } from "@/lib/cleanupEvents";
import CleanupEventDetail from "@/components/cleanups/CleanupEventDetail";

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
        <Link href={`/campaigns/${event.campaign_slug}`} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
          ← Back to campaign
        </Link>
      </div>
      <div className="mt-6">
        <CleanupEventDetail initialEvent={event} userId={user?.id ?? null} />
      </div>
    </main>
  );
}
