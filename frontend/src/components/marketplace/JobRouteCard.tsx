"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Card } from "@/components/ui/Card";
import { durationLabel, mk } from "@/lib/marketplace";

type Track = {
  points: { latitude: number; longitude: number; recorded_at: string }[];
  distance_m: number;
  track_flagged: boolean;
  track_flag_reason: string | null;
};

const styleUrl = () => `https://api.maptiler.com/maps/outdoor/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`;

/**
 * The cleaner's recorded route for this job. Only the cleaner and admins can load it (the server returns
 * 404 to everyone else, in which case this renders nothing), because it is the cleaner's own location history.
 */
export default function JobRouteCard({ jobId, durationSeconds }: { jobId: string; durationSeconds?: number | null }) {
  const [track, setTrack] = useState<Track | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    mk<Track>(`/jobs/${jobId}/track`)
      .then((t) => live && setTrack(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [jobId]);

  const pts = track?.points ?? [];
  useEffect(() => {
    if (!box.current || pts.length < 2) return;
    const coords = pts.map((p) => [p.longitude, p.latitude] as [number, number]);
    const m = new maplibregl.Map({ container: box.current, style: styleUrl(), center: coords[0], zoom: 15, attributionControl: false });
    m.on("load", () => {
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
      const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      m.fitBounds(b, { padding: 32, maxZoom: 18, duration: 0 });
    });
    new maplibregl.Marker({ color: "#f59e0b" }).setLngLat(coords[0]).addTo(m);
    new maplibregl.Marker({ color: "#10b981" }).setLngLat(coords[coords.length - 1]).addTo(m);
    return () => m.remove();
  }, [pts]);

  if (!track) return null;
  const miles = track.distance_m / 1609.34;

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-bold text-zinc-100">Route</p>
        <p className="text-xs text-zinc-500">Visible only to the cleaner and Frontline admins.</p>
      </div>
      {pts.length >= 2 ? (
        <div ref={box} className="h-56 w-full overflow-hidden rounded-xl bg-zinc-900" />
      ) : (
        <p className="text-sm text-zinc-400">No route was recorded for this job.</p>
      )}
      <p className="text-sm text-zinc-300">
        {pts.length} points{pts.length >= 2 ? `, ${miles.toFixed(2)} mi` : ""}
        {durationSeconds != null ? `, ${durationLabel(durationSeconds)} on the job` : ""}
      </p>
      {track.track_flagged && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Finished without a recorded route{track.track_flag_reason ? `: ${track.track_flag_reason}` : ""}. Flagged for review.
        </p>
      )}
    </Card>
  );
}
