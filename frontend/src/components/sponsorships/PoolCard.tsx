import Link from "next/link";
import Badge from "@/components/ui/Badge";
import ProgressBar from "@/components/ui/ProgressBar";
import { daysLeft, describeRule, usd, type SponsorshipPool } from "@/lib/sponsorshipPools";

const STATUS_LABEL: Record<SponsorshipPool["status"], string> = {
  open: "Open",
  active: "Funded",
  expired: "Refunded",
  cancelled: "Cancelled",
};

/** Compact pool summary used in lists; the whole card is one tap target. */
export default function PoolCard({ pool }: { pool: SponsorshipPool }) {
  const pct = Math.round((pool.raised_cents / pool.goal_cents) * 100);
  const left = daysLeft(pool.deadline);
  return (
    <Link
      href={`/fund/pools/${pool.id}`}
      className="block rounded-2xl border border-zinc-800 bg-zinc-900 p-4 touch-manipulation transition-transform active:scale-[0.98]"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-zinc-100">{pool.title}</h3>
        <Badge variant={pool.status === "open" || pool.status === "active" ? "success" : "neutral"}>
          {STATUS_LABEL[pool.status]}
        </Badge>
      </div>
      <p className="mb-3 text-xs text-zinc-400">
        {pool.site_label}, {describeRule(pool.payout_rule)}
      </p>
      <ProgressBar value={pct} label={`${pct}% of goal`} />
      <p className="mt-2 text-xs text-zinc-400">
        <span className="font-bold text-zinc-100">{usd(pool.raised_cents)}</span> of {usd(pool.goal_cents)} from{" "}
        {pool.contributor_count} {pool.contributor_count === 1 ? "person" : "people"}
        {pool.status === "open" && `, ${left} ${left === 1 ? "day" : "days"} left`}
      </p>
    </Link>
  );
}
