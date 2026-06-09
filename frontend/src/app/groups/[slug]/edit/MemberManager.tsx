"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Member {
  userId: string;
  username: string;
  displayName: string | null;
  role: string;
  joinedAt: string;
}

interface Props {
  groupId: string;
  currentUserId: string;
  initialMembers: Member[];
}

export default function MemberManager({ groupId, currentUserId, initialMembers }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const adminCount = members.filter((m) => m.role === "admin").length;

  const promote = async (userId: string) => {
    setBusy(userId);
    setError(null);
    const { error } = await supabase
      .from("group_members")
      .update({ role: "admin" })
      .eq("group_id", groupId)
      .eq("user_id", userId);
    setBusy(null);
    if (error) { setError(error.message); return; }
    setMembers((prev) => prev.map((m) => m.userId === userId ? { ...m, role: "admin" } : m));
  };

  const demote = async (userId: string) => {
    if (userId === currentUserId) {
      setError("You can't demote yourself.");
      return;
    }
    setBusy(userId);
    setError(null);
    const { error } = await supabase
      .from("group_members")
      .update({ role: "member" })
      .eq("group_id", groupId)
      .eq("user_id", userId);
    setBusy(null);
    if (error) { setError(error.message); return; }
    setMembers((prev) => prev.map((m) => m.userId === userId ? { ...m, role: "member" } : m));
  };

  const remove = async (userId: string) => {
    if (userId === currentUserId) {
      setError("You can't remove yourself. Leave from the group page instead.");
      return;
    }
    setBusy(userId);
    setError(null);
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);
    setBusy(null);
    if (error) { setError(error.message); return; }
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
  };

  return (
    <div>
      {error && (
        <p className="mb-3 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <ul className="divide-y divide-zinc-800/60">
        {members.map((m) => {
          const isSelf = m.userId === currentUserId;
          const isAdmin = m.role === "admin";
          const canDemote = isAdmin && adminCount > 1 && !isSelf;
          const isBusy = busy === m.userId;

          return (
            <li key={m.userId} className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0">
                  {(m.displayName ?? m.username)[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <Link
                    href={`/users/${m.username}`}
                    className="text-sm text-zinc-200 hover:text-zinc-100 transition-colors font-medium"
                  >
                    {m.displayName ?? m.username}
                  </Link>
                  {isSelf && <span className="ml-1.5 text-xs text-zinc-600">(you)</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isAdmin && (
                  <span className="text-xs text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">
                    admin
                  </span>
                )}
                {!isBusy && !isAdmin && (
                  <button
                    onClick={() => promote(m.userId)}
                    className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors px-2 py-0.5 hover:bg-zinc-800 rounded"
                  >
                    Make admin
                  </button>
                )}
                {!isBusy && canDemote && (
                  <button
                    onClick={() => demote(m.userId)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-0.5 hover:bg-zinc-800 rounded"
                  >
                    Demote
                  </button>
                )}
                {!isBusy && !isSelf && (
                  <button
                    onClick={() => remove(m.userId)}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors px-2 py-0.5 hover:bg-zinc-800 rounded"
                  >
                    Remove
                  </button>
                )}
                {isBusy && <span className="text-xs text-zinc-600">…</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
