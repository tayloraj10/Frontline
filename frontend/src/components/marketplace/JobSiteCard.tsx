"use client";

import dynamic from "next/dynamic";
import { Navigation } from "lucide-react";
import type { Job } from "@/lib/marketplace";

const MiniMapPreview = dynamic(() => import("@/components/map/MiniMapPreview"), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-2xl bg-zinc-900" />,
});

/** The exact spot for a job: a map with the pin, the coordinates, and one-tap turn-by-turn in the phone's map app. */
export default function JobSiteCard({
  job,
  navigate = true,
}: {
  job: Pick<Job, "latitude" | "longitude" | "address_label" | "radius_m" | "area">;
  /** Turn-by-turn buttons are for the cleaner who took the job, not for someone still deciding. */
  navigate?: boolean;
}) {
  const { latitude: lat, longitude: lng } = job;
  if (lat == null || lng == null) return null;
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const btn =
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl px-4 text-sm font-bold touch-manipulation active:scale-[0.97]";
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl ring-1 ring-inset ring-zinc-800">
        <MiniMapPreview lat={lat} lng={lng} interactive heightClassName="h-56" radiusM={job.radius_m} area={job.area} />
      </div>
      <p className="text-xs text-zinc-400">
        {job.address_label ? `${job.address_label}. ` : ""}Pin at {coords}
        {job.area ? ", the green outline is the area to work" : job.radius_m ? `, the green circle shows the work area (about ${job.radius_m} m around the pin)` : ""}.
      </p>
      {navigate && (
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} bg-sky-400 text-sky-950`}
        >
          <Navigation className="h-4 w-4" aria-hidden="true" />
          Navigate
        </a>
        <a
          href={`https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} bg-zinc-800 text-zinc-100`}
        >
          Apple Maps
        </a>
      </div>
      )}
    </div>
  );
}
