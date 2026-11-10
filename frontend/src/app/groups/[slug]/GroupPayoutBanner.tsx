"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wallet, ChevronRight } from "lucide-react";

/** Admin-only nudge on the group page when the group has no payout account yet. Renders nothing once payouts are on. */
export default function GroupPayoutBanner({ groupId, slug }: { groupId: string; slug: string }) {
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch(`/api/sponsored/groups/${groupId}/payouts/status`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setNeedsSetup(Boolean(s) && !s.payouts_enabled))
      .catch(() => {});
  }, [groupId]);

  if (!needsSetup) return null;
  return (
    <Link
      href={`/groups/${slug}/edit#group-payouts`}
      className="flex items-center justify-between gap-3 rounded-[20px] bg-amber-400/10 px-5 py-4 ring-1 ring-inset ring-amber-400/50 transition-colors hover:bg-amber-400/15"
    >
      <span className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/20 text-amber-300"><Wallet className="h-5 w-5" /></span>
        <span>
          <span className="block text-sm font-bold text-amber-200">Set up group payouts</span>
          <span className="block text-xs text-zinc-300">Your group can&apos;t be paid or host sponsored events until you add a bank account. Takes a few minutes.</span>
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-amber-300" />
    </Link>
  );
}
