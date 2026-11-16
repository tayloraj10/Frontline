import Link from "next/link";
import { Banknote, Flag, Scale, ShieldCheck, UserCheck } from "lucide-react";
import RewardsTabs from "@/components/RewardsTabs";
import FundingGuideCard from "@/components/marketplace/FundingGuideCard";
import PosterJobsCard from "@/components/marketplace/PosterJobsCard";
import type { Job, MoneySummary } from "@/lib/marketplace";
import FlowGuide from "@/components/walkthrough/FlowGuide";
import { PageHeader } from "@/components/ui/PageShell";
import { mkFetch, viewMarketplace } from "@/lib/marketplace.server";
import FundMapPanel from "./FundMapPanel";
import { FUND_TAB_LABEL } from "@/lib/rewardsLabels";
import PoolCard from "@/components/sponsorships/PoolCard";
import { listPools } from "@/lib/sponsorshipPools.server";
import type { AdminOverview } from "@/components/marketplace/AdminPanel";

/** Fund tab: pay a neighbor to clean (post a job) or sponsor a cleanup. Taking jobs lives on the Earn tab. */
export default async function MarketplacePage() {
  const { user, isAdmin } = await viewMarketplace();
  const zero: MoneySummary = { paid_cents: 0, paid_jobs: 0, pending_cents: 0, pending_jobs: 0 };
  const [posted, spent] = user
    ? await Promise.all([
        mkFetch<Job[]>(user.id, isAdmin, "/jobs?role=customer").catch(() => [] as Job[]),
        mkFetch<MoneySummary>(user.id, isAdmin, "/jobs/summary?role=customer").catch(() => zero),
      ])
    : [[] as Job[], zero];
  const [overview, pools] = await Promise.all([
    isAdmin && user ? mkFetch<AdminOverview>(user.id, isAdmin, "/admin/overview").catch(() => null) : Promise.resolve(null),
    listPools().then((r) => r?.open ?? []).catch(() => []),
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
        compact
        eyebrow="Rewards"
        title={FUND_TAB_LABEL}
        subtitle="Hire a neighbor, sponsor a place, or crowdfund a big cleanup."
        titleAction={<FlowGuide id="marketplace" variant="link" label="How does funding work?" />}
      />
      <RewardsTabs current="hire" />
      <FundMapPanel
        extras={
          <>
            <PosterJobsCard jobs={posted} spent={spent} />
            <FundingGuideCard />
            {isAdmin && (
              <Link
                href="/fund/admin"
                className="mb-4 flex w-full flex-col items-center justify-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 text-white shadow-elevation-1 touch-manipulation transition-transform active:scale-[0.98]"
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
            {pools.length > 0 && (
              <div className="mb-6">
                <h2 className="mb-1 text-sm font-bold text-zinc-100">Community crowdfunds</h2>
                <p className="mb-2 text-xs text-zinc-400">Bigger projects neighbors are pooling money for. Chip in to help reach the goal.</p>
                <div className="space-y-2">
                  {pools.map((p) => (
                    <PoolCard key={p.id} pool={p} />
                  ))}
                </div>
              </div>
            )}
          </>
        }
      />
    </>
  );
}
