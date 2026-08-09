"use client";

import { useState } from "react";
import Link from "next/link";
import { CAMPAIGN_TYPE_CONFIG, CONTRIBUTION_LABELS } from "@/config/campaigns";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

export default function OtherCampaignRow({ campaign }: { campaign: Campaign }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = CAMPAIGN_TYPE_CONFIG[campaign.campaign_type] ?? {
    icon: "🏁",
    label: campaign.campaign_type,
    color: "text-zinc-500",
    bg: "bg-zinc-800/20",
    border: "border-zinc-700/50",
  };

  return (
    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/40 shadow-elevation-1 transition-colors hover:border-zinc-700">
      <div className="flex items-center gap-1">
        <Link
          href={`/campaigns/${campaign.slug}`}
          className="group flex min-w-0 flex-1 items-center gap-3 px-4 py-3 active:bg-zinc-800/40 transition-colors duration-150 touch-manipulation"
        >
          <span className={`text-sm ${cfg.color}`}>{cfg.icon}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-400 group-hover:text-zinc-200">
            {campaign.title}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide details" : "Show details"}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200 active:bg-zinc-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="none"
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800/50 px-4 py-3">
          {campaign.description && (
            <p className="text-sm leading-relaxed text-zinc-500">{campaign.description}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.border} ${cfg.color}`}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
            </span>
            {campaign.contribution_type && (
              <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.border} ${cfg.color}`}>
                {CONTRIBUTION_LABELS[campaign.contribution_type] ?? campaign.contribution_type}
              </span>
            )}
          </div>
          <Link
            href={`/campaigns/${campaign.slug}`}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 active:text-emerald-300 transition-colors duration-150"
          >
            View campaign →
          </Link>
        </div>
      )}
    </div>
  );
}
