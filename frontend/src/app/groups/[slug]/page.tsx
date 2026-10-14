import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BarChart3, CalendarPlus, ClipboardList, Pencil, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import GroupMembershipButton from "@/components/groups/GroupMembershipButton";
import ShareButton from "@/components/ShareButton";
import Avatar from "@/components/ui/Avatar";
import GroupAvatarLightbox from "@/components/groups/GroupAvatarLightbox";
import SocialIcon from "@/components/ui/SocialIcon";
import PastEventsList from "@/components/groups/PastEventsList";
import { listGroupCleanupEvents } from "@/lib/cleanupEvents";
import BackButton from "@/components/ui/BackButton";
import { PageShell } from "@/components/ui/PageShell";
import type { Database } from "@/types/database";

type Group = Database["public"]["Tables"]["groups"]["Row"];
type GroupMember = Database["public"]["Tables"]["group_members"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const SOCIAL_LABELS: { key: keyof NonNullable<Group["social_links"]>; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "facebook", label: "Facebook" },
  { key: "twitter", label: "Twitter / X" },
];

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createPublicClient();
  const { data: group } = await supabase
    .from("groups")
    .select("name, description, image_url, status")
    .eq("slug", slug)
    .eq("status", "approved")
    .single();

  if (!group) return {};

  const title = group.name;
  const description = group.description ?? `${group.name} on Frontline.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/groups/${slug}`,
      ...(group.image_url && { images: [group.image_url] }),
    },
    twitter: {
      title,
      description,
      ...(group.image_url && { images: [group.image_url] }),
    },
  };
}

export default async function GroupProfilePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: groupData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("groups").select("*").eq("slug", slug).single(),
  ]);

  const group = groupData as Group | null;
  if (!group) notFound();

  if (group.status !== "approved") {
    const isPending = group.status === "pending";
    return (
      <PageShell width="narrow" className="text-center">
        <div className="mb-2 text-left">
          <BackButton href="/groups" label="Groups" />
        </div>
        <p className="text-5xl mb-4">{isPending ? "⏳" : "🚫"}</p>
        <h1 className="font-display font-extrabold text-2xl text-zinc-100 mb-2">{group.name}</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          {isPending
            ? "This group is pending review. It'll be listed once a site admin approves it."
            : "This group was not approved for listing."}
        </p>
      </PageShell>
    );
  }

  const { data: membersData } = await supabase
    .from("group_members")
    .select("user_id, role, joined_at")
    .eq("group_id", group.id)
    .order("joined_at", { ascending: true });

  const members = ((membersData ?? []) as Pick<GroupMember, "user_id" | "role" | "joined_at">[]).sort((a, b) =>
    a.role === b.role ? 0 : a.role === "admin" ? -1 : 1
  );
  const userIds = members.map((m) => m.user_id);

  const { data: profilesData } = userIds.length > 0
    ? await supabase.schema("public").from("profiles").select("id, username, display_name, avatar_url").in("id", userIds)
    : { data: [] as Pick<Profile, "id" | "username" | "display_name" | "avatar_url">[] };

  const profilesById = new Map((profilesData ?? []).map((p) => [p.id, p]));

  const isMember = user ? members.some((m) => m.user_id === user.id) : false;
  const isAdmin = user ? members.some((m) => m.user_id === user.id && m.role === "admin") : false;
  const adminCount = members.filter((m) => m.role === "admin").length;
  const isOnlyAdmin = isAdmin && adminCount === 1;

  const { data: groupTeamEventsData } = await supabase
    .from("team_event_group_participants")
    .select(
      "cascade_mode, team_event:team_events(id, slug, title, status, starts_at, ends_at), team:team_event_teams(name, color)"
    )
    .eq("group_id", group.id);

  type GroupTeamEvent = {
    cascade_mode: string;
    team_event: { id: string; slug: string; title: string; status: string; starts_at: string; ends_at: string | null } | null;
    team: { name: string; color: string | null } | null;
  };

  const groupTeamEvents = ((groupTeamEventsData ?? []) as unknown as GroupTeamEvent[])
    .filter((r) => r.team_event)
    .sort((a, b) => (b.team_event!.starts_at ?? "").localeCompare(a.team_event!.starts_at ?? ""));

  const groupEvents = await listGroupCleanupEvents(group.id).catch(() => []);
  const upcomingEvents = groupEvents.filter((e) => !e.is_past && e.status !== "cancelled");
  const pastEvents = groupEvents
    .filter((e) => e.is_past || e.status === "cancelled")
    .sort((a, b) => (b.scheduled_start ?? "").localeCompare(a.scheduled_start ?? ""));

  const formatEventDate = (start: string | null) =>
    start
      ? new Date(start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "Date TBD";

  const heldEvents = pastEvents.filter((e) => e.status !== "cancelled");
  const peopleReached = heldEvents.reduce((n, e) => n + (e.going_count ?? 0), 0);
  const nextEvent = [...upcomingEvents].sort((a, b) => (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? ""))[0];

  const card = "rounded-[20px] bg-zinc-900 overflow-hidden";
  const cardHead = "px-5 pt-4 pb-2 flex items-center justify-between font-display text-base font-extrabold tracking-tight text-zinc-100";
  const chip = "inline-flex min-h-10 items-center gap-1.5 rounded-2xl px-4 text-sm font-semibold transition-[background-color,transform] duration-150 active:scale-[0.97] touch-manipulation";
  const liveBadge = (
    <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">Live</span>
  );

  return (
    <PageShell width="wide">
      <div className="mb-2">
        <BackButton href="/groups" label="Groups" />
      </div>

      <div className="mt-4 mb-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-16 w-16 lg:h-20 lg:w-20 shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-zinc-800">
            {group.image_url ? (
              <GroupAvatarLightbox imageUrl={group.image_url} name={group.name} />
            ) : (
              <span className="font-display text-3xl font-extrabold text-zinc-300">{group.name[0].toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl lg:text-3xl font-extrabold tracking-tight text-zinc-50 leading-tight">{group.name}</h1>
              {group.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">✓ Verified</span>
              )}
              {isAdmin && (
                <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">Organizer</span>
              )}
            </div>
            {group.description && (
              <p className="mt-1.5 max-w-prose text-sm text-zinc-400 leading-relaxed">{group.description}</p>
            )}
            {group.social_links && Object.values(group.social_links).some(Boolean) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {SOCIAL_LABELS.map(({ key, label }) => {
                  const url = group.social_links?.[key];
                  if (!url) return null;
                  return (
                    <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 min-h-11 px-4 rounded-full bg-emerald-500/10 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 active:scale-[0.97] touch-manipulation transition-[background-color,color,transform] duration-150">
                      <SocialIcon platform={key} className="w-4 h-4" />
                      {label}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <ShareButton variant="icon" content={{ title: group.name, text: group.description ?? undefined }} />
          {user && (
            <GroupMembershipButton groupId={group.id} userId={user.id} isMember={isMember} isOnlyAdmin={isOnlyAdmin} />
          )}
          {!user && (
            <Link
              href={`/login?next=/groups/${slug}`}
              className={`${chip} bg-emerald-400 font-bold text-emerald-950 hover:bg-emerald-300`}
            >
              Sign in to join
            </Link>
          )}
        </div>
      </div>

      {/* Group impact at a glance */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Members", value: members.length },
          { label: "Events held", value: heldEvents.length },
          { label: "Upcoming", value: upcomingEvents.length },
          { label: "RSVPs to date", value: peopleReached },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-[20px] bg-zinc-900 px-5 py-4">
            <div className="font-display text-2xl lg:text-3xl font-extrabold tracking-tight tabular-nums text-zinc-50">{value.toLocaleString()}</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          {isAdmin && (
            <div className="rounded-[20px] bg-zinc-900 p-5">
              <h2 className="font-display text-base font-extrabold tracking-tight text-zinc-100">Organizer tools</h2>
              <p className="mt-0.5 mb-4 text-sm text-zinc-400">
                {nextEvent
                  ? `Next up: ${nextEvent.title}, ${formatEventDate(nextEvent.scheduled_start)}.`
                  : "No event scheduled yet. Put one on the calendar to get people out."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/groups/${slug}/events/new`} className={`${chip} bg-emerald-400 font-bold text-emerald-950 hover:bg-emerald-300`}>
                  <CalendarPlus className="h-4 w-4" /> New event
                </Link>
                <Link href={`/groups/${slug}/organizer`} className={`${chip} bg-zinc-800 text-zinc-100 hover:bg-zinc-700`}>
                  <ClipboardList className="h-4 w-4" /> To-do list
                </Link>
                <Link href={`/groups/${slug}/stats`} className={`${chip} bg-zinc-800 text-zinc-100 hover:bg-zinc-700`}>
                  <BarChart3 className="h-4 w-4" /> Impact stats
                </Link>
                <Link href={`/groups/${slug}/edit`} className={`${chip} bg-zinc-800 text-zinc-100 hover:bg-zinc-700`}>
                  <Pencil className="h-4 w-4" /> Edit group
                </Link>
              </div>
            </div>
          )}

          {!isAdmin && isMember && (
            <Link href={`/groups/${slug}/stats`} className="flex items-center justify-between gap-3 rounded-[20px] bg-zinc-900 px-5 py-4 transition-colors hover:bg-zinc-800/70">
              <span className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/15 text-emerald-400"><BarChart3 className="h-5 w-5" /></span>
                <span>
                  <span className="block text-sm font-semibold text-zinc-100">See the group&apos;s impact</span>
                  <span className="block text-xs text-zinc-500">Bags, cleanups and where your group has been out</span>
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-zinc-500" />
            </Link>
          )}

          <div className={card}>
            <h2 className={cardHead}>
              <span>Upcoming events <span className="font-normal text-zinc-500">({upcomingEvents.length})</span></span>
            </h2>
            {upcomingEvents.length === 0 ? (
              <div className="px-5 pb-6 pt-2 text-sm text-zinc-500">
                No upcoming events.{isAdmin ? " Use New event above to schedule one." : " Join the group to hear when the next one is set."}
              </div>
            ) : (
              <ul className="px-2 pb-2">
                {upcomingEvents.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/cleanup-events/${e.id}`}
                      className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 transition-colors duration-150 hover:bg-zinc-800/60 active:bg-zinc-800 touch-manipulation"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-800">
                          {e.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.image_url} alt={e.title} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-lg">🧹</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-zinc-100">{e.title}</p>
                          <p className="text-xs text-zinc-500">
                            {formatEventDate(e.scheduled_start)}
                            {e.max_attendees ? ` · ${e.going_count}/${e.max_attendees} going` : e.going_count > 0 ? ` · ${e.going_count} going` : ""}
                          </p>
                        </div>
                      </div>
                      {e.is_ongoing && liveBadge}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {groupTeamEvents.length > 0 && (
            <div className={card}>
              <h2 className={cardHead}>
                <span>Team events <span className="font-normal text-zinc-500">({groupTeamEvents.length})</span></span>
              </h2>
              <ul className="px-2 pb-2">
                {groupTeamEvents.map(({ team_event: te, team, cascade_mode }) => (
                  <li key={te!.id}>
                    <Link
                      href={`/team-events/${te!.id}`}
                      className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 transition-colors duration-150 hover:bg-zinc-800/60 active:bg-zinc-800 touch-manipulation"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {team?.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />}
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-zinc-100">{te!.title}</p>
                          <p className="text-xs text-zinc-500">
                            {team ? `Playing for ${team.name}` : "Team pending"}
                            {cascade_mode === "individual_opt_in" ? " · members opt in" : ""}
                          </p>
                        </div>
                      </div>
                      {te!.status === "active" && liveBadge}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={card}>
            <h2 className={cardHead}>
              <span>Event history <span className="font-normal text-zinc-500">({pastEvents.length})</span></span>
            </h2>
            {pastEvents.length === 0 ? (
              <div className="px-5 pb-6 pt-2 text-sm text-zinc-500">No past events yet.</div>
            ) : (
              <PastEventsList events={pastEvents} />
            )}
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-20">
          <div className={card}>
            <h2 className={cardHead}>
              <span>Members <span className="font-normal text-zinc-500">({members.length})</span></span>
            </h2>
            {members.length === 0 ? (
              <div className="px-5 pb-6 pt-2 text-sm text-zinc-500">No members yet.</div>
            ) : (
              <ul className="max-h-[32rem] overflow-y-auto px-2 pb-2">
                {members.map((m) => {
                  const profile = profilesById.get(m.user_id);
                  return (
                    <li key={m.user_id} className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar
                          avatarUrl={profile?.avatar_url}
                          name={profile?.display_name ?? profile?.username ?? "?"}
                          username={profile?.username}
                          size="sm"
                        />
                        <span className="truncate text-sm text-zinc-200">{profile?.display_name ?? profile?.username ?? "Unknown"}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {m.role === "admin" && (
                          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">organizer</span>
                        )}
                        <span className="text-xs text-zinc-600">
                          {new Date(m.joined_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
