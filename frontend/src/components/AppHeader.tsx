import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UserNav from "./UserNav";
import NotificationBellWrapper from "./NotificationBellWrapper";
import SupportButton from "./SupportButton";

export default async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.is_admin ?? false;
  }

  return (
    <header className="border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-black text-base tracking-widest"
          >
            <span className="text-emerald-400 text-lg">⚑</span>
            <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              FRONTLINE
            </span>
            <span className="text-[10px] font-semibold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 tracking-wider">
              {process.env.NEXT_PUBLIC_APP_VERSION ?? "beta"}
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            <Link
              href="/campaigns"
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-lg transition-colors"
            >
              Campaigns
            </Link>
            {user && (
              <Link
                href="/groups"
                className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-lg transition-colors"
              >
                Groups
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="px-3 py-1.5 text-sm text-amber-500 hover:text-amber-400 hover:bg-zinc-800/60 rounded-lg transition-colors"
              >
                Admin
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <SupportButton />
          {user && <NotificationBellWrapper userId={user.id} />}
          <UserNav user={user} />
        </div>
      </div>
    </header>
  );
}
