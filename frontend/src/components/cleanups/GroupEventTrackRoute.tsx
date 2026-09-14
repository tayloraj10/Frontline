"use client";

import { useState } from "react";
import { useRouteTracking, type CapturedRoutePhoto } from "@/lib/useRouteTracking";
import {
  getIntersectingGeoUnits,
  type IntersectingGeoUnit,
  type RouteLineString,
  type RoutePhoto,
} from "@/lib/cleanupRoutes";
import { uploadToR2 } from "@/lib/uploadToR2";
import TrackRouteScreen from "@/components/contributions/TrackRouteScreen";

const launcherCls =
  "flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold border border-sky-700/60 text-sky-300 hover:bg-sky-950/30 active:bg-sky-950/30 active:scale-[0.97] rounded-lg transition-[background-color,transform] duration-150 touch-manipulation";

const BetaBadge = () => (
  <span className="px-1 py-0.5 rounded text-[9px] font-bold tracking-wide bg-violet-950/60 border border-violet-700/60 text-violet-300">
    BETA
  </span>
);

/**
 * Group (organizer_total) events log the team's total separately, so a tracked route here is
 * a fun, decorative record rather than a real contribution (mirrors ContributionPanel's
 * isDecorativeTeamTrack) — recorded with value 0, tied to the event via cleanup_event_id.
 * Runs entirely on this page rather than deep-linking into the campaign map's contribute
 * modal, since there's no bag-count form or per-attendee metrics to fill out afterward.
 */
export default function GroupEventTrackRoute({
  event,
  userId,
  onSubmitted,
}: {
  event: { id: string; campaign_id: string; group_id: string };
  userId: string;
  onSubmitted?: () => void;
}) {
  const session = useRouteTracking(event.campaign_id);
  const [route, setRoute] = useState<RouteLineString | null>(null);
  const [photos, setPhotos] = useState<CapturedRoutePhoto[]>([]);
  const [units, setUnits] = useState<IntersectingGeoUnit[] | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const resetAll = () => {
    session.reset();
    setRoute(null);
    setPhotos([]);
    setUnits(null);
    setSelectedUnitId(null);
    setError(null);
    setDone(false);
  };

  const handleConfirm = async (coordinates: [number, number][], confirmedPhotos: CapturedRoutePhoto[]) => {
    const confirmedRoute: RouteLineString = { type: "LineString", coordinates };
    setRoute(confirmedRoute);
    setPhotos(confirmedPhotos);
    setError(null);
    try {
      const found = await getIntersectingGeoUnits({ campaignId: event.campaign_id, route: confirmedRoute });
      setUnits(found);
      if (found.length === 1) await submitRoute(confirmedRoute, confirmedPhotos, found[0].geo_unit_id);
    } catch {
      setError("Couldn't check this route's location, please try again.");
    }
  };

  const submitRoute = async (
    submitRouteData: RouteLineString,
    submitPhotos: CapturedRoutePhoto[],
    geoUnitId: string,
  ) => {
    setSubmitting(true);
    setError(null);
    try {
      const uploadedPhotos: RoutePhoto[] = await Promise.all(
        submitPhotos.map(async (p) =>
          p.kind === "uploaded"
            ? { url: p.url, lat: p.lat, lng: p.lng }
            : { url: await uploadToR2(p.file), lat: p.lat, lng: p.lng },
        ),
      );
      const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: event.campaign_id,
          user_id: userId,
          group_id: event.group_id,
          contribution_type: "cleanup",
          value: 0,
          cleanup_event_id: event.id,
          route: submitRouteData,
          route_geo_unit_id: geoUnitId,
          route_photos: uploadedPhotos.length > 0 ? uploadedPhotos : undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      session.reset();
      setDone(true);
      onSubmitted?.();
    } catch {
      setError("Couldn't save your route, please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (session.phase === "idle") {
    return (
      <div>
        <button type="button" onClick={() => session.openTracker(event.id)} className={`w-full ${launcherCls}`}>
          <span aria-hidden="true">🛰️</span>
          Track my route
          <BetaBadge />
        </button>
        {done && (
          <div className="mt-2 flex items-center gap-1.5 px-3 py-2 text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-800/60 rounded-lg">
            <span aria-hidden="true">✅</span>
            Route saved! Track another whenever you like.
          </div>
        )}
      </div>
    );
  }

  if (!route) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
        <TrackRouteScreen session={session} onConfirm={handleConfirm} onCancel={resetAll} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2.5 text-sm bg-zinc-900/60 border border-orange-800/60 rounded-lg">
        <span className="text-orange-300 text-xs">{error}</span>
        <button type="button" onClick={resetAll} className={launcherCls}>
          Start over
        </button>
      </div>
    );
  }

  if (units === null || submitting) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-lg">
        {submitting ? "Saving your route…" : "Checking your route's location…"}
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2.5 text-sm bg-zinc-900/60 border border-orange-800/60 rounded-lg">
        <span className="text-orange-300 text-xs">
          This route isn&apos;t inside any tracked area, so it can&apos;t be saved.
        </span>
        <button type="button" onClick={resetAll} className={launcherCls}>
          Start over
        </button>
      </div>
    );
  }

  // units.length > 1 — ask which area to credit the route to.
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 bg-zinc-900/60 border border-zinc-800 rounded-lg">
      <span className="text-xs text-zinc-400">Which area should this route count toward?</span>
      <div className="flex flex-col gap-1.5">
        {units.map((unit) => (
          <label
            key={unit.geo_unit_id}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-200 cursor-pointer has-[:checked]:border-sky-600 has-[:checked]:bg-sky-950/30"
          >
            <input
              type="radio"
              name="geo-unit"
              checked={selectedUnitId === unit.geo_unit_id}
              onChange={() => setSelectedUnitId(unit.geo_unit_id)}
            />
            {unit.display_name}
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={!selectedUnitId}
        onClick={() => selectedUnitId && route && submitRoute(route, photos, selectedUnitId)}
        className="mt-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold bg-sky-500 hover:bg-sky-400 active:bg-sky-400 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 text-sky-950 rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
      >
        Save Route
      </button>
    </div>
  );
}
