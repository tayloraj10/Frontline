"use client";

import { useEffect, useState } from "react";

interface DashboardCounts {
  needs_event_nudge: boolean;
  events_missing_metrics: unknown[];
}

/** Count of pending organizer to-dos, shown on the To-do list button. Renders nothing at zero or on error. */
export default function TodoBadge({
  groupId,
  viewerUserId,
  fastapiUrl,
}: {
  groupId: string;
  viewerUserId: string;
  fastapiUrl: string;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ viewer_user_id: viewerUserId });
    fetch(`${fastapiUrl}/api/groups/${groupId}/organizer-dashboard?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json: DashboardCounts) => {
        setCount((json.needs_event_nudge ? 1 : 0) + (json.events_missing_metrics?.length ?? 0));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [groupId, viewerUserId, fastapiUrl]);

  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} pending`}
      className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-zinc-950"
    >
      {count}
    </span>
  );
}
