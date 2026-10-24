import RewardsTabs from "@/components/RewardsTabs";
import JobsList from "@/components/marketplace/JobsList";
import { PageHeader } from "@/components/ui/PageShell";
import type { Job } from "@/lib/marketplace";
import { mkFetch, requireMarketplace } from "@/lib/marketplace.server";

export default async function MyJobsPage() {
  const { user, isAdmin } = await requireMarketplace();
  const [asCustomer, asCleaner] = await Promise.all([
    mkFetch<Job[]>(user.id, isAdmin, "/jobs?role=customer").catch(() => []),
    mkFetch<Job[]>(user.id, isAdmin, "/jobs?role=cleaner").catch(() => []),
  ]);
  return (
    <>
      <PageHeader eyebrow="Marketplace" title="My bookings" />
      <RewardsTabs current="hire" />
      <JobsList asCustomer={asCustomer} asCleaner={asCleaner} />
    </>
  );
}
