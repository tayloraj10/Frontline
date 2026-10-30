import { notFound } from "next/navigation";
import JobDetail from "@/components/marketplace/JobDetail";
import { payoutsBlocked, type Job, type MeStatus } from "@/lib/marketplace";
import { MarketplaceApiError, mkFetch, requireMarketplace } from "@/lib/marketplace.server";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, isAdmin } = await requireMarketplace();
  let job: Job;
  try {
    job = await mkFetch<Job>(user.id, isAdmin, `/jobs/${id}`);
  } catch (e) {
    if (e instanceof MarketplaceApiError && e.status === 404) notFound();
    throw e;
  }
  const me = await mkFetch<MeStatus>(user.id, isAdmin, "/me").catch(() => null);
  return <JobDetail initial={job} userId={user.id} payoutsBlocked={payoutsBlocked(me)} />;
}
