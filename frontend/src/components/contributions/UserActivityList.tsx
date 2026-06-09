"use client";

import { useState } from "react";
import Link from "next/link";

interface Contribution {
  id: string;
  campaign_id: string | null;
  value: number | null;
  contribution_type: string;
  notes: string | null;
  submitted_at: string;
}

interface Campaign {
  id: string;
  title: string;
  slug: string;
  campaign_type: string;
}

const CONTRIBUTION_ICON: Record<string, string> = {
  cleanup: "🗑️",
  photo: "📷",
  registration: "🗳️",
  advocacy: "✊",
  civic_action: "🗽",
  unfollow: "🧠",
  solarpunk_action: "🌿",
  solarpunk_photo: "📸",
};

const CONTRIBUTION_UNIT: Record<string, string> = {
  cleanup: "bags",
  photo: "photo",
  registration: "registration",
  advocacy: "action",
  civic_action: "action",
  unfollow: "unfollow",
  solarpunk_action: "pts",
  solarpunk_photo: "pts",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1H11Z" />
    </svg>
  );
}

export default function UserActivityList({
  initialContribs,
  campaigns,
  isOwn,
  userId,
}: {
  initialContribs: Contribution[];
  campaigns: Campaign[];
  isOwn: boolean;
  userId: string | null;
}) {
  const [contribs, setContribs] = useState(initialContribs);
  const [deleting, setDeleting] = useState<string | null>(null);

  const campaignsById = new Map(campaigns.map((c) => [c.id, c]));

  const handleDelete = async (id: string) => {
    if (!userId) return;
    setDeleting(id);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/${id}?user_id=${userId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      setContribs((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  if (contribs.length === 0) {
    return <div className="px-5 py-8 text-center text-zinc-600 text-sm">No contributions yet.</div>;
  }

  return (
    <ul className="divide-y divide-zinc-800/60">
      {contribs.map((c) => {
        const campaign = c.campaign_id ? campaignsById.get(c.campaign_id) : null;
        const icon = CONTRIBUTION_ICON[c.contribution_type] ?? "📌";
        const unit = CONTRIBUTION_UNIT[c.contribution_type] ?? "pts";
        return (
          <li key={c.id} className="px-5 py-3 flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs shrink-0 mt-0.5">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-zinc-300 tabular-nums">
                  {c.value ?? 1} {unit}
                </span>
                {campaign && (
                  <>
                    <span className="text-xs text-zinc-600">in</span>
                    <Link
                      href={`/campaigns/${campaign.slug}`}
                      className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {campaign.title}
                    </Link>
                  </>
                )}
              </div>
              {c.notes && (
                <p className="mt-0.5 text-xs text-zinc-600 line-clamp-1">{c.notes}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              <span className="text-xs text-zinc-600">{timeAgo(c.submitted_at)}</span>
              {isOwn && (
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={deleting === c.id}
                  className="text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-40"
                  title="Delete contribution"
                >
                  {deleting === c.id ? <span className="text-xs text-zinc-600">…</span> : <TrashIcon />}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
