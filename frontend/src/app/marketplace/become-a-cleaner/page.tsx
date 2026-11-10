import RewardsTabs from "@/components/RewardsTabs";
import CleanerOnboarding from "@/components/marketplace/CleanerOnboarding";
import { PageHeader } from "@/components/ui/PageShell";
import type { MeStatus } from "@/lib/marketplace";
import { mkFetch, requireMarketplace } from "@/lib/marketplace.server";

export default async function BecomeCleanerPage() {
  const { user, isAdmin } = await requireMarketplace();
  const me = await mkFetch<MeStatus>(user.id, isAdmin, "/me");
  return (
    <>
      <PageHeader
        eyebrow="Cleaners"
        title={me.cleaner_profile ? "Your cleaner profile" : "Become a cleaner"}
        subtitle="Get paid to clean up your neighborhood. Customers hire you directly or you answer open jobs."
      />
      <RewardsTabs current="hire" />
      <CleanerOnboarding initial={me} />
    </>
  );
}
