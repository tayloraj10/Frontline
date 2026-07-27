"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteGroup, GroupHasBlockingEventsError, type BlockingEvent } from "@/lib/groups";

interface Props {
  groupId: string;
  groupName: string;
  currentUserId: string;
}

export default function DeleteGroupSection({ groupId, groupName, currentUserId }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockingEvents, setBlockingEvents] = useState<BlockingEvent[] | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    setBlockingEvents(null);
    try {
      await deleteGroup(groupId, currentUserId);
      router.push("/groups");
      router.refresh();
    } catch (err) {
      if (err instanceof GroupHasBlockingEventsError) {
        setBlockingEvents(err.blockingEvents);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to delete group");
      }
    } finally {
      setDeleting(false);
    }
  };

  if (!confirming) {
    return (
      <div className="border border-red-900/40 rounded-xl p-6 bg-red-950/10">
        <h2 className="text-sm font-semibold text-red-400 mb-1">Danger zone</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Permanently delete this group. Members, co-host links, territory claims, and leaderboard
          standing are removed. Contributions and past events are kept but detached from the group.
        </p>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="px-4 py-2 text-sm font-semibold text-red-400 border border-red-900/60 rounded-lg hover:bg-red-950/30 transition-colors"
        >
          Delete group
        </button>
      </div>
    );
  }

  return (
    <div className="border border-red-900/40 rounded-xl p-6 bg-red-950/10">
      <h2 className="text-sm font-semibold text-red-400 mb-1">Delete &ldquo;{groupName}&rdquo;?</h2>
      <p className="text-xs text-zinc-500 mb-4">This cannot be undone. Type the group name to confirm.</p>

      {error && (
        <div className="mb-4 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
          <p>{error}</p>
          {blockingEvents && blockingEvents.length > 0 && (
            <ul className="mt-2 space-y-1 list-disc list-inside">
              {blockingEvents.map((ev) => (
                <li key={ev.id}>
                  <Link href={`/cleanup-events/${ev.id}`} className="underline hover:text-red-300">
                    {ev.title}
                  </Link>{" "}
                  &mdash; {new Date(ev.scheduled_start).toLocaleDateString()}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <input
        type="text"
        value={typedName}
        onChange={(e) => setTypedName(e.target.value)}
        placeholder={groupName}
        className="w-full mb-4 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-700 transition-colors"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={typedName !== groupName || deleting}
          onClick={handleDelete}
          className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {deleting ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTypedName("");
            setError(null);
            setBlockingEvents(null);
          }}
          className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
