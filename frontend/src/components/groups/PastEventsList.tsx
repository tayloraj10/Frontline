"use client";

import { useState } from "react";
import Link from "next/link";
import type { GroupCleanupEventListItem } from "@/lib/cleanupEvents";

const PAGE_SIZE = 5;

function formatEventDate(start: string | null) {
  return start
    ? new Date(start).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Date TBD";
}

export default function PastEventsList({ events }: { events: GroupCleanupEventListItem[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleEvents = events.slice(0, visibleCount);
  const remaining = events.length - visibleEvents.length;

  return (
    <>
      <ul className="divide-y divide-zinc-800/60">
        {visibleEvents.map((e) => (
          <li key={e.id}>
            <Link
              href={`/cleanup-events/${e.id}`}
              className="px-5 py-3 flex items-center justify-between gap-3 transition-[background-color] duration-150 hover:bg-zinc-900/40 active:bg-zinc-900/60 touch-manipulation"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center opacity-70">
                  {e.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.image_url} alt={e.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg">🧹</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-300 break-words">{e.title}</p>
                  <p className="text-xs text-zinc-500">
                    {formatEventDate(e.scheduled_start)} · {e.going_count} RSVP&apos;d
                  </p>
                </div>
              </div>
              {e.status === "cancelled" ? (
                <span className="text-xs text-red-400 border border-red-800/60 rounded px-1.5 py-0.5 shrink-0">
                  Cancelled
                </span>
              ) : e.is_ongoing ? (
                <span className="text-xs text-emerald-400 border border-emerald-700/60 rounded px-1.5 py-0.5 shrink-0">
                  Ongoing
                </span>
              ) : (
                <span className="text-xs text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5 shrink-0">
                  Over
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <div className="px-5 py-3 border-t border-zinc-800/60">
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="w-full text-center text-xs font-medium text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150 touch-manipulation"
          >
            Show {Math.min(remaining, PAGE_SIZE)} more
          </button>
        </div>
      )}
    </>
  );
}
