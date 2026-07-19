"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Lightbox from "@/components/Lightbox";
import type { CleanupRouteDetailData } from "@/lib/cleanupRoutes";

const RoutePreviewMap = dynamic(() => import("@/components/map/RoutePreviewMap"), {
  ssr: false,
  loading: () => <div className="w-full h-[220px] rounded-lg bg-zinc-900 animate-pulse" />,
});

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function CleanupRouteDetail({ route }: { route: CleanupRouteDetailData }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const submitterName = route.submitted_by.display_name ?? route.submitted_by.username ?? "A volunteer";

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h1 className="text-xl font-bold text-zinc-100">Cleanup route</h1>
        <span
          title="This feature should work but is still being tested."
          className="text-xs text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5 font-normal cursor-help"
        >
          Beta
        </span>
      </div>

      <RoutePreviewMap
        coordinates={route.route.coordinates}
        groupLogoUrl={route.group_logo_url}
        enlargeable
      />

      <div className="mt-4 flex items-center gap-3">
        {route.submitted_by.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={route.submitted_by.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-zinc-700" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm text-zinc-400">
            {submitterName[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-sm text-zinc-200">{submitterName}</p>
          <p className="text-xs text-zinc-500">
            {formatDate(route.created_at)}
            {route.geo_unit_display_name && ` · ${route.geo_unit_display_name}`}
          </p>
        </div>
      </div>

      {route.group_name && (
        <p className="mt-2 text-xs text-zinc-500">
          Logged for{" "}
          {route.group_slug ? (
            <Link href={`/groups/${route.group_slug}`} className="text-zinc-300 hover:underline">
              {route.group_name}
            </Link>
          ) : (
            route.group_name
          )}
        </p>
      )}

      <div className="mt-4 flex gap-4 text-sm text-zinc-400">
        {route.metrics_small_bags != null && route.metrics_small_bags > 0 && (
          <span>{route.metrics_small_bags} small bag{route.metrics_small_bags === 1 ? "" : "s"}</span>
        )}
        {route.metrics_large_bags != null && route.metrics_large_bags > 0 && (
          <span>{route.metrics_large_bags} large bag{route.metrics_large_bags === 1 ? "" : "s"}</span>
        )}
        {route.metrics_pounds != null && route.metrics_pounds > 0 && <span>{route.metrics_pounds} lbs</span>}
      </div>

      {route.image_urls.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {route.image_urls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt="Cleanup route photo"
              className="h-24 w-24 object-cover rounded-lg cursor-pointer border border-zinc-800 hover:border-emerald-600 transition-colors"
              onClick={() => setLightboxIndex(i)}
            />
          ))}
        </div>
      )}

      {route.campaign_slug && (
        <div className="mt-6">
          <Link href={`/campaigns/${route.campaign_slug}`} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            ← Back to {route.campaign_title ?? "campaign"}
          </Link>
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          images={route.image_urls}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
