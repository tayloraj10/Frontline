import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { paymentsVisible } from "@/lib/paymentsVisibility";
import { formatPoints } from "@/lib/formatPoints";
import type { Database } from "@/types/database";
import UserActivityList from "@/components/contributions/UserActivityList";
import ReportPhotoButton from "@/components/ReportPhotoButton";
import ShareButton from "@/components/ShareButton";
import BlockUserButton from "@/components/BlockUserButton";
import SubscriptionWidget from "@/components/billing/SubscriptionWidget";
import PlusBadge from "@/components/billing/PlusBadge";
import { getPlusEntitlement } from "@/lib/plus.server";
import { getMarketplaceAccess, mkFetch } from "@/lib/marketplace.server";
import type { MeStatus } from "@/lib/marketplace";
import PlusImpactCard, { type RecapMonth } from "./PlusImpactCard";
import GroupAvatarLightbox from "@/components/groups/GroupAvatarLightbox";
import { PageShell } from "@/components/ui/PageShell";
import ProgressBar from "@/components/ui/ProgressBar";

const WEEKLY_GOAL = 1;
const CLEANUP_TYPES = new Set(["cleanup", "cleanup_event_checkin"]);

/** Start of the ISO-ish week (Monday 00:00 UTC) as a day number, used to bucket cleanups into weeks. */
function weekIndex(d: Date) {
  const day = Math.floor(d.getTime() / 86400000);
  return Math.floor((day + 3) / 7);
}

const CAMPAIGN_UNIT: Record<string, string> = {
  territory: "pts",
  choropleth: "registrations",
  heatmap: "unfollows",
  hex_bloom: "pts",
};

const CAMPAIGN_CLAIMED_LABEL: Record<string, string> = {
  territory: "zip codes",
  choropleth: "states",
  hex_bloom: "hexes",
};

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Group = Pick<Database["public"]["Tables"]["groups"]["Row"], "id" | "name" | "slug">;

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username: rawUsername } = await params;
  const username = decodeURIComponent(rawUsername);
  const supabase = createPublicClient();
  const { data: profile } = await supabase
    .schema("public")
    .from("profiles")
    .select("username, display_name, bio, avatar_url")
    .eq("username", username)
    .single();

  if (!profile) return {};

  const title = profile.display_name || profile.username;
  const description = profile.bio ?? `${title}'s profile on Frontline.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/users/${encodeURIComponent(profile.username)}`,
      ...(profile.avatar_url && { images: [profile.avatar_url] }),
    },
    twitter: {
      title,
      description,
      ...(profile.avatar_url && { images: [profile.avatar_url] }),
    },
  };
}

export default async function UserProfilePage({ params }: Props) {
  const { username: rawUsername } = await params;
  const username = decodeURIComponent(rawUsername);
  const supabase = await createClient();

  const [{ data: { user: currentUser } }, { data: profileData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("public").from("profiles").select("*").eq("username", username).single(),
  ]);

  const profile = profileData as Profile | null;
  if (!profile) notFound();

  const isOwn = currentUser?.id === profile.id;

  // Not scoped to isOwn: a site admin viewing someone else's profile still needs this
  // (e.g. to see that profile's supporter badge), not just an admin viewing their own.
  const [{ data: viewerAdminCheck }, paymentsGate] = await Promise.all([
    currentUser
      ? supabase.from("profiles").select("is_admin").eq("id", currentUser.id).single()
      : Promise.resolve({ data: null as { is_admin: boolean } | null }),
    getPaymentsGate(),
  ]);
  const isSiteAdmin = !!viewerAdminCheck?.is_admin;
  const canSeePayments = paymentsVisible(paymentsGate, isSiteAdmin);
  const mkAccess = isOwn ? await getMarketplaceAccess() : null;
  const mkMe = mkAccess?.allowed ? await mkFetch<MeStatus>(currentUser!.id, mkAccess.isAdmin, "/me").catch(() => null) : null;
  const cleanerStatus = mkMe?.cleaner_profile?.status ?? null;
  const isPlus = canSeePayments ? (await getPlusEntitlement("user", profile.id)).has_premium : false;

  const { data: existingBlock } =
    !isOwn && currentUser
      ? await supabase
          .from("blocked_users")
          .select("id")
          .eq("blocker_id", currentUser.id)
          .eq("blocked_id", profile.id)
          .maybeSingle()
      : { data: null };

  const [
    { data: contribsData, count: contribCount },
    { data: membersData },
    { data: allContribsData },
    { data: tractsData },
    { data: reportsData },
  ] = await Promise.all([
    supabase
      .from("contributions")
      .select(
        "id, campaign_id, value, contribution_type, notes, submitted_at, cleanup_id, cleanups!cleanup_id(metrics_small_bags, metrics_large_bags, metrics_detail)",
        { count: "exact" },
      )
      .eq("user_id", profile.id)
      .order("submitted_at", { ascending: false })
      .limit(15),
    supabase
      .from("group_members")
      .select("group_id, role, joined_at")
      .eq("user_id", profile.id),
    supabase
      .from("contributions")
      .select("campaign_id, value, submitted_at, contribution_type, cleanups!cleanup_id(metrics_small_bags, metrics_large_bags)")
      .eq("user_id", profile.id),
    supabase
      .from("territory_claims")
      .select("campaign_id")
      .eq("claimed_by_user", profile.id),
    supabase
      .from("problem_reports")
      .select("id, campaign_id, severity, status, reported_at")
      .eq("submitted_by_user_id", profile.id)
      .order("reported_at", { ascending: false })
      .limit(15),
  ]);

  const { data: achievementsData } = await supabase
    .from("user_notifications")
    .select("id, type, title, body, created_at")
    .eq("user_id", profile.id)
    .in("type", ["milestone", "offer_eligible"])
    .order("created_at", { ascending: false })
    .limit(25);

  // Aggregate campaign participation from contributions + territory_claims
  const campaignStats = new Map<
    string,
    { total_value: number; contribution_count: number; tracts_claimed: number; small_bags: number; large_bags: number }
  >();
  for (const c of allContribsData ?? []) {
    if (!c.campaign_id) continue;
    const s =
      campaignStats.get(c.campaign_id) ??
      { total_value: 0, contribution_count: 0, tracts_claimed: 0, small_bags: 0, large_bags: 0 };
    s.total_value += c.value ?? 1;
    s.contribution_count += 1;
    const cleanup = c.cleanups as unknown as { metrics_small_bags: number | null; metrics_large_bags: number | null } | null;
    s.small_bags += cleanup?.metrics_small_bags ?? 0;
    s.large_bags += cleanup?.metrics_large_bags ?? 0;
    campaignStats.set(c.campaign_id, s);
  }
  for (const t of tractsData ?? []) {
    if (!t.campaign_id) continue;
    const s =
      campaignStats.get(t.campaign_id) ??
      { total_value: 0, contribution_count: 0, tracts_claimed: 0, small_bags: 0, large_bags: 0 };
    s.tracts_claimed += 1;
    campaignStats.set(t.campaign_id, s);
  }

  const allCampaignIds = [...campaignStats.keys()];
  const groupIds = (membersData ?? []).map((m) => m.group_id);
  const contribCampaignIds = [...new Set((contribsData ?? []).map((c) => c.campaign_id).filter(Boolean) as string[])];
  const reportCampaignIds = [...new Set((reportsData ?? []).map((r) => r.campaign_id).filter(Boolean) as string[])];
  const allNeededCampaignIds = [...new Set([...allCampaignIds, ...contribCampaignIds, ...reportCampaignIds])];

  const [{ data: groupsData }, { data: campaignsData }] = await Promise.all([
    groupIds.length > 0
      ? supabase.from("groups").select("id, name, slug").in("id", groupIds)
      : Promise.resolve({ data: [] as Group[] }),
    allNeededCampaignIds.length > 0
      ? supabase.schema("public").from("campaigns").select("id, title, slug, campaign_type").in("id", allNeededCampaignIds)
      : Promise.resolve({ data: [] as { id: string; title: string; slug: string; campaign_type: string }[] }),
  ]);

  const groupsById = new Map((groupsData ?? []).map((g) => [g.id, g]));
  const campaignsById = new Map((campaignsData ?? []).map((c) => [c.id, c]));

  const contribs = (contribsData ?? []).map((c) => {
    const cleanup = c.cleanups as unknown as {
      metrics_small_bags: number | null;
      metrics_large_bags: number | null;
      metrics_detail: { basis?: string; bag_types?: Record<string, number>; countable_items?: Record<string, number> } | null;
    } | null;
    return {
      id: c.id,
      campaign_id: c.campaign_id,
      value: c.value,
      contribution_type: c.contribution_type,
      notes: c.notes,
      submitted_at: c.submitted_at,
      small_bags: cleanup?.metrics_small_bags ?? null,
      large_bags: cleanup?.metrics_large_bags ?? null,
      metrics_detail: cleanup?.metrics_detail ?? null,
    };
  });
  const totalTractsCount = tractsData?.length ?? 0;

  const joinedDate = new Date(profile.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Sort campaigns by total_value descending
  const campaignEntries = [...campaignStats.entries()]
    .sort(([, a], [, b]) => b.total_value - a.total_value)
    .slice(0, 5);

  // Personal impact numbers (display only, derived from data already loaded above).
  const bagsPerContrib = (allContribsData ?? []).map((c) => {
    const cl = c.cleanups as unknown as { metrics_small_bags: number | null; metrics_large_bags: number | null } | null;
    return (cl?.metrics_small_bags ?? 0) + (cl?.metrics_large_bags ?? 0);
  });
  const lifetimeBags = bagsPerContrib.reduce((a, b) => a + b, 0);
  const bestCleanup = bagsPerContrib.reduce((a, b) => Math.max(a, b), 0);
  const nowWeek = weekIndex(new Date());
  const perWeek = new Map<number, number>();
  for (const c of allContribsData ?? []) {
    if (!c.submitted_at || !CLEANUP_TYPES.has(c.contribution_type)) continue;
    const w = weekIndex(new Date(c.submitted_at));
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const thisWeek = perWeek.get(nowWeek) ?? 0;
  // Per-month recap data (Plus members only), newest first. The current month is always included.
  const recapMonths: RecapMonth[] = [];
  if (isOwn && canSeePayments && isPlus) {
    const byMonth = new Map<string, RecapMonth>();
    const monthOf = (d: Date) => {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      let m = byMonth.get(key);
      if (!m) {
        m = {
          key,
          label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
          monthName: d.toLocaleDateString("en-US", { month: "long" }),
          bags: 0,
          cleanups: 0,
          days: new Array(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).fill(0),
        };
        byMonth.set(key, m);
      }
      return m;
    };
    monthOf(new Date());
    (allContribsData ?? []).forEach((c, i) => {
      if (!c.submitted_at) return;
      const d = new Date(c.submitted_at);
      const m = monthOf(d);
      m.bags += bagsPerContrib[i];
      m.days[d.getDate() - 1] += bagsPerContrib[i];
      if (CLEANUP_TYPES.has(c.contribution_type)) m.cleanups++;
    });
    recapMonths.push(...[...byMonth.values()].sort((a, b) => b.key.localeCompare(a.key)));
  }
  let streak = 0;
  for (let w = perWeek.has(nowWeek) ? nowWeek : nowWeek - 1; perWeek.has(w); w--) streak++;
  const displayName = profile.display_name ?? profile.username;

  const card = "rounded-[20px] bg-zinc-900 overflow-hidden";
  const cardHead = "px-5 pt-4 pb-2 font-display text-base font-extrabold tracking-tight text-zinc-100";

  return (
    <PageShell width="wide">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="shrink-0">
            <div className={`w-16 h-16 lg:w-20 lg:h-20 rounded-[20px] bg-zinc-800 overflow-hidden flex items-center justify-center ${isPlus ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-zinc-950" : ""}`}>
              {profile.avatar_url ? (
                <GroupAvatarLightbox imageUrl={profile.avatar_url} name={displayName} />
              ) : (
                <span className="font-display text-3xl font-extrabold text-zinc-300">{displayName[0].toUpperCase()}</span>
              )}
            </div>
            {profile.avatar_url && !isOwn && currentUser && (
              <ReportPhotoButton subtle contentType="avatar" contentId={profile.id} photoUrl={profile.avatar_url} userId={currentUser.id} className="mt-2.5" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className={`font-display font-extrabold text-2xl lg:text-3xl tracking-tight leading-tight ${isPlus ? "bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent" : "text-zinc-50"}`}>{displayName}</h1>
            <p className="text-sm text-zinc-500">@{profile.username} · Member since {joinedDate}</p>
            {isPlus && <PlusBadge />}
            {profile.bio && <p className="mt-1.5 max-w-prose text-sm text-zinc-400 leading-relaxed">{profile.bio}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          <ShareButton variant="icon" content={{ title: displayName, text: profile.bio ?? undefined }} />
          {isOwn && (
            <Link href="/settings/profile" className="inline-flex min-h-10 items-center px-4 text-sm font-semibold rounded-2xl bg-zinc-800 text-zinc-100 hover:bg-zinc-700 transition-[background-color,transform] active:scale-[0.97] touch-manipulation">
              Edit profile
            </Link>
          )}
          {!isOwn && currentUser && (
            <BlockUserButton blockedUserId={profile.id} blockedUsername={profile.username} initiallyBlocked={!!existingBlock} />
          )}
        </div>
      </div>

      {isOwn && canSeePayments && (
        <SubscriptionWidget ownerType="user" ownerId={profile.id} adminPreview={isSiteAdmin && !paymentsGate.enabled} />
      )}
      {isOwn && canSeePayments && isPlus && (
        <PlusImpactCard displayName={displayName} username={profile.username} months={recapMonths} />
      )}

      {isOwn && mkAccess?.allowed && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          <Link
            href="/marketplace/jobs"
            className="flex min-h-14 flex-col justify-center rounded-[20px] bg-zinc-900 px-5 py-3 touch-manipulation active:scale-[0.98]"
          >
            <span className="text-sm font-extrabold text-zinc-100">My bookings</span>
            <span className="text-xs text-zinc-500">Jobs you posted or took</span>
          </Link>
          <Link
            href="/marketplace/become-a-cleaner"
            className="flex min-h-14 flex-col justify-center rounded-[20px] bg-zinc-900 px-5 py-3 touch-manipulation active:scale-[0.98]"
          >
            <span className="text-sm font-extrabold text-zinc-100">{cleanerStatus ? "Cleaner profile" : "Become a cleaner"}</span>
            <span className="text-xs text-zinc-500">{cleanerStatus ? "Your area, rate and status" : "Take jobs near you"}</span>
          </Link>
        </div>
      )}

      {/* Impact stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Points", value: formatPoints(profile.points ?? 0), accent: true },
          { label: "Bags picked up", value: lifetimeBags.toLocaleString() },
          { label: "Cleanups logged", value: (contribCount ?? 0).toLocaleString() },
          { label: "Zip codes cleaned", value: totalTractsCount.toLocaleString() },
        ].map(({ label, value, accent }) => (
          <div key={label} className="rounded-[20px] bg-zinc-900 px-5 py-4">
            <div className={`font-display text-2xl lg:text-3xl font-extrabold tracking-tight tabular-nums ${accent ? "text-amber-400" : "text-zinc-50"}`}>{value}</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          {/* Streak: visible to everyone; weekly goal and actions are own profile only */}
          {!isOwn && (
            <div className={`${card} p-5 flex items-center justify-between gap-4`}>
              <h2 className="font-display text-base font-extrabold tracking-tight text-zinc-100">Cleanup streak</h2>
              <div className="text-right">
                <div className="font-display text-2xl font-extrabold tabular-nums text-emerald-400">{streak}</div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">week streak</div>
              </div>
            </div>
          )}
          {isOwn && (
            <div className={`${card} p-5`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-extrabold tracking-tight text-zinc-100">This week</h2>
                  <p className="mt-0.5 text-sm text-zinc-400">
                    {thisWeek >= WEEKLY_GOAL
                      ? "You cleaned up this week. Nice work."
                      : "Log a cleanup this week to keep your streak going."}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl font-extrabold tabular-nums text-emerald-400">{streak}</div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">week streak</div>
                </div>
              </div>
              <ProgressBar className="mt-4" value={(thisWeek / WEEKLY_GOAL) * 100} label="Weekly cleanup goal" />
              <div className="mt-2 flex justify-between text-xs text-zinc-500 tabular-nums">
                <span>{Math.min(thisWeek, WEEKLY_GOAL)} of {WEEKLY_GOAL} {WEEKLY_GOAL === 1 ? "cleanup" : "cleanups"}</span>
                <span>Best cleanup: {bestCleanup} bag{bestCleanup === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/campaigns/trash-war" className="inline-flex min-h-10 items-center px-4 text-sm font-bold rounded-2xl bg-emerald-400 text-emerald-950 hover:bg-emerald-300 active:scale-[0.97] transition-[transform,background-color] touch-manipulation">Log a cleanup</Link>
                <Link href="/partners" className="inline-flex min-h-10 items-center px-4 text-sm font-semibold rounded-2xl bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:scale-[0.97] transition-[transform,background-color] touch-manipulation">Spend {formatPoints(profile.spendable_points ?? 0)} pts</Link>
              </div>
            </div>
          )}

          {/* Recent Activity */}
          <div className={card}>
            <h2 className={cardHead}>Recent activity</h2>
            <UserActivityList
              initialContribs={contribs}
              initialReports={reportsData ?? []}
              campaigns={campaignsData ?? []}
              isOwn={isOwn}
              userId={currentUser?.id ?? null}
              profileId={profile.id}
            />
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          {/* Achievements */}
          <div className={card}>
            <div className="flex items-center justify-between pr-5"><h2 className={cardHead}>Achievements</h2>{isOwn && <Link href="/achievements" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">See all</Link>}</div>
            {(achievementsData ?? []).length === 0 ? (
              <p className="px-5 pb-5 text-sm text-zinc-500">Milestones you unlock will show up here. Log your first cleanup to get started.</p>
            ) : (
              <ul className="px-2 pb-2">
                {(achievementsData ?? []).map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-2xl px-3 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-base">{a.type === "offer_eligible" ? "🎁" : "🏆"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-zinc-100">{a.title}</p>
                      {a.body && <p className="mt-0.5 text-xs text-zinc-500">{a.body}</p>}
                      <p className="mt-1 text-xs text-zinc-600">{new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Campaign Participation */}
          {campaignEntries.length > 0 && (
            <div className={card}>
              <h2 className={cardHead}>Campaigns</h2>
              <ul className="px-2 pb-2">
                {campaignEntries.map(([campaignId, stats]) => {
                  const campaign = campaignsById.get(campaignId);
                  if (!campaign) return null;
                  const unit = CAMPAIGN_UNIT[campaign.campaign_type] ?? "pts";
                  const bags = stats.small_bags + stats.large_bags;
                  return (
                    <li key={campaignId}>
                      <Link href={`/campaigns/${campaign.slug}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-zinc-800/60 transition-colors">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">{campaign.title}</span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular-nums text-zinc-200">{formatPoints(stats.total_value)} {unit}</span>
                          {bags > 0 && <span className="block text-xs tabular-nums text-zinc-500">{bags} bag{bags !== 1 ? "s" : ""}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Groups */}
          {(membersData ?? []).length > 0 && (
            <div className={card}>
              <h2 className={cardHead}>Groups</h2>
              <ul className="px-2 pb-2">
                {(membersData ?? []).map((m) => {
                  const group = groupsById.get(m.group_id);
                  if (!group) return null;
                  return (
                    <li key={m.group_id}>
                      <Link href={`/groups/${group.slug}`} className="flex items-center justify-between gap-3 rounded-2xl px-3 py-3 hover:bg-zinc-800/60 transition-colors">
                        <span className="text-sm font-semibold text-zinc-100">{group.name}</span>
                        <span className="text-xs capitalize text-zinc-500">{m.role}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
