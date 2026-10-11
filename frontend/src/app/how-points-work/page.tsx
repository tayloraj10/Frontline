import type { Metadata } from "next";
import Link from "next/link";
import BackButton from "@/components/ui/BackButton";

export const metadata: Metadata = {
  title: "How points work",
  description: "What earns points on Frontline, how territory gets claimed, and how to spend your points.",
};

const EARN = [
  { action: "Small trash bag", points: "1" },
  { action: "Large trash bag", points: "3" },
  { action: "Claiming a trash report as a challenge", points: "×1.5 on the cleanup" },
  { action: "Civic action or solarpunk photo", points: "1" },
];

const SECTIONS = [
  {
    title: "Territory",
    body: "Every cleanup you log counts toward the area where you did it. As an area fills up it turns green on the map. If you log for a group, the group gets the territory credit.",
  },
  {
    title: "Events and multipliers",
    body: "Some campaigns run events that multiply the points for a cleanup. A multiplier stacks with the challenge bonus, and it shows on the campaign page while it is active.",
  },
  {
    title: "Spending points",
    body: "Points you earn can be spent on offers from local partner businesses. Some offers are redeemed by checking in at a group cleanup instead of spending points. The Partners tab lists what is available near you.",
  },
];

export default function HowPointsWorkPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <BackButton href="/campaigns" label="Campaigns" />
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100">How points work</h1>
        <p className="text-zinc-400 max-w-md leading-relaxed">
          You earn points for the trash you pick up. Points rank you on leaderboards and pay for perks at partner shops.
        </p>
      </div>

      <section aria-labelledby="earn" className="rounded-3xl bg-zinc-900 p-5 sm:p-6 flex flex-col gap-3">
        <h2 id="earn" className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">
          What earns points
        </h2>
        <dl className="flex flex-col divide-y divide-zinc-800">
          {EARN.map((row) => (
            <div key={row.action} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <dt className="text-zinc-200">{row.action}</dt>
              <dd className="font-display font-bold text-emerald-400 tabular-nums text-right">{row.points}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-zinc-500">
          Points are calculated on our servers from the bags you log, so the number you see after submitting is the one that counts.
        </p>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.title} className="flex flex-col gap-1.5">
          <h2 className="font-display text-lg font-bold text-zinc-100">{s.title}</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">{s.body}</p>
        </section>
      ))}

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/campaigns"
          className="inline-flex items-center justify-center min-h-12 px-6 bg-emerald-400 text-emerald-950 hover:bg-emerald-300 active:scale-[0.97] font-bold rounded-2xl transition-[background-color,transform] duration-150 touch-manipulation"
        >
          Browse campaigns
        </Link>
        <Link
          href="/partners"
          className="inline-flex items-center justify-center min-h-12 px-6 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:scale-[0.97] font-semibold rounded-2xl transition-[background-color,transform] duration-150 touch-manipulation"
        >
          See partner perks
        </Link>
      </div>
    </main>
  );
}
