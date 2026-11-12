import Link from "next/link";
import { Banknote, Flag, Scale, ShieldCheck, UserCheck } from "lucide-react";
import RewardsTabs from "@/components/RewardsTabs";
import FlowGuide from "@/components/walkthrough/FlowGuide";
import { PageHeader } from "@/components/ui/PageShell";
import SponsorshipsHub from "@/app/earn/SponsorshipsHub";
import { mkFetch, requireMarketplace } from "@/lib/marketplace.server";
import { createClient } from "@/lib/supabase/server";
import { getSponsorBusinesses } from "@/lib/sponsorBusinesses";
import FundMapPanel from "./FundMapPanel";
import FundingGuideCard from "@/components/marketplace/FundingGuideCard";
import { FUND_TAB_LABEL } from "@/lib/rewardsLabels";
import PoolCard from "@/components/sponsorships/PoolCard";
import { listPools } from "@/lib/sponsorshipPools.server";
import type { AdminOverview } from "@/components/marketplace/AdminPanel";

/** Fund tab: pay a neighbor to clean (post a job) or sponsor a cleanup. Taking jobs lives on the Earn tab. */
export default async function MarketplacePage() {
  const { user, isAdmin } = await requireMarketplace();
  const supabase = await createClient();
  const [overview, businesses, pools, minCents] = await Promise.all([
    isAdmin ? mkFetch<AdminOverview>(user.id, isAdmin, "/admin/overview").catch(() => null) : Promise.resolve(null),
    getSponsorBusinesses(supabase, user.id),
    listPools().then((r) => r?.open ?? []).catch(() => []),
    mkFetch<{ min_price_cents: number }>(user.id, isAdmin, "/pricing").then((p) => p.min_price_cents).catch(() => 1500),
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
        titleAction={<FlowGuide id="marketplace" variant="link" label="How does this work?" />}
      />
      <RewardsTabs current="hire" />
      <FundMapPanel
        sponsor={
          <div className="mb-6">
            <h2 id="sponsor" className="mb-1 scroll-mt-4 text-sm font-bold text-zinc-100">Sponsor a cleanup</h2>
            <p className="mb-2 text-sm text-zinc-400">Put money behind cleanups at a place. It is only paid out after the work is verified. Choose how it is set up:</p>
            <ul className="mb-4 space-y-1 text-sm text-zinc-400">
              <li><span className="font-semibold text-zinc-200">Cleanup site:</span> one spot, shown as a pin. Any neighbor can claim it and get paid.</li>
              <li><span className="font-semibold text-zinc-200">Group area:</span> a whole region, shown as a shaded area. Groups host cleanup events there and get paid.</li>
            </ul>
            <SponsorshipsHub businesses={businesses} currentUserId={user.id} isAdmin={isAdmin} open="fund" minCents={minCents} />
          </div>
        }
        extras={
          <>
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
