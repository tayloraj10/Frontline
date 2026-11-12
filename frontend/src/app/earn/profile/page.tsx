import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
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
      <RewardsTabs current="paid" />
      {me.cleaner_profile && (
        <Link
          href="/fund/jobs"
          className="mb-4 flex min-h-11 items-center justify-between gap-2 rounded-2xl bg-zinc-900 px-4 text-sm font-bold text-sky-300 ring-1 ring-inset ring-zinc-800 touch-manipulation active:scale-[0.98]"
        >
          <span className="inline-flex items-center gap-2">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            My jobs
          </span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      <CleanerOnboarding initial={me} />
    </>
  );
}
