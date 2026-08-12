"use client";

import { forwardRef } from "react";

interface MapSnapshotCardProps {
  groupName: string;
  groupLogoUrl?: string | null;
  mapImageUrl: string | null;
  loading: boolean;
}

const MapSnapshotCard = forwardRef<HTMLDivElement, MapSnapshotCardProps>(function MapSnapshotCard(
  { groupName, groupLogoUrl, mapImageUrl, loading },
  ref
) {
  return (
    <div ref={ref} className="relative flex h-[480px] w-[360px] flex-col overflow-hidden rounded-2xl bg-zinc-950">
      {mapImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mapImageUrl}
          alt=""
          crossOrigin="anonymous"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-zinc-600">
          {loading ? "Loading map…" : "No geotagged activity in this period."}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2.5 bg-gradient-to-b from-zinc-950/90 via-zinc-950/40 to-transparent p-4">
        {groupLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={groupLogoUrl}
            alt=""
            crossOrigin="anonymous"
            className="h-8 w-8 shrink-0 rounded-full border border-white/10 object-cover"
          />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-black leading-tight text-white">{groupName}</div>
        </div>
      </div>
    </div>
  );
});

export default MapSnapshotCard;
