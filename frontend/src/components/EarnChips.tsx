"use client";

import { usePointRates, fmt } from "@/lib/pointRates";

export default function EarnChips() {
  const rates = usePointRates();
  const earn = [
    { v: rates.small, l: "Small bag" },
    { v: rates.large, l: "Large bag" },
    { v: rates.report, l: "Trash report" },
  ];
  return (
    <div className="flex gap-2">
      {earn.map((e) => (
        <div key={e.l} className="rounded-2xl bg-zinc-950/50 px-3.5 py-2.5">
          <div className="font-display text-lg font-extrabold leading-none text-amber-400 tabular-nums">+{fmt(e.v)}</div>
          <div className="mt-1 text-[11px] font-medium text-zinc-500">{e.l}</div>
        </div>
      ))}
    </div>
  );
}
