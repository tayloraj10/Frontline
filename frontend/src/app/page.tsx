import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HomeAutoRedirect from "@/components/HomeAutoRedirect";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isBusinessOnly = false;
  if (user) {
    const { data: profile } = await supabase
      .schema("public")
      .from("profiles")
      .select("is_business_only")
      .eq("id", user.id)
      .single();
    isBusinessOnly = profile?.is_business_only ?? false;
  }

  const [{ count: campaignCount }, { count: contribCount }, { count: userCount }] = await Promise.all([
    supabase.schema("public").from("campaigns").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("contributions").select("*", { count: "exact", head: true }),
    supabase.schema("public").from("profiles").select("*", { count: "exact", head: true }),
  ]);

  const stats = [
    { value: campaignCount ?? 0, label: "active campaigns" },
    { value: (contribCount ?? 0).toLocaleString(), label: "contributions logged" },
    { value: (userCount ?? 0).toLocaleString(), label: "users on the frontline" },
  ];

  const primaryHref = isBusinessOnly ? "/partners/dashboard" : "/campaigns/trash-war";

  return (
    <main className="relative flex flex-col items-center justify-center flex-1 px-6 py-24 text-center gap-10 overflow-hidden">
      {user && <HomeAutoRedirect href={primaryHref} />}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_58%_at_50%_40%,rgba(16,185,129,0.18),transparent)] pointer-events-none" />

      <div className="relative space-y-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-900/30 border border-emerald-700/40 rounded-full text-emerald-400 text-xs font-semibold tracking-wide mb-1">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          {campaignCount ?? 0} campaign{campaignCount !== 1 ? "s" : ""} live now
        </div>
        <h1 className="text-4xl sm:text-7xl font-black tracking-tighter bg-gradient-to-b from-white via-zinc-100 to-zinc-500 bg-clip-text text-transparent leading-none">
          FRONTLINE
        </h1>
        <p className="text-zinc-400 text-lg max-w-sm mx-auto leading-relaxed">
          Collective action on the map.{" "}
          <span className="text-zinc-200">
            Join campaigns, take action, change the world.
          </span>
        </p>
        <p className="text-emerald-400/80 text-sm font-semibold tracking-wide">
          Join us on the frontline.
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
          className="px-7 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-500 active:scale-[0.97] text-white font-semibold rounded-xl transition-[background-color,transform] duration-150 text-sm shadow-lg shadow-emerald-950/60 touch-manipulation"
        >
          Browse Campaigns
        </Link>
        {user ? (
          <Link
            href={primaryHref}
            className="px-7 py-3 border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900 active:border-zinc-500 active:bg-zinc-900 active:scale-[0.97] text-zinc-300 font-semibold rounded-xl transition-[background-color,border-color,transform] duration-150 text-sm touch-manipulation"
          >
            {isBusinessOnly ? "Go to Dashboard" : "Open Trash War Map"}
          </Link>
        ) : (
          <Link
            href="/signup"
            className="px-7 py-3 border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900 active:border-zinc-500 active:bg-zinc-900 active:scale-[0.97] text-zinc-300 font-semibold rounded-xl transition-[background-color,border-color,transform] duration-150 text-sm touch-manipulation"
          >
            Sign Up
          </Link>
        )}
      </div>

      {/* Feature pills */}
      <div className="relative flex flex-wrap justify-center gap-2 max-w-md">
        {[
          { icon: "🗺", label: "Zip code control" },
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
        <Link href="/legal/terms" className="hover:text-zinc-400 active:text-zinc-400 transition-colors duration-150">Terms</Link>
        <Link href="/legal/privacy" className="hover:text-zinc-400 active:text-zinc-400 transition-colors duration-150">Privacy</Link>
      </div>
    </main>
  );
}
