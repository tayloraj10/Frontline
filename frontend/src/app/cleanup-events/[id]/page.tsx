import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCleanupEvent } from "@/lib/cleanupEvents";
import CleanupEventDetail from "@/components/cleanups/CleanupEventDetail";
import BackToCampaignButton from "@/components/ui/BackToCampaignButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CleanupEventPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [event, { data: adminProfile }] = await Promise.all([
    getCleanupEvent(id, user?.id ?? null).catch(() => null),
    user
      ? supabase.schema("public").from("profiles").select("is_admin").eq("id", user.id).single()
      : Promise.resolve({ data: null as { is_admin: boolean } | null }),
  ]);
  if (!event) notFound();
  const isSiteAdmin = adminProfile?.is_admin ?? false;

  return (
    <main className="max-w-lg mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <BackToCampaignButton campaignSlug={event.campaign_slug} />
      </div>
      <div className="mt-6">
        <CleanupEventDetail initialEvent={event} userId={user?.id ?? null} isSiteAdmin={isSiteAdmin} />
      </div>
    </main>
  );
}
