import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UserNav from "./UserNav";
import NotificationBellWrapper from "./NotificationBellWrapper";
import AchievementModalWrapper from "./AchievementModalWrapper";
import SupportButton from "./SupportButton";
import BottomTabBar from "./nav/BottomTabBar";
import { buildNavLinks } from "@/lib/navLinks";
import { version as appVersion } from "../../package.json";

export default async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  let isBusinessAdmin = false;
  let isBusinessOnly = false;
  let points = 0;
  let spendablePoints = 0;
  let avatarUrl: string | null = null;
  if (user) {
    const [{ data: profile }, { data: businessAdminRows }] = await Promise.all([
      supabase
        .schema("public")
        .from("profiles")
        .select("is_admin, points, spendable_points, is_business_only, avatar_url")
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
    isBusinessAdmin = (businessAdminRows?.length ?? 0) > 0;
    isBusinessOnly = profile?.is_business_only ?? false;
  }

  const navLinks = buildNavLinks({ isBusinessOnly, isBusinessAdmin, isAdmin });

  return (
    <>
    <header className="border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 font-black text-base tracking-widest min-w-0"
          >
            <span className="text-emerald-400 text-lg shrink-0">⚑</span>
            <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent truncate">
              FRONTLINE
            </span>
            <span className="text-[10px] font-semibold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 tracking-wider shrink-0">
              {appVersion}
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors hover:bg-zinc-800/60 ${
                  link.highlight
                    ? "text-amber-500 hover:text-amber-400"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <SupportButton />
          {user && <NotificationBellWrapper userId={user.id} />}
          {user && <AchievementModalWrapper userId={user.id} />}
          <UserNav user={user} points={points} spendablePoints={spendablePoints} avatarUrl={avatarUrl} />
        </div>
      </div>
    </header>
    <BottomTabBar links={navLinks} />
    </>
  );
}
