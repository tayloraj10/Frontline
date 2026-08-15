"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function BlockUserButton({
  blockedUserId,
  blockedUsername,
  initiallyBlocked,
  className = "",
}: {
  blockedUserId: string;
  blockedUsername: string;
  initiallyBlocked: boolean;
  className?: string;
}) {
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [state, setState] = useState<"idle" | "confirming" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleUnblock = async () => {
    setState("submitting");
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error: err } = await supabase
      .from("blocked_users")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", blockedUserId);
    if (err) {
      setError("Failed to unblock. Try again.");
      setState("idle");
      return;
    }
    setBlocked(false);
    setState("idle");
  };

  const handleBlock = async () => {
    setState("submitting");
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error: err } = await supabase
      .from("blocked_users")
      .insert({ blocker_id: user.id, blocked_id: blockedUserId });
    if (err) {
      setError("Failed to block. Try again.");
      setState("idle");
      return;
    }
    setBlocked(true);
    setState("idle");
  };

  if (blocked) {
    return (
      <div className={className}>
        <button
          onClick={handleUnblock}
          disabled={state === "submitting"}
          className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 rounded-lg shadow-elevation-1 transition-[color,border-color,transform] duration-150 active:scale-[0.95] touch-manipulation disabled:opacity-50"
        >
          {state === "submitting" ? "Unblocking…" : `Unblock @${blockedUsername}`}
        </button>
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        onClick={() => setState("confirming")}
        className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-red-400 hover:border-red-500/50 rounded-lg shadow-elevation-1 transition-[color,border-color,transform] duration-150 active:scale-[0.95] touch-manipulation"
      >
        Block user
      </button>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      {state === "confirming" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setState("idle")}>
          <div
            className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-xl shadow-elevation-4 p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-zinc-300">
              Block @{blockedUsername}? You won&apos;t see their activity in feeds and maps anymore.
            </p>
            <div className="flex items-center justify-end gap-4">
              <button
                onClick={() => setState("idle")}
                className="text-sm text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                onClick={handleBlock}
                className="text-sm font-semibold text-red-400 hover:text-red-300 active:text-red-300 transition-colors duration-150"
              >
                Yes, block
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
