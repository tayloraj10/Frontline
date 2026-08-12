import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCleanupEvent } from "@/lib/cleanupEvents";
import BackButton from "@/components/ui/BackButton";
import CreateCleanupEventForm from "@/components/cleanups/CreateCleanupEventForm";

interface Props {
  params: Promise<{ slug: string; id: string }>;
}

export default async function EditCleanupEventPage({ params }: Props) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: groupData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("groups").select("id, name").eq("slug", slug).single(),
  ]);

  if (!user) redirect(`/login?next=/groups/${slug}/events/${id}/edit`);
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

  const event = await getCleanupEvent(id, user.id).catch(() => null);
  if (!event || event.group_slug !== slug) notFound();
  if (!event.is_organizer) redirect(`/cleanup-events/${id}`);

  return (
    <main className="max-w-lg mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <BackButton href={`/cleanup-events/${id}`} label={event.title} />
      </div>

      <h1 className="text-xl font-black text-zinc-100 mt-6 mb-8 flex items-center gap-2">
        Edit cleanup event
      </h1>

      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30 shadow-elevation-2">
        <CreateCleanupEventForm
          groupId={groupData.id}
          groupSlug={slug}
          organizerUserId={user.id}
          campaigns={[]}
          mode="edit"
          cleanupId={id}
          initialValues={{
            title: event.title,
            description: event.description ?? "",
            scheduledStart: event.scheduled_start,
            scheduledEnd: event.scheduled_end,
            lat: event.lat,
            lng: event.lng,
            addressLine1: event.address_line1,
            city: event.city,
            state: event.state,
            postalCode: event.postal_code,
            country: event.country,
            maxAttendees: event.max_attendees,
            externalLink: event.external_link,
            imageUrl: event.image_url,
            route: event.route,
            loggingMode: event.logging_mode,
          }}
          initialCohostGroupIds={event.cohost_groups.map((g) => g.group_id)}
        />
      </div>
    </main>
  );
}
