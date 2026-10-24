import { notFound } from "next/navigation";
import JobDetail from "@/components/marketplace/JobDetail";
import type { Job } from "@/lib/marketplace";
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
  return <JobDetail initial={job} userId={user.id} />;
}
