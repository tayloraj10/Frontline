"use client";

import { forwardRef } from "react";
import { formatPoints } from "@/lib/formatPoints";

interface ShareCardProps {
  groupName: string;
  groupLogoUrl?: string | null;
  campaignName: string;
  intervalLabel: string;
  totalValue: number;
  contributionCount: number;
  uniqueContributors: number;
  smallBags: number;
  largeBags: number;
  pounds: number;
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-black/20 py-2.5 text-center">
      <div className="text-xl font-black tabular-nums text-white">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}

function BagCell({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-black/20 py-2.5 text-center">
      <div className="flex items-center gap-1">
        <span className="text-base leading-none" aria-hidden>
          {icon}
        </span>
        <span className="text-xl font-black tabular-nums text-white">{value.toLocaleString()}</span>
      </div>
      <div className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}

const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  {
    groupName,
    groupLogoUrl,
    campaignName,
    intervalLabel,
    totalValue,
    contributionCount,
    uniqueContributors,
    smallBags,
    largeBags,
    pounds,
  },
  ref
) {
  return (
    <div
      ref={ref}
      className="relative flex h-[360px] w-[360px] flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-800 via-black to-emerald-800 p-7"
    >

      <div className="relative flex items-center gap-3">
        {groupLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={groupLogoUrl}
            alt=""
            crossOrigin="anonymous"
            className="h-10 w-10 shrink-0 rounded-full border border-white/10 object-cover"
          />
        )}
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">{intervalLabel}</div>
          <div className="mt-0.5 truncate text-xl font-black leading-tight text-white">{groupName}</div>
          <div className="truncate text-xs text-zinc-400">{campaignName}</div>
        </div>
      </div>

      <div className="relative grid grid-cols-3 gap-2">
        {totalValue > 0 && <StatCell value={formatPoints(totalValue)} label="points" />}
        {contributionCount > 0 && <StatCell value={contributionCount.toLocaleString()} label="logs" />}
        {uniqueContributors > 0 && (
          <StatCell value={uniqueContributors.toLocaleString()} label="contributors" />
        )}
        {smallBags > 0 && <BagCell icon="🛍️" value={smallBags} label="small bags" />}
        {largeBags > 0 && <BagCell icon="🗑️" value={largeBags} label="large bags" />}
        {pounds > 0 && <BagCell icon="⚖️" value={Math.round(pounds)} label="pounds" />}
      </div>

      <div className="relative flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Frontline</span>
      </div>
    </div>
  );
});

export default ShareCard;
