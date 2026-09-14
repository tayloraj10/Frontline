"use client";

import { useEffect, useState } from "react";
import { getEventAttendeeRoutes, type EventAttendeeRoute } from "@/lib/cleanupEvents";
import EventRoutesMap from "@/components/cleanups/EventRoutesMap";

// routeCount is a dependency so a freshly submitted route (bumping attendee_route_count
// on the parent's refetched event) triggers a refetch of the actual route list here too.
export default function EventRoutesSection({
  cleanupId,
  routeCount,
}: {
  cleanupId: string;
  routeCount: number;
}) {
  const [routes, setRoutes] = useState<EventAttendeeRoute[] | null>(null);

  useEffect(() => {
    if (routeCount === 0) return;
    let cancelled = false;
    getEventAttendeeRoutes(cleanupId)
      .then((r) => {
        if (!cancelled) setRoutes(r);
      })
      .catch(() => {
        if (!cancelled) setRoutes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cleanupId, routeCount]);

  if (routeCount === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200">
        <span aria-hidden="true">🗺️</span>
        Routes ({routeCount})
      </h3>
      {routes === null ? (
        <div className="w-full h-[320px] rounded-lg bg-zinc-900 animate-pulse" />
      ) : (
        <EventRoutesMap routes={routes} />
      )}
    </div>
  );
}
