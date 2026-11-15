"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";

type Status = {
  limit_cents: number;
  earned_week_cents: number;
  remaining_cents: number;
  locked: boolean;
  is_plus: boolean;
  plus_limit_cents: number;
};

const usd = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

/** Admin-only: how much of the group's weekly sponsored earning limit is used. */
export default function GroupEarningLimit({ groupId }: { groupId: string }) {
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    fetch(`/api/sponsored/groups/${groupId}/earning-limit`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setS)
      .catch(() => {});
  }, [groupId]);

  if (!s) return null;
  const pct = Math.min(100, Math.round((s.earned_week_cents / Math.max(1, s.limit_cents)) * 100));
  return (
    <div className="rounded-[20px] bg-zinc-900/60 px-5 py-4 ring-1 ring-inset ring-zinc-800">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-400/15 text-sky-300"><Gauge className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-zinc-100">Weekly sponsored earning limit</p>
          <p className="text-xs text-zinc-400">
            {usd(s.earned_week_cents)} of {usd(s.limit_cents)} over the last 7 days
            {s.is_plus ? " (Plus)" : ` (${usd(s.plus_limit_cents)} with Plus)`}
          </p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full ${s.locked ? "bg-amber-400" : "bg-sky-400"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        {s.locked
          ? "Your group is at its limit and can't host new sponsored events until earnings from the last 7 days drop back under it."
          : "A group can host one event per sponsored area per day. Going over the limit pauses new sponsored events, never payouts already earned."}
      </p>
    </div>
  );
}
