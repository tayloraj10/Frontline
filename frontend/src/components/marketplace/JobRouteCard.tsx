"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card } from "@/components/ui/Card";
import { durationLabel, mk } from "@/lib/marketplace";

type Track = {
  points: { latitude: number; longitude: number; recorded_at: string }[];
  distance_m: number;
  photos?: { kind: string; latitude: number; longitude: number }[];
  track_flagged: boolean;
  track_flag_reason: string | null;
};

const styleUrl = () => `https://api.maptiler.com/maps/outdoor/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`;

/**
 * The cleaner's recorded route for this job. The cleaner, admins and (once the work is done) the
 * customer can load it; the server returns 404 to everyone else and this renders nothing. Photo pins are only sent to
 * the customer and admins.
 */
export default function JobRouteCard({
  jobId, durationSeconds, loader, subtitle, sitePin,
}: {
  jobId: string;
  durationSeconds?: number | null;
  /** Fetches the track from somewhere other than a marketplace job (a sponsored site claim). */
  loader?: () => Promise<Track>;
  subtitle?: string;
  /** [lng, lat] of the site, drawn as an amber pin. */
  sitePin?: [number, number];
}) {
  const [track, setTrack] = useState<Track | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    (loader ? loader() : mk<Track>(`/jobs/${jobId}/track`))
      .then((t) => live && setTrack(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [jobId]); // loader is an inline closure; jobId identifies the source

  const pts = track?.points ?? [];
  const shots = track?.photos ?? [];
  const mappable = pts.length >= 2 || shots.length > 0;
  useEffect(() => {
    if (!box.current || !mappable) return;
    const coords = pts.map((p) => [p.longitude, p.latitude] as [number, number]);
    const all = [...coords, ...shots.map((p) => [p.longitude, p.latitude] as [number, number]), ...(sitePin ? [sitePin] : [])];
    const m = new maplibregl.Map({ container: box.current, style: styleUrl(), center: all[0], zoom: 15, attributionControl: false });
    m.on("load", () => {
      if (coords.length >= 2) {
        m.addSource("job-route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } },
        });
        m.addLayer({
          id: "job-route-casing", type: "line", source: "job-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
        });
        m.addLayer({
          id: "job-route-line", type: "line", source: "job-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#10b981", "line-width": 4 },
        });
      }
      const b = all.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(all[0], all[0]));
      m.fitBounds(b, { padding: 40, maxZoom: 18, duration: 0 });
    });
    if (sitePin) new maplibregl.Marker({ color: "#f59e0b" }).setLngLat(sitePin).setPopup(new maplibregl.Popup({ offset: 24 }).setText("Site")).addTo(m);
    if (shots.length === 0 && !sitePin) {
      new maplibregl.Marker({ color: "#f59e0b" }).setLngLat(coords[0]).addTo(m);
      new maplibregl.Marker({ color: "#10b981" }).setLngLat(coords[coords.length - 1]).addTo(m);
    }
    shots.forEach((p) =>
      new maplibregl.Marker({ color: p.kind === "before" ? "#38bdf8" : "#a855f7" })
        .setLngLat([p.longitude, p.latitude])
        .setPopup(new maplibregl.Popup({ offset: 24 }).setText(p.kind === "before" ? "Before photo taken here" : "After photo taken here"))
        .addTo(m),
    );
    return () => m.remove();
  }, [pts, shots, mappable, sitePin]);

  if (!track) return null;
  const miles = track.distance_m / 1609.34;

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-bold text-zinc-100">Route</p>
        <p className="text-xs text-zinc-500">{subtitle ?? "Visible to the cleaner, the customer once the work is done, and Frontline admins."}</p>
      </div>
      {mappable ? (
        <div ref={box} className="h-56 w-full overflow-hidden rounded-xl bg-zinc-900" />
      ) : (
        <p className="text-sm text-zinc-400">No route was recorded for this {loader ? "site" : "job"}.</p>
      )}
      <p className="text-sm text-zinc-300">
        {pts.length} points{pts.length >= 2 ? `, ${miles.toFixed(2)} mi` : ""}
        {durationSeconds != null ? `, ${durationLabel(durationSeconds)} on the job` : ""}
      </p>
      {shots.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />Before photo</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-purple-500" />After photo</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Route</span>
        </p>
      )}
      {track.track_flagged && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Finished without a recorded route{track.track_flag_reason ? `: ${track.track_flag_reason}` : ""}. Flagged for review.
        </p>
      )}
    </Card>
  );
}
