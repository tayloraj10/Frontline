"use client";

import { forwardRef } from "react";
import { formatPoints } from "@/lib/formatPoints";
import { cardBackgroundCss, type CardBgStyle } from "@/lib/cardBackground";

interface TeamEventShareCardProps {
  eventTitle: string;
  eventLogoUrl?: string | null;
  teamName: string;
  teamLogoUrl?: string | null;
  teamColor: string;
  intervalLabel: string;
  totalValue: number;
  submissionCount: number;
  bgStyle: CardBgStyle;
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-black/35 py-2.5 text-center">
      <div className="text-xl font-black tabular-nums text-white">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-zinc-300">{label}</div>
    </div>
  );
}

const ShareCard = forwardRef<HTMLDivElement, TeamEventShareCardProps>(function TeamEventShareCard(
  { eventTitle, eventLogoUrl, teamName, teamLogoUrl, teamColor, intervalLabel, totalValue, submissionCount, bgStyle },
  ref
) {
  return (
    <div
      ref={ref}
      className="relative flex h-[360px] w-[360px] flex-col justify-between overflow-hidden rounded-2xl p-7"
      style={{ background: cardBackgroundCss(teamColor, bgStyle) }}
    >
      <div className="relative flex items-center gap-2">
        {eventLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={eventLogoUrl}
            alt=""
            crossOrigin="anonymous"
            className="h-10 w-10 shrink-0 rounded-full border border-white/10 object-cover"
          />
        )}
        {teamLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={teamLogoUrl}
            alt=""
            crossOrigin="anonymous"
            className="h-10 w-10 shrink-0 rounded-full border border-white/10 object-cover"
          />
        )}
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-white">
            {intervalLabel}
          </div>
          <div className="mt-0.5 truncate text-xl font-black leading-tight text-white">{teamName}</div>
          <div className="truncate text-xs text-zinc-300">{eventTitle}</div>
        </div>
      </div>

      <div className="relative grid grid-cols-2 gap-2">
        <StatCell value={formatPoints(totalValue)} label="points" />
        <StatCell value={submissionCount.toLocaleString()} label="submissions" />
      </div>

      <div className="relative flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
          Frontline
        </span>
      </div>
    </div>
  );
});

export default ShareCard;
