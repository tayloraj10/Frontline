"use client";

import { useState } from "react";
import Link from "next/link";

interface FeedContrib {
  id: string;
  user_id: string | null;
  group_id: string | null;
  value: number | null;
  contribution_type: string;
  notes: string | null;
  submitted_at: string;
}

interface FeedProfile {
  id: string;
  username: string | null;
  display_name: string | null;
}

interface FeedGroup {
  id: string;
  name: string;
  slug: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1H11Z" />
    </svg>
  );
}

export default function FeedActivityList({
  initialContribs,
  profiles,
  groups,
  unit,
  currentUserId,
}: {
  initialContribs: FeedContrib[];
  profiles: FeedProfile[];
  groups: FeedGroup[];
  unit: string;
  currentUserId: string | null;
}) {
  const [contribs, setContribs] = useState(initialContribs);
  const [deleting, setDeleting] = useState<string | null>(null);

  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  const handleDelete = async (id: string) => {
    if (!currentUserId) return;
    setDeleting(id);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/${id}?user_id=${currentUserId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      setContribs((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  if (contribs.length === 0) {
    return <div className="px-5 py-10 text-center text-zinc-600 text-sm">No activity yet.</div>;
  }

  return (
    <ul className="divide-y divide-zinc-800/50">
      {contribs.map((c) => {
        const profile = c.user_id ? profilesById.get(c.user_id) : null;
        const group = c.group_id ? groupsById.get(c.group_id) : null;
        const actorName = profile?.display_name ?? profile?.username ?? "Unknown";
        const isOwn = !!currentUserId && c.user_id === currentUserId;
        return (
          <li key={c.id} className="px-5 py-3 flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0 mt-0.5">
              {actorName[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <Link
                  href={`/users/${profile?.username ?? ""}`}
                  className="text-sm font-semibold text-zinc-200 hover:text-zinc-100 transition-colors"
                >
                  {actorName}
                </Link>
                {group && (
                  <>
                    <span className="text-xs text-zinc-600">via</span>
                    <Link
                      href={`/groups/${group.slug}`}
                      className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      {group.name}
                    </Link>
                  </>
                )}
                <span className="text-xs text-zinc-500">logged</span>
                <span className="text-xs font-semibold text-zinc-300 tabular-nums">
                  {c.value ?? 1} {unit}
                </span>
              </div>
              {c.notes && (
                <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">{c.notes}</p>
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
