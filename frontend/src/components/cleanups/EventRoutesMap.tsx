"use client";

import dynamic from "next/dynamic";
import type { EventAttendeeRoute } from "@/lib/cleanupEvents";

// EventRoutesMapInner statically imports maplibre-gl, which touches window at module
// load — ssr:false keeps that off the server render, matching EventRoutesList's prior
// dynamic-import of RoutePreviewMap for the same reason.
const EventRoutesMapInner = dynamic(() => import("@/components/cleanups/EventRoutesMapInner"), {
  ssr: false,
  loading: () => <div className="w-full h-[320px] rounded-lg bg-zinc-900 animate-pulse" />,
});

export default function EventRoutesMap({ routes }: { routes: EventAttendeeRoute[] }) {
  return <EventRoutesMapInner routes={routes} />;
}
