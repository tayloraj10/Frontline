import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/campaigns");

  const [{ count: campaignCount }, { count: contribCount }] = await Promise.all([
    supabase.schema("public").from("campaigns").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("contributions").select("*", { count: "exact", head: true }),
  ]);

  const stats = [
    { value: campaignCount ?? 0, label: "active campaigns" },
    { value: (contribCount ?? 0).toLocaleString(), label: "contributions logged" },
  ];

  return (
    <main className="relative flex flex-col items-center justify-center flex-1 px-6 py-24 text-center gap-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_58%_at_50%_40%,rgba(16,185,129,0.18),transparent)] pointer-events-none" />

      <div className="relative space-y-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-900/30 border border-emerald-700/40 rounded-full text-emerald-400 text-xs font-semibold tracking-wide mb-1">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          {campaignCount ?? 0} campaign{campaignCount !== 1 ? "s" : ""} live now
        </div>
        <h1 className="text-5xl sm:text-7xl font-black tracking-tighter bg-gradient-to-b from-white via-zinc-100 to-zinc-500 bg-clip-text text-transparent leading-none">
          FRONTLINE
        </h1>
        <p className="text-zinc-400 text-lg max-w-sm mx-auto leading-relaxed">
          Collective action on the map.{" "}
          <span className="text-zinc-200">
            Join campaigns, take action, change the world.
          </span>
        </p>
      </div>

      {/* Live stats */}
      <div className="relative flex gap-8">
        {stats.map((s, i) => (
          <div key={i} className="text-center">
            <div className="text-2xl font-black text-zinc-100 tabular-nums">{s.value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="relative flex gap-3">
        <Link
          href="/campaigns"
          className="px-7 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors text-sm shadow-lg shadow-emerald-950/60"
        >
          Browse Campaigns
        </Link>
        <Link
          href="/signup"
          className="px-7 py-3 border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900 text-zinc-300 font-semibold rounded-xl transition-colors text-sm"
        >
          Sign Up
        </Link>
      </div>

      {/* Feature pills */}
      <div className="relative flex flex-wrap justify-center gap-2 max-w-md">
        {[
          { icon: "🗺", label: "Territory control" },
          { icon: "📍", label: "Live maps" },
          { icon: "⚡", label: "Map events" },
          { icon: "👥", label: "Group competition" },
          { icon: "🌱", label: "Real impact" },
        ].map(({ icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-xs text-zinc-500"
          >
            <span>{icon}</span>
            {label}
          </span>
        ))}
      </div>

      <div className="relative flex gap-4 text-xs text-zinc-600">
        <Link href="/legal/terms" className="hover:text-zinc-400 transition-colors">Terms</Link>
        <Link href="/legal/privacy" className="hover:text-zinc-400 transition-colors">Privacy</Link>
      </div>
    </main>
  );
}
