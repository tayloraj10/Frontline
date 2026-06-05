"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  groupId: string;
  userId: string;
  isMember: boolean;
}

export default function GroupMembershipButton({ groupId, userId, isMember }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, user_id: userId, role: "member" });
    if (err) setError(err.message);
    else router.refresh();
    setLoading(false);
  };

  const handleLeave = async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);
    if (err) setError(err.message);
    else router.refresh();
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-1">
      {isMember ? (
        <button
          onClick={handleLeave}
          disabled={loading}
          className="px-4 py-2 border border-zinc-700 hover:border-red-700 text-zinc-400 hover:text-red-400 text-sm rounded-lg transition-colors disabled:opacity-40"
        >
          {loading ? "Leaving…" : "Leave Group"}
        </button>
      ) : (
        <button
          onClick={handleJoin}
          disabled={loading}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
        >
          {loading ? "Joining…" : "Join Group"}
        </button>
      )}
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
