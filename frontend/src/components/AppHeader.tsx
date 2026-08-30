import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import UserNav from "./UserNav";
import NotificationBellWrapper from "./NotificationBellWrapper";
import AchievementModalWrapper from "./AchievementModalWrapper";
import SupportButton from "./SupportButton";
import BottomTabBar from "./nav/BottomTabBar";
import DesktopNavMenu from "./nav/DesktopNavMenu";
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
  }

  const navLinks = buildNavLinks({ isBusinessOnly, isBusinessAdmin, isAdmin, hasActiveTeamEvent });

  return (
    <>
    <header className="pt-safe border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-sm sticky top-0 z-50 shadow-elevation-2">
      <div className="max-w-[100rem] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 font-black text-base tracking-widest min-w-0 active:scale-[0.97] transition-transform duration-150"
          >
            <span className="text-emerald-400 text-lg shrink-0 drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]">⚑</span>
            <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent truncate">
              FRONTLINE
            </span>
            <span className="text-[10px] font-semibold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 tracking-wider shrink-0">
              {appVersion}
            </span>
            {process.env.NODE_ENV !== "production" && (
              <span className="text-[10px] font-semibold text-rose-400/80 bg-rose-500/10 border border-rose-500/20 rounded px-1.5 py-0.5 tracking-wider shrink-0">
                DEV
              </span>
            )}
          </Link>
          {/* Full inline nav only once there's real room for it (laptop-and-under falls back to the hamburger below). */}
          <nav className="hidden xl:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg whitespace-nowrap shrink-0 transition-[background-color,color,transform] duration-150 hover:bg-zinc-800/60 active:bg-zinc-800/60 active:scale-[0.97] touch-manipulation ${
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
          <div className="hidden sm:flex xl:hidden">
            <DesktopNavMenu links={navLinks} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SupportButton />
          {user && <NotificationBellWrapper userId={user.id} />}
          {user && <AchievementModalWrapper userId={user.id} />}
          <UserNav user={user} points={points} spendablePoints={spendablePoints} avatarUrl={avatarUrl} displayName={displayName} username={username} />
        </div>
      </div>
    </header>
    <BottomTabBar links={navLinks} />
    </>
  );
}
