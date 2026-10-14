import LegalModalLink from "@/components/legal/LegalModalLink";
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

  const [{ count: contribCount }, { count: userCount }] = await Promise.all([
    supabase.from("contributions").select("*", { count: "exact", head: true }),
    supabase.schema("public").from("profiles").select("*", { count: "exact", head: true }),
  ]);

  const stats = [
    { value: (contribCount ?? 0).toLocaleString(), label: "contributions" },
    { value: (userCount ?? 0).toLocaleString(), label: "users" },
  ];

  const primaryHref = isBusinessOnly ? "/partners/dashboard" : "/campaigns/trash-war";

  const steps = [
    { title: "Log what you clean", body: "Take a photo and add a bag count or weight." },
    { title: "Earn points", body: "Every bag counts toward your total and your group's. Join an event to meet people and earn more." },
    { title: "Spend your points", body: "Trade them for perks at local partner shops." },
  ];

  return (
    <main className="flex flex-col flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-16 gap-10 lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
      {user && <HomeAutoRedirect href={primaryHref} />}

      <div className="flex flex-col gap-6">
        <h1 className="font-display text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.02] text-balance">
          Clean your neighborhood.
          <br />
          <span className="text-emerald-400">Earn rewards for it.</span>
        </h1>
        <p className="text-zinc-400 text-base sm:text-lg max-w-md leading-relaxed">
          Join cleanup events or head out on your own. Log what you pick up, earn points, and spend them at local partner shops. Groups get tools to run events and show their impact.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 max-w-md">
          <Link
            href={user ? primaryHref : "/signup"}
            className="inline-flex items-center justify-center min-h-12 px-6 bg-emerald-400 text-emerald-950 hover:bg-emerald-300 active:scale-[0.97] font-bold rounded-2xl transition-[background-color,transform] duration-150 touch-manipulation sm:flex-1"
          >
            {user ? (isBusinessOnly ? "Go to dashboard" : "Open the map") : "Create free account"}
          </Link>
          {!user && (
            <Link
              href="/login"
              className="inline-flex items-center justify-center min-h-12 px-6 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:scale-[0.97] font-semibold rounded-2xl transition-[background-color,transform] duration-150 touch-manipulation sm:flex-1"
            >
              Sign in
            </Link>
          )}
        </div>
        <div className="grid max-w-md grid-cols-2 divide-x divide-zinc-800 rounded-[20px] bg-zinc-900 py-4 text-center">
          {stats.map((st) => (
            <div key={st.label} className="px-4">
              <div className="font-display text-3xl font-extrabold tracking-tight text-emerald-400 tabular-nums">{st.value}</div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{st.label}</div>
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
          <LegalModalLink doc="points" className="hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150">How points work</LegalModalLink>
          <LegalModalLink doc="terms" className="hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150">Terms</LegalModalLink>
          <LegalModalLink doc="privacy" className="hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150">Privacy</LegalModalLink>
        </div>
      </section>
    </main>
  );
}
