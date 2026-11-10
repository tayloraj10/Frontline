import RewardsTabs from "@/components/RewardsTabs";
import JobsList from "@/components/marketplace/JobsList";
import { PageHeader } from "@/components/ui/PageShell";
import type { Job, MoneySummary } from "@/lib/marketplace";
import { mkFetch, requireMarketplace } from "@/lib/marketplace.server";

export default async function MyJobsPage() {
  const { user, isAdmin } = await requireMarketplace();
  const zero: MoneySummary = { paid_cents: 0, paid_jobs: 0, pending_cents: 0, pending_jobs: 0 };
  const [asCustomer, asCleaner, spent, earned] = await Promise.all([
    mkFetch<Job[]>(user.id, isAdmin, "/jobs?role=customer").catch(() => []),
    mkFetch<Job[]>(user.id, isAdmin, "/jobs?role=cleaner").catch(() => []),
    mkFetch<MoneySummary>(user.id, isAdmin, "/jobs/summary?role=customer").catch(() => zero),
    mkFetch<MoneySummary>(user.id, isAdmin, "/jobs/summary?role=cleaner").catch(() => zero),
  ]);
  return (
    <>
      <PageHeader eyebrow="Marketplace" title="My bookings" />
      <RewardsTabs current="hire" />
      <JobsList asCustomer={asCustomer} asCleaner={asCleaner} spent={spent} earned={earned} />
    </>
  );
}
