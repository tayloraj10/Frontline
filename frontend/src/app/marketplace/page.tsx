import Link from "next/link";
import { Banknote, Flag, Scale, ShieldCheck, UserCheck } from "lucide-react";
import RewardsTabs from "@/components/RewardsTabs";
import FlowGuide from "@/components/walkthrough/FlowGuide";
import { PageHeader } from "@/components/ui/PageShell";
import MarketplaceHome from "@/components/marketplace/MarketplaceHome";
import { mkFetch, requireMarketplace } from "@/lib/marketplace.server";
import type { AdminOverview } from "@/components/marketplace/AdminPanel";
import { payoutsBlocked, type Job, type MeStatus } from "@/lib/marketplace";

export default async function MarketplacePage() {
  const { user, isAdmin } = await requireMarketplace();
  const [board, me, overview] = await Promise.all([
    mkFetch<Job[]>(user.id, isAdmin, "/board").catch(() => []),
    mkFetch<MeStatus>(user.id, isAdmin, "/me").catch(() => null),
    isAdmin ? mkFetch<AdminOverview>(user.id, isAdmin, "/admin/overview").catch(() => null) : Promise.resolve(null),
  ]);
  const queue = overview
    ? [
        { label: "Cleaners to approve", n: overview.pending_cleaners.length, Icon: UserCheck },
        { label: "Open reports", n: overview.open_reports.length, Icon: Flag },
        { label: "Disputes", n: overview.disputed_jobs.length, Icon: Scale },
        { label: "Jobs holding funds", n: overview.held_jobs, Icon: Banknote },
      ]
    : [];
  return (
    <>
      <PageHeader
        eyebrow="Rewards"
        title="Hire a neighbor"
        titleAction={<FlowGuide id="marketplace" variant="link" label="How does hiring work?" />}
      />
      <RewardsTabs current="hire" />
      <MarketplaceHome board={board} profileStatus={me?.cleaner_profile?.status ?? null}
        payoutsBlocked={payoutsBlocked(me)}
      />
      {isAdmin && (
        <Link
          href="/marketplace/admin"
          className="mt-6 flex w-full flex-col items-center justify-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 text-white shadow-elevation-1 touch-manipulation transition-transform active:scale-[0.98]"
        >
          <span className="flex min-h-8 items-center gap-2 text-base font-extrabold">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            Marketplace moderation
          </span>
          {queue.length > 0 && (
            <span className="flex flex-wrap justify-center gap-2">
              {queue.map(({ label, n, Icon }) => (
                <span
                  key={label}
                  title={label}
                  aria-label={`${label}: ${n}`}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-bold ${n > 0 && label !== "Jobs holding funds" ? "bg-white text-violet-700" : "bg-violet-600/80 text-violet-100"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {n}
                </span>
              ))}
            </span>
          )}
        </Link>
      )}
    </>
  );
}
