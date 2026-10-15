import Link from "next/link";
import LogoLink from "@/components/nav/LogoLink";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import UserNav from "./UserNav";
import NotificationBellWrapper from "./NotificationBellWrapper";
import AchievementModalWrapper from "./AchievementModalWrapper";
import ActivitySnapshotModalWrapper from "./ActivitySnapshotModalWrapper";
import SupportButton from "./SupportButton";
import BottomTabBar from "./nav/BottomTabBar";
import DesktopNavMenu from "./nav/DesktopNavMenu";
import HeaderHeightObserver from "./nav/HeaderHeightObserver";
import { buildNavLinks } from "@/lib/navLinks";
import { version as appVersion } from "../../package.json";

// Shared, RLS-open check rendered on every page via AppHeader — bounded to
// once per 30s regardless of traffic instead of once per page view.
const getHasActiveTeamEvent = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { count } = await supabase
      .schema("public")
      .from("team_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    return (count ?? 0) > 0;
  },
  ["has-active-team-event"],
  { revalidate: 30 }
);

export default async function AppHeader() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    hasActiveTeamEvent,
  ] = await Promise.all([supabase.auth.getUser(), getHasActiveTeamEvent()]);

  let isAdmin = false;
  let isBusinessAdmin = false;
  let isBusinessOnly = false;
  let points = 0;
  let spendablePoints = 0;
  let avatarUrl: string | null = null;
  let displayName: string | null = null;
  let username: string | null = null;
  let hasPendingOrganizerItems = false;
  let hasPendingAdminReviewItems = false;
  if (user) {
    const [{ data: profile }, { data: businessAdminRows }] = await Promise.all([
      supabase
        .schema("public")
        .from("profiles")
        .select("is_admin, points, spendable_points, is_business_only, avatar_url, username, display_name")
        .eq("id", user.id)
        .single(),
      supabase
        .schema("public")
        .from("partner_business_admins")
        .select("id")
        .eq("user_id", user.id)
        .limit(1),
    ]);
    isAdmin = profile?.is_admin ?? false;
    points = profile?.points ?? 0;
    spendablePoints = profile?.spendable_points ?? 0;
    avatarUrl = profile?.avatar_url ?? null;
    displayName = profile?.display_name ?? profile?.username ?? null;
    username = profile?.username ?? null;
    isBusinessAdmin = (businessAdminRows?.length ?? 0) > 0;
    isBusinessOnly = profile?.is_business_only ?? false;

    const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";
    try {
      const params = new URLSearchParams({ viewer_user_id: user.id });
      const res = await fetch(`${fastapiUrl}/api/users/me/has-pending-organizer-items?${params}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const json = await res.json();
        hasPendingOrganizerItems = json.has_pending_items ?? false;
      }
    } catch {
      hasPendingOrganizerItems = false;
    }

    if (isAdmin) {
      const [{ count: pendingGroupsCount }, { count: pendingPartnersCount }] = await Promise.all([
        supabase
          .schema("public")
          .from("groups")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .schema("public")
          .from("partner_businesses")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      hasPendingAdminReviewItems = (pendingGroupsCount ?? 0) > 0 || (pendingPartnersCount ?? 0) > 0;
    }
  }

  const navLinks = buildNavLinks({ isBusinessOnly, isBusinessAdmin, isAdmin, hasActiveTeamEvent, hasPendingOrganizerItems });

  return (
    <>
    <HeaderHeightObserver />
    <header className="pt-safe bg-zinc-950/85 backdrop-blur-md sticky top-0 z-50 shadow-[0_1px_0_0_var(--ink-800)]">
      <div className="max-w-[100rem] mx-auto px-3 sm:px-6 lg:px-8 h-14 lg:h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <LogoLink
            className="flex items-center gap-2 font-display font-extrabold text-lg tracking-tight min-w-0 active:scale-[0.97] transition-transform duration-150"
          >
            <span className="grid place-items-center w-7 h-7 rounded-[10px] bg-emerald-400 text-emerald-950 text-sm shrink-0">⚑</span>
            <span className="text-zinc-100 truncate">Frontline</span>
            <span className="hidden md:inline text-[10px] font-semibold text-zinc-500 bg-zinc-800/70 rounded-full px-2 py-0.5 tracking-wider shrink-0">
              {appVersion}
            </span>
            {process.env.NODE_ENV !== "production" && (
              <span className="hidden md:inline text-[10px] font-semibold text-rose-400/80 bg-rose-500/10 rounded-full px-2 py-0.5 tracking-wider shrink-0">
                DEV
              </span>
            )}
          </LogoLink>
          {/* Full inline nav only once there's real room for it (laptop-and-under falls back to the hamburger below). */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg whitespace-nowrap shrink-0 transition-[background-color,color,transform] duration-150 hover:bg-zinc-800/70 active:bg-zinc-800/70 active:scale-[0.97] touch-manipulation font-medium ${
                  link.highlight
                    ? "text-amber-500 hover:text-amber-400 active:text-amber-400"
                    : "text-zinc-400 hover:text-zinc-100 active:text-zinc-100"
                }`}
              >
                {link.label}
                {link.pulse && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)] animate-pulse shrink-0"
                    aria-hidden="true"
                  />
                )}
              </Link>
            ))}
          </nav>
          <div className="hidden sm:flex lg:hidden">
            <DesktopNavMenu links={navLinks} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0">
            <SupportButton />
            {isAdmin && <ActivitySnapshotModalWrapper hasPendingReviewItems={hasPendingAdminReviewItems} />}
            {user && <NotificationBellWrapper userId={user.id} />}
            {user && <AchievementModalWrapper userId={user.id} />}
          </div>
          <UserNav
            user={user}
            points={points}
            spendablePoints={spendablePoints}
            avatarUrl={avatarUrl}
            displayName={displayName}
            username={username}
          />
        </div>
      </div>
    </header>
    <BottomTabBar links={navLinks} />
    </>
  );
}
