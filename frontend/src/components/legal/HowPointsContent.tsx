const EARN = [
  { action: "Small trash bag", points: "1" },
  { action: "Large trash bag", points: "3" },
  { action: "Trash report", points: "1" },
];

const SECTIONS = [
  {
    title: "Solo or with a group",
    body: "Log cleanups on your own and they count toward your personal total. Log for a group and they also count toward the group's impact, which its organizers can see in their stats.",
  },
  {
    title: "Spending points",
    body: "Points you earn can be spent on offers from local partner businesses. Some offers are redeemed by checking in at a group cleanup instead of spending points. The Rewards tab lists what is available near you.",
  },
];

export default function HowPointsContent() {
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="earn" className="rounded-[20px] bg-zinc-800/60 p-4 flex flex-col gap-2">
        <h2 id="earn" className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">
          What earns points
        </h2>
        <dl className="flex flex-col divide-y divide-zinc-800">
          {EARN.map((row) => (
            <div key={row.action} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
              <dt className="text-zinc-200">{row.action}</dt>
              <dd className="font-display font-bold text-emerald-400 tabular-nums text-right">{row.points}</dd>
            </div>
          ))}
        </dl>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.title} className="flex flex-col gap-1">
          <h2 className="font-display text-base font-bold text-zinc-100">{s.title}</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">{s.body}</p>
        </section>
      ))}
    </div>
  );
}
