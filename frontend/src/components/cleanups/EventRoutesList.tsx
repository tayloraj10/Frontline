"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import { formatDistance } from "@/lib/nearbyPartners";
import type { EventAttendeeRoute } from "@/lib/cleanupEvents";

const RoutePreviewMap = dynamic(() => import("@/components/map/RoutePreviewMap"), {
  ssr: false,
  loading: () => <div className="w-full h-[160px] rounded-lg bg-zinc-900 animate-pulse" />,
});

export default function EventRoutesList({ routes }: { routes: EventAttendeeRoute[] }) {
  if (routes.length === 0) {
    return <p className="text-sm text-zinc-500 text-center py-10">No routes tracked for this event yet.</p>;
  }

  return (
    <div className="space-y-4">
      {routes.map((route) => {
        const submitterName = route.submitted_by.display_name ?? route.submitted_by.username ?? "A volunteer";
        return (
          <Link
            key={route.id}
            href={`/routes/${route.id}`}
            className="block border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1 hover:border-zinc-600 active:border-zinc-600 transition-colors duration-150 touch-manipulation"
          >
            <RoutePreviewMap
              coordinates={route.route.coordinates}
              photos={route.route_photos}
              isEvent
              heightClassName="h-[160px]"
            />
            <div className="p-3">
              <div className="flex items-center gap-2">
                <Avatar avatarUrl={route.submitted_by.avatar_url} name={submitterName} username={route.submitted_by.username} size="xs" />
                <span className="text-sm text-zinc-200">{submitterName}</span>
              </div>
              <div className="mt-2 flex gap-3 text-xs text-zinc-500 flex-wrap">
                {route.route_distance_meters != null && route.route_distance_meters > 0 && (
                  <span>{formatDistance(route.route_distance_meters)}</span>
                )}
                {route.metrics_small_bags != null && route.metrics_small_bags > 0 && (
                  <span>{route.metrics_small_bags} small bag{route.metrics_small_bags === 1 ? "" : "s"}</span>
                )}
                {route.metrics_large_bags != null && route.metrics_large_bags > 0 && (
                  <span>{route.metrics_large_bags} large bag{route.metrics_large_bags === 1 ? "" : "s"}</span>
                )}
                {route.metrics_pounds != null && route.metrics_pounds > 0 && <span>{route.metrics_pounds} lbs</span>}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
