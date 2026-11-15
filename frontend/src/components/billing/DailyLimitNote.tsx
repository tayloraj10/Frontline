"use client";

import { useCallback, useEffect, useState } from "react";
import { SPONSORED_CHANGED_EVENT } from "@/components/map/useSponsoredMapLayer";

export interface DailyLimit {
  limit_cents: number;
  earned_week_cents: number;
  remaining_cents: number;
  locked: boolean;
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

/**
 * The viewer's weekly earning ceiling: everything earned through the app in the last 7 days.
 * `warnOnly` renders nothing until they are close (80%) or locked, for screens where the full bar
 * would be noise. Louder on purpose when locked: they cannot take new jobs or claim sites.
 */
export default function DailyLimitNote({ className = "", warnOnly = false }: { className?: string; warnOnly?: boolean }) {
  const limit = useDailyLimit();
  if (!limit) return null;
  const pct = limit.limit_cents > 0 ? (limit.earned_week_cents / limit.limit_cents) * 100 : 0;
  // TEMPORARY: always show so the warning styles can be reviewed. Remove FORCE_SHOW to restore warn-only.
  const FORCE_SHOW = false;
  if (!FORCE_SHOW && warnOnly && !limit.locked && pct < 80) return null;
  const used = Math.min(100, pct);
  const near = !limit.locked && pct >= 80;
  const tone = limit.locked ? "border-amber-500/60 bg-amber-950/30" : near ? "border-amber-700/50 bg-zinc-900/60" : "border-zinc-800 bg-zinc-900/60";
  return (
    <div className={`rounded-2xl border p-3 ${tone} ${className}`}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-zinc-200">Your weekly earnings</span>
        <span className={limit.locked || near ? "text-amber-300" : "text-zinc-300"}>
          {usd(limit.earned_week_cents)} of {usd(limit.limit_cents)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${limit.locked || near ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${used}%` }} />
      </div>
      {limit.locked ? (
        <p className="mt-1.5 text-sm font-semibold text-amber-300">
          You have reached the weekly limit, so you can't take new jobs or claim sites for now. Work you already have and payouts
          waiting for review are not affected. You can start again once your last 7 days drop back under {usd(limit.limit_cents)}.
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-zinc-500">
          {near ? `Only ${usd(limit.remaining_cents)} left this week. ` : ""}This counts jobs and sponsored sites you earn yourself over
          the last 7 days. Once you reach it you are paused from new work, but nothing is held back.
          {!limit.is_plus && limit.plus_limit_cents > limit.limit_cents && ` Frontline Plus raises it to ${usd(limit.plus_limit_cents)}.`}
        </p>
      )}
    </div>
  );
}
