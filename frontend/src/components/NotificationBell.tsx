"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface EventNotification {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  started_at: string;
  campaign_id: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell() {
  const [events, setEvents] = useState<EventNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    supabase
      .from("campaign_events")
      .select("id, title, description, event_type, started_at, campaign_id")
      .gte("started_at", cutoff)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setEvents(data as EventNotification[]);
      });

    const channel = supabase
      .channel("global-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "campaign_events" },
        (payload) => {
          const ev = payload.new as EventNotification;
          setEvents((prev) => [ev, ...prev].slice(0, 20));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const unread = Math.max(0, events.length - seenCount);

  const handleOpen = () => {
    setOpen((o) => !o);
    if (!open) setSeenCount(events.length);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-300">Events</span>
            {events.length > 0 && (
              <span className="text-xs text-zinc-500">{events.length} recent</span>
            )}
          </div>
          {events.length === 0 ? (
            <div className="px-4 py-6 text-center text-zinc-600 text-sm">No recent events.</div>
          ) : (
            <ul className="divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
              {events.map((ev) => (
                <li key={ev.id} className="px-4 py-3 flex items-start gap-3">
                  <span className="text-base shrink-0 mt-0.5">⚡</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 font-medium leading-snug">{ev.title}</p>
                    {ev.description && (
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{ev.description}</p>
                    )}
                    <p className="text-xs text-zinc-600 mt-1">{timeAgo(ev.started_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
