import { notFound } from "next/navigation";
import { PageShell, PageHeader, Section } from "@/components/ui/PageShell";
import ProgressBar from "@/components/ui/ProgressBar";
import Badge from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { daysLeft, describeRule, usd } from "@/lib/sponsorshipPools";
import { getPool, requirePoolAccess } from "@/lib/sponsorshipPools.server";
import PoolActions from "./PoolActions";

export default async function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePoolAccess();
  const pool = await getPool(id);
  if (!pool) notFound();
  const pct = Math.round((pool.raised_cents / pool.goal_cents) * 100);
  const left = daysLeft(pool.deadline);
  return (
    <PageShell>
      <PageHeader
        eyebrow={`Started by ${pool.creator_name}`}
        title={pool.title}
        subtitle={pool.message ?? `Chip in together to fund a cleanup at ${pool.site_label}.`}
      />
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-end justify-between">
          <p className="text-2xl font-extrabold text-zinc-100">{usd(pool.raised_cents)}</p>
          <p className="text-sm text-zinc-400">of {usd(pool.goal_cents)}</p>
        </div>
        <ProgressBar value={pct} label={`${pct}% of goal`} />
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          {pool.contributor_count} {pool.contributor_count === 1 ? "person" : "people"} chipped in
          {pool.status === "open" && (
            <span>
              {left} {left === 1 ? "day" : "days"} left
            </span>
          )}
          {pool.status === "active" && <Badge variant="success">Funded, open to claim</Badge>}
          {pool.status === "expired" && <Badge variant="neutral">Missed its goal, refunded</Badge>}
          {pool.status === "cancelled" && <Badge variant="neutral">Cancelled, refunded</Badge>}
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          Site: {pool.site_label}. Pays {describeRule(pool.payout_rule)} once the work is verified.
        </p>
      </Card>
      <PoolActions pool={pool} />
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
        Money is held until the goal is met. If the pool does not reach its goal by the deadline, or the person who
        started it cancels, every contribution is refunded in full.
      </p>
    </PageShell>
  );
}
