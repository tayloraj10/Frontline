import Link from "next/link";
import AppPromoCard from "@/components/AppPromoCard";
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

  const steps = [
    { title: "Log what you clean", body: "Take a photo and add a bag count or weight." },
    { title: "Claim territory", body: "Your block turns green on the map. Groups can claim together." },
    { title: "Spend your points", body: "Trade them for perks at local partner shops." },
  ];

  return (
    <main className="flex flex-col flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-16 gap-10 lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
      {user && <HomeAutoRedirect href={primaryHref} />}

      <div className="flex flex-col gap-6">
        <div className="inline-flex self-start items-center gap-2 px-3 py-1 bg-emerald-500/15 rounded-full text-emerald-400 text-xs font-semibold">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          {campaignCount ?? 0} campaign{campaignCount !== 1 ? "s" : ""} live now
        </div>
        <h1 className="font-display text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.02] text-balance">
          Clean your block.
          <br />
          <span className="text-emerald-400">Claim the map.</span>
        </h1>
        <p className="text-zinc-400 text-base sm:text-lg max-w-md leading-relaxed">
          Frontline turns real cleanups into a live game. Pick up trash, log it, and watch your neighborhood light up.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 max-w-md">
          <Link
            href={user ? primaryHref : "/signup"}
            className="inline-flex items-center justify-center min-h-12 px-6 bg-emerald-400 text-emerald-950 hover:bg-emerald-300 active:scale-[0.97] font-bold rounded-2xl transition-[background-color,transform] duration-150 touch-manipulation sm:flex-1"
          >
            {user ? (isBusinessOnly ? "Go to dashboard" : "Open the map") : "Create free account"}
          </Link>
          <Link
            href={user ? "/campaigns" : "/login"}
            className="inline-flex items-center justify-center min-h-12 px-6 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:scale-[0.97] font-semibold rounded-2xl transition-[background-color,transform] duration-150 touch-manipulation sm:flex-1"
          >
            {user ? "Browse campaigns" : "Sign in"}
          </Link>
        </div>
        <div className="flex gap-x-8 gap-y-3 flex-wrap">
          {stats.map((st) => (
            <div key={st.label}>
              <div className="font-display text-2xl font-bold text-zinc-100 tabular-nums">{st.value}</div>
              <div className="text-xs text-zinc-500">{st.label}</div>
            </div>
          ))}
        </div>
      </div>

      <section aria-labelledby="how-it-works" className="flex flex-col gap-4 rounded-3xl bg-zinc-900 p-5 sm:p-7">
        <h2 id="how-it-works" className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">
          How it works
        </h2>
        <ol className="flex flex-col gap-5">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="w-8 h-8 shrink-0 rounded-full bg-zinc-800 text-emerald-400 grid place-items-center font-mono text-sm">
                {i + 1}
              </span>
              <div>
                <h3 className="font-display font-bold text-zinc-100">{step.title}</h3>
                <p className="text-sm text-zinc-400 mt-0.5">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <AppPromoCard className="!bg-zinc-800/60" />
        <div className="flex gap-4 text-xs text-zinc-500 pt-2 border-t border-zinc-800">
          <Link href="/how-points-work" className="hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150">How points work</Link>
          <Link href="/legal/terms" className="hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150">Privacy</Link>
        </div>
      </section>
    </main>
  );
}
