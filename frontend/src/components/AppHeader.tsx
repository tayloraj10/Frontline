import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UserNav from "./UserNav";
import NotificationBellWrapper from "./NotificationBellWrapper";

export default async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/campaigns"
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-lg transition-colors"
            >
              Campaigns
            </Link>
            <Link
              href="/groups"
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-lg transition-colors"
            >
              Groups
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {user && <NotificationBellWrapper userId={user.id} />}
          <UserNav user={user} />
        </div>
      </div>
    </header>
  );
}
