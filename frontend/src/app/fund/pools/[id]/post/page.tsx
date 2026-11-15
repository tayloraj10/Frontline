import { notFound, redirect } from "next/navigation";
import JobForm from "@/components/marketplace/JobForm";
import { PageHeader, PageShell } from "@/components/ui/PageShell";
import type { MeStatus } from "@/lib/marketplace";
import { mkFetch, requireMarketplace } from "@/lib/marketplace.server";
import { getPool } from "@/lib/sponsorshipPools.server";
import { usd } from "@/lib/sponsorshipPools";

export default async function PoolPostJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, isAdmin } = await requireMarketplace();
  const pool = await getPool(id);
  if (!pool) notFound();
  if (!pool.is_creator) redirect(`/fund/pools/${id}`);
  if (pool.plan_kind !== "jobs" || pool.status !== "active" || pool.jobs_frozen) redirect(`/fund/pools/${id}`);
  const me = await mkFetch<MeStatus>(user.id, isAdmin, "/me");
  const pricing = await mkFetch<{ fee_percent: number; min_price_cents: number }>(user.id, isAdmin, "/pricing");

  return (
    <PageShell>
      <PageHeader
        eyebrow={pool.title}
        title="Post a pool job"
        subtitle={`${usd(pool.balance_cents ?? 0)} left to spend. The job has to be inside the pool's cleanup ${
          pool.model === "group_area" ? "area" : "site"
        }. People who chipped in approve the finished work.`}
      />
      <JobForm
        services={me.job_types}
        termsAccepted={me.customer_terms_accepted}
        flexibleMaxDays={14}
        feePercent={0}
        minPriceCents={pricing.min_price_cents}
        poolId={id}
        poolBalanceCents={pool.balance_cents ?? 0}
      />
    </PageShell>
  );
}
