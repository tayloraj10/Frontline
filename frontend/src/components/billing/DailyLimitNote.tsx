"use client";

import { useCallback, useEffect, useState } from "react";
import { SPONSORED_CHANGED_EVENT } from "@/components/map/useSponsoredMapLayer";

export interface DailyLimit {
  limit_cents: number;
  earned_today_cents: number;
  remaining_cents: number;
  is_plus: boolean;
  plus_limit_cents: number;
}

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/**
 * The viewer's sponsored payout allowance for today. A 401/403/404 (payments not visible to this
 * viewer) leaves it null so nothing renders. Refetches whenever a claim or photo changes things.
 */
export function useDailyLimit(): DailyLimit | null {
  const [limit, setLimit] = useState<DailyLimit | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sponsored/my-limits", { cache: "no-store" });
      if (!res.ok) return setLimit(null);
      setLimit((await res.json()) as DailyLimit);
    } catch {
      setLimit(null);
    }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(SPONSORED_CHANGED_EVENT, load);
    return () => window.removeEventListener(SPONSORED_CHANGED_EVENT, load);
  }, [load]);
  return limit;
}

/** One line: how much of today's payout limit is left, plus the Plus upgrade when it would help. */
export default function DailyLimitNote({ className = "" }: { className?: string }) {
  const limit = useDailyLimit();
  if (!limit) return null;
  const used = Math.min(100, limit.limit_cents > 0 ? (limit.earned_today_cents / limit.limit_cents) * 100 : 0);
  const out = limit.remaining_cents <= 0;
  return (
    <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-zinc-200">Your payout limit today</span>
        <span className={out ? "text-amber-300" : "text-zinc-300"}>
          {out ? "Reached" : `${usd(limit.remaining_cents)} left`} of {usd(limit.limit_cents)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${out ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${used}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">
        This is the most you can earn from sponsored cleanups today. It counts every sponsorship together and resets each day.
        {!limit.is_plus && limit.plus_limit_cents > limit.limit_cents && ` Frontline Plus raises it to ${usd(limit.plus_limit_cents)}.`}
      </p>
    </div>
  );
}
