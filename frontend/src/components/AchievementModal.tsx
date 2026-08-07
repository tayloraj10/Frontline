"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type UserNotification = Database["public"]["Tables"]["user_notifications"]["Row"];

const ACHIEVEMENT_TYPES = ["milestone", "offer_eligible"];

export default function AchievementModal({ userId }: { userId: string }) {
  const [queue, setQueue] = useState<UserNotification[]>([]);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("user_notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("read", false)
      .in("type", ACHIEVEMENT_TYPES)
      .order("created_at", { ascending: true })
      .limit(5)
      .then(({ data }) => {
        if (data && data.length > 0) setQueue(data as UserNotification[]);
      });

    const channel = supabase
      .channel(`user-achievements-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as UserNotification;
          if (ACHIEVEMENT_TYPES.includes(row.type)) {
            setQueue((prev) => [...prev, row]);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  if (queue.length === 0) return null;

  const current = queue[0];

  const dismiss = async () => {
    const supabase = createClient();
    await supabase.from("user_notifications").update({ read: true }).eq("id", current.id);
    setQueue((prev) => prev.slice(1));
  };

  const viewOffer = async () => {
    await dismiss();
    router.push("/partners");
  };

  const isOffer = current.type === "offer_eligible";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border border-amber-500/30 bg-zinc-900 shadow-2xl overflow-hidden text-center">
        <div className="px-6 py-8">
          <div className="text-5xl mb-4">{isOffer ? "🎁" : "🏆"}</div>
          <h2 className="text-lg font-black text-zinc-100 leading-snug">{current.title}</h2>
          {current.body && (
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{current.body}</p>
          )}
        </div>
        <div className="border-t border-zinc-800 flex">
          {isOffer ? (
            <>
              <button
                onClick={dismiss}
                className="flex-1 px-4 py-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Later
              </button>
              <button
                onClick={viewOffer}
                className="flex-1 px-4 py-3 text-sm font-semibold text-amber-400 hover:text-amber-300 border-l border-zinc-800 transition-colors"
              >
                View offer
              </button>
            </>
          ) : (
            <button
              onClick={dismiss}
              className="flex-1 px-4 py-3 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
            >
              Nice!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
