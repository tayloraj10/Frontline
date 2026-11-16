"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { openDirections } from "@/lib/directions";
import { poolPlace, type SponsorshipPool } from "@/lib/sponsorshipPools";

const MiniMapPreview = dynamic(() => import("@/components/map/MiniMapPreview"), {
  ssr: false,
  loading: () => <div className="h-[220px] animate-pulse rounded-2xl bg-zinc-900" />,
});

/** Where the pool's cleanup is: a pin and radius for a site, the outline for a group area. */
export default function PoolLocation({ pool }: { pool: SponsorshipPool }) {
  const lat = pool.site_latitude ?? pool.center_latitude;
  const lng = pool.site_longitude ?? pool.center_longitude;
  if (lat == null || lng == null) return null;
  return (
    <section className="mb-4 space-y-2">
      <div className="overflow-hidden rounded-2xl ring-1 ring-inset ring-zinc-800">
        <MiniMapPreview
          lat={lat}
          lng={lng}
          interactive
          locate
          heightClassName="h-[220px]"
          radiusM={pool.model === "site" ? pool.site_radius_meters : null}
          area={(pool.area_geojson as GeoJSON.Polygon | null | undefined) ?? null}
        />
      </div>
      <p className="text-xs text-zinc-400">{poolPlace(pool)}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openDirections(lat, lng)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-zinc-800 px-4 text-sm font-semibold text-zinc-200 transition-[background-color,transform] duration-150 hover:bg-zinc-700 active:scale-[0.97] touch-manipulation"
        >
          <span aria-hidden="true">🧭</span>
          Get directions
        </button>
        <Link
          href={`/campaigns/trash-war?lat=${lat}&lng=${lng}&zoom=16`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-zinc-800 px-4 text-sm font-semibold text-zinc-200 transition-[background-color,transform] duration-150 hover:bg-zinc-700 active:scale-[0.97] touch-manipulation"
        >
          <span aria-hidden="true">📍</span>
          Show on map
        </Link>
      </div>
    </section>
  );
}
