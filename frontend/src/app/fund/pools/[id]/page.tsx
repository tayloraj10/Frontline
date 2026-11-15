import { notFound } from "next/navigation";
import { PageShell, PageHeader, Section } from "@/components/ui/PageShell";
import ProgressBar from "@/components/ui/ProgressBar";
import Badge from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { daysLeft, describeRule, poolPlace, usd, type SponsorshipPool } from "@/lib/sponsorshipPools";
import { getPool, requirePoolAccess } from "@/lib/sponsorshipPools.server";
import ShareButton from "@/components/ShareButton";
import PoolActions from "./PoolActions";
import ScrollToButton from "./ScrollToButton";
import PoolLocation from "./PoolLocation";
import PoolJobs from "./PoolJobs";
import PoolManage from "./PoolManage";
import PoolRespond from "./PoolRespond";

/** One sentence on what the money does, for whoever is looking at the pool. */
function planLine(pool: SponsorshipPool): string {
  if (pool.plan_kind === "vote") {
    if (pool.status === "open" || pool.status === "goal_missed") return "Once it is funded, everyone who chipped in votes on how the money is used.";
    if (pool.status === "voting") return "Contributors are voting on how the money is used.";
    return pool.payout_rule ? `Contributors chose: ${describeRule(pool.payout_rule)} once the work is verified.` : "Contributors will vote on how the money is used.";
  }
  if (pool.plan_kind === "jobs") {
    if (pool.status === "closed") return "The jobs budget is closed and unspent money was returned.";
    return "Once it is funded, the starter posts cleaning jobs paid from it and contributors approve the finished work.";
  }
  if (pool.plan_kind === "group") {
    const g = pool.handoff_group_name ?? "a group";
    if (pool.status === "active") return `${g} runs the cleanups here and is paid ${describeRule(pool.payout_rule)}.`;
    if (pool.status === "choosing") return "The group did not take it on. The starter is picking a new plan.";
    return `Once it is funded, ${g} is asked to run the cleanups${pool.handoff_date ? ` around ${new Date(pool.handoff_date + "T00:00:00").toLocaleDateString()}` : ""}.`;
  }
  if (pool.status === "choosing") return "The starter is picking a new plan.";
  return `Pays ${describeRule(pool.payout_rule)} once the work is verified.`;
}

export default async function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePoolAccess();
  const pool = await getPool(id);
  if (!pool) notFound();
  const pct = Math.round((pool.raised_cents / pool.goal_cents) * 100);
  const left = daysLeft(pool.deadline);
  return (
    <PageShell>
      <PageHeader
        eyebrow={`Started by ${pool.creator_name}`}
        title={pool.title}
        subtitle={pool.message ?? `Chip in together to fund a cleanup at ${poolPlace(pool)}.`}
      />
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div className="flex items-end gap-2">
            <p className="text-2xl font-extrabold text-zinc-100">{usd(pool.raised_cents)}</p>
            <p className="pb-0.5 text-sm text-zinc-400">of {usd(pool.goal_cents)}</p>
          </div>
          <ShareButton
            variant="icon"
            content={{
              title: pool.title,
              text: `Chip in to fund a cleanup at ${poolPlace(pool)}.`,
              url: `/fund/pools/${pool.id}`,
            }}
          />
        </div>
        <ProgressBar value={pct} label={`${pct}% of goal`} />
        {pool.status === "open" && (
          <ScrollToButton targetId="chip-in">
            {pool.my_contribution_cents ? "Add more to the pool" : "Add to the pool"}
          </ScrollToButton>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          {pool.contributor_count} {pool.contributor_count === 1 ? "person" : "people"} chipped in
          {pool.status === "open" && (
            <span>
              {left} {left === 1 ? "day" : "days"} left
            </span>
          )}
          {pool.status === "goal_missed" && <Badge variant="neutral">Goal not met, starter deciding</Badge>}
          {pool.status === "handoff" && <Badge variant="neutral">Funded, waiting on {pool.handoff_group_name ?? "a group"}</Badge>}
          {pool.status === "voting" && <Badge variant="neutral">Funded, contributors voting</Badge>}
          {pool.status === "choosing" && <Badge variant="neutral">Funded, starter choosing a plan</Badge>}
          {pool.status === "active" && (
            <Badge variant="success">
              {pool.plan_kind === "group" ? "Funded, run by a group" : pool.plan_kind === "jobs" ? "Funded, posting jobs" : "Funded, open to claim"}
            </Badge>
          )}
          {pool.status === "closed" && <Badge variant="neutral">Closed, unspent money returned</Badge>}
          {pool.status === "expired" && <Badge variant="neutral">Missed its goal, refunded</Badge>}
          {pool.status === "cancelled" && <Badge variant="neutral">Cancelled, refunded</Badge>}
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          {pool.model === "group_area" ? "Area" : "Site"}: {poolPlace(pool)}. {planLine(pool)}
        </p>
        {pool.my_contribution_cents ? (
          <p className="mt-2 text-xs font-semibold text-emerald-300">You chipped in {usd(pool.my_contribution_cents)}. Thank you.</p>
        ) : null}
      </Card>
      <PoolLocation pool={pool} />
      <PoolManage pool={pool} />
      <PoolRespond pool={pool} />
      <PoolJobs pool={pool} />
      <div id="chip-in" className="scroll-mt-20">
        <PoolActions pool={pool} loggedIn={!!user} />
      </div>
      {pool.contributors && pool.contributors.length > 0 && (
        <Section title="Who chipped in">
          <ul className="space-y-2">
            {pool.contributors.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 text-sm">
                <span className="font-semibold text-zinc-100">{c.name}</span>
                <span className="text-zinc-400">{usd(c.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <p className="mt-6 text-xs text-zinc-500">
        Money is held until the goal is met. If the pool falls short, the person who started it can go ahead with what
        was raised, extend the deadline, or cancel and refund everyone. If they do nothing for 14 days, every
        contribution is refunded in full. A hand-off to a group that is declined or ignored for 7 days goes back to the
        starter, and a contributor vote with no votes refunds everyone.
      </p>
    </PageShell>
  );
}
