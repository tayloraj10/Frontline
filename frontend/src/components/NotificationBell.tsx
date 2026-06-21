"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type UserNotification = Database["public"]["Tables"]["user_notifications"]["Row"];

const DB_SCHEMA = process.env.NEXT_PUBLIC_DB_SCHEMA || "public";

const TYPE_ICON: Record<string, string> = {
  event: "⚡",
  tract_claimed: "⚑",
  milestone: "🏆",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("user_notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setNotifications(data as UserNotification[]);
      });

    const channel = supabase
      .channel(`user-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: DB_SCHEMA,
          table: "user_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as UserNotification, ...prev].slice(0, 20));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

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

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpen = async () => {
    const wasOpen = open;
    setOpen((o) => !o);

    if (!wasOpen && unreadCount > 0) {
      // Optimistically mark all as read in local state
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

      const supabase = createClient();
      await supabase
        .from("user_notifications")
        .update({ read: true })
        .eq("user_id", userId)
        .eq("read", false);
    }
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
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-300">Notifications</span>
            {notifications.length > 0 && (
              <span className="text-xs text-zinc-500">{notifications.length} recent</span>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-zinc-600 text-sm">No notifications yet.</div>
          ) : (
            <ul className="divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
              {notifications.map((n) => {
                const inner = (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="text-base shrink-0 mt-0.5">{TYPE_ICON[n.type] ?? "🔔"}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${n.read ? "text-zinc-400" : "text-zinc-200 font-medium"}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-xs text-zinc-600 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-2" />
                    )}
                  </div>
                );

                return (
                  <li key={n.id} className="hover:bg-zinc-800/40 transition-colors">
                    {n.campaign_slug ? (
                      <Link href={`/campaigns/${n.campaign_slug}`} onClick={() => setOpen(false)}>
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
