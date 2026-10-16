import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell, PageHeader } from "@/components/ui/PageShell";
import ProgressBar from "@/components/ui/ProgressBar";

export const metadata: Metadata = {
  title: "Achievements",
  description: "Your milestones and what you're working toward next.",
};

type Ladder = { key: string; title: string; unit: string; current: number; rungs: number[]; icon: string };

function LadderCard({ ladder }: { ladder: Ladder }) {
  const { title, unit, current, rungs, icon } = ladder;
  const reached = rungs.filter((r) => current >= r).length;
  const next = rungs.find((r) => current < r);
  const prev = reached > 0 ? rungs[reached - 1] : 0;
  const pct = next ? ((current - prev) / (next - prev)) * 100 : 100;
  return (
    <div className="rounded-[20px] bg-zinc-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400/15 text-lg" aria-hidden>{icon}</span>
          <div>
            <h2 className="font-display text-base font-extrabold tracking-tight text-zinc-100">{title}</h2>
            <p className="text-xs text-zinc-500 tabular-nums">{reached} of {rungs.length} milestones</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-extrabold tabular-nums text-zinc-50">{Math.round(current).toLocaleString()}</div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{unit}</div>
        </div>
      </div>
      <ProgressBar className="mt-4" value={pct} tone="points" label={`${title} progress`} />
      <p className="mt-2 text-xs text-zinc-400 tabular-nums">
        {next ? `${Math.ceil(next - current).toLocaleString()} ${unit} to your next milestone at ${next.toLocaleString()}` : "Every milestone reached. Amazing."}
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {rungs.map((r) => {
          const done = current >= r;
          return (
            <li
              key={r}
              className={`rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${done ? "bg-amber-400/15 text-amber-400" : "bg-zinc-800 text-zinc-500"}`}
            >
              {done ? "✓ " : ""}{r.toLocaleString()}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default async function AchievementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: settings }, { data: contribs }, { data: unlocked }] = await Promise.all([
    supabase.schema("public").from("profiles").select("points, spendable_points").eq("id", user.id).single(),
    supabase.schema("public").from("game_settings").select("key, value").eq("category", "milestones"),
    supabase
      .from("contributions")
      .select("cleanups!cleanup_id(metrics_small_bags, metrics_large_bags)")
      .eq("user_id", user.id),
    supabase
      .from("user_notifications")
      .select("id, type, title, body, created_at")
      .eq("user_id", user.id)
      .in("type", ["milestone", "offer_eligible"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const rungs = (prefix: string) =>
    (settings ?? [])
      .filter((s) => s.key.startsWith(prefix))
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
      .map((s) => Number(s.value));

  const bags = (contribs ?? []).reduce((sum, c) => {
    const cl = c.cleanups as unknown as { metrics_small_bags: number | null; metrics_large_bags: number | null } | null;
    return sum + (cl?.metrics_small_bags ?? 0) + (cl?.metrics_large_bags ?? 0);
  }, 0);

  const ladders: Ladder[] = [
    { key: "points", title: "Points earned", unit: "pts", current: profile?.points ?? 0, rungs: rungs("points_milestone_"), icon: "⭐" },
    { key: "bags", title: "Bags picked up", unit: "bags", current: bags, rungs: rungs("cleanup_bag_milestone_"), icon: "🗑️" },
    { key: "count", title: "Cleanups logged", unit: "cleanups", current: contribs?.length ?? 0, rungs: rungs("contribution_count_milestone_"), icon: "📍" },
  ].filter((l) => l.rungs.length > 0);

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Your progress"
        title="Achievements"
        subtitle="Milestones you've unlocked and how close you are to the next one."
        action={
          <Link href="/partners" className="inline-flex min-h-10 items-center rounded-2xl bg-zinc-800 px-4 text-sm font-semibold text-zinc-100 transition-[background-color,transform] hover:bg-zinc-700 active:scale-[0.97] touch-manipulation">
            Spend {(profile?.spendable_points ?? 0).toLocaleString()} pts
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {ladders.map((l) => <LadderCard key={l.key} ladder={l} />)}
        </div>
        <div className="rounded-[20px] bg-zinc-900 overflow-hidden">
          <h2 className="px-5 pt-4 pb-2 font-display text-base font-extrabold tracking-tight text-zinc-100">Unlocked</h2>
          {(unlocked ?? []).length === 0 ? (
            <p className="px-5 pb-5 text-sm text-zinc-500">Nothing yet. Log your first cleanup to get started.</p>
          ) : (
            <ul className="px-2 pb-2">
              {(unlocked ?? []).map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-2xl px-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-base">{a.type === "offer_eligible" ? "🎁" : "🏆"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-zinc-100">{a.title}</p>
                    {a.body && <p className="mt-0.5 text-xs text-zinc-500">{a.body}</p>}
                    <p className="mt-1 text-xs text-zinc-600">{new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageShell>
  );
}
