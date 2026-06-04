import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/campaigns");

  return (
    <main className="relative flex flex-col items-center justify-center flex-1 px-6 py-24 text-center gap-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_40%,rgba(16,185,129,0.08),transparent)] pointer-events-none" />

      <div className="relative space-y-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-900/30 border border-emerald-700/40 rounded-full text-emerald-400 text-xs font-semibold tracking-wide mb-1">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          Campaigns live now
        </div>
        <h1 className="text-7xl font-black tracking-tighter bg-gradient-to-b from-white via-zinc-100 to-zinc-500 bg-clip-text text-transparent leading-none">
          FRONTLINE
        </h1>
        <p className="text-zinc-400 text-lg max-w-sm mx-auto leading-relaxed">
          Collective action on the map.{" "}
          <span className="text-zinc-200">
            Join campaigns, claim territory, change the world.
          </span>
        </p>
      </div>

      <div className="relative flex gap-3">
        <Link
          href="/campaigns"
          className="px-7 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors text-sm shadow-lg shadow-emerald-950/60"
        >
          Browse Campaigns
        </Link>
        <Link
          href="/login"
          className="px-7 py-3 border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900 text-zinc-300 font-semibold rounded-xl transition-colors text-sm"
        >
          Sign In
        </Link>
      </div>
    </main>
  );
}
