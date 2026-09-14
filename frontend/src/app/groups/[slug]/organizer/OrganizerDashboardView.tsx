"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface EventMissingMetrics {
  id: string;
  title: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
}

interface OrganizerDashboardResponse {
  needs_event_nudge: boolean;
  events_missing_metrics: EventMissingMetrics[];
}

export default function OrganizerDashboardView({
  groupId,
  groupSlug,
  viewerUserId,
  fastapiUrl,
}: {
  groupId: string;
  groupSlug: string;
  viewerUserId: string;
  fastapiUrl: string;
}) {
  const [data, setData] = useState<OrganizerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ viewer_user_id: viewerUserId });
    fetch(`${fastapiUrl}/api/groups/${groupId}/organizer-dashboard?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json: OrganizerDashboardResponse) => setData(json))
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [groupId, viewerUserId, fastapiUrl]);

  if (loading) {
    return <p className="text-zinc-500 text-sm">Loading...</p>;
  }

  if (error || !data) {
    return <p className="text-red-400 text-sm">Couldn&apos;t load the organizer dashboard. Try again later.</p>;
  }

  const hasNothingPending = !data.needs_event_nudge && data.events_missing_metrics.length === 0;

  return (
    <div className="space-y-4">
      {hasNothingPending && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
          <p className="text-4xl mb-3">✅</p>
          <h2 className="text-lg font-bold text-zinc-100 mb-1">You&apos;re all caught up</h2>
          <p className="text-sm text-zinc-500">No organizer actions need your attention right now.</p>
        </div>
      )}

      {data.needs_event_nudge && (
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 px-5 py-4">
          <h2 className="font-bold text-amber-200 mb-1">Time to schedule your next event</h2>
          <p className="text-sm text-zinc-400 mb-3">
            It&apos;s been over a week since your group&apos;s last scheduled event. Keep the momentum going.
          </p>
          <Link
            href={`/groups/${groupSlug}/events/new`}
            className="inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-400"
          >
            Set up an event
          </Link>
        </div>
      )}

      {data.events_missing_metrics.map((event) => (
        <div key={event.id} className="rounded-xl border border-sky-800/50 bg-sky-950/20 px-5 py-4">
          <h2 className="font-bold text-sky-200 mb-1">Log your metrics</h2>
          <p className="text-sm text-zinc-400 mb-3">
            <span className="font-semibold text-zinc-200">{event.title}</span> has ended but no cleanup
            metrics have been logged yet.
          </p>
          <Link
            href={`/cleanup-events/${event.id}`}
            className="inline-block rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-sky-400"
          >
            Log metrics
          </Link>
        </div>
      ))}
    </div>
  );
}
