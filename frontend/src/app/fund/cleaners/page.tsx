import RewardsTabs from "@/components/RewardsTabs";
import { PageHeader } from "@/components/ui/PageShell";
import BrowseCleaners from "@/components/marketplace/BrowseCleaners";
import { mkFetch, requireMarketplace } from "@/lib/marketplace.server";
import type { CleanerCard } from "@/lib/marketplace";

export default async function BrowseCleanersPage() {
  const { user, isAdmin } = await requireMarketplace();
  let loadFailed = false;
  const cleaners = await mkFetch<CleanerCard[]>(user.id, isAdmin, "/cleaners").catch(() => {
    loadFailed = true;
    return [] as CleanerCard[];
  });
  return (
    <>
      <PageHeader eyebrow="Rewards" title="Browse cleaners" />
      <RewardsTabs current="hire" />
      <BrowseCleaners cleaners={cleaners} loadFailed={loadFailed} />
    </>
  );
}
