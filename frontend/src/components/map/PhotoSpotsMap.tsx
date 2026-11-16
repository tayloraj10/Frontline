"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type P = [number, number] | null;

/** Admin review: the site pin plus where the before and after photos were actually taken. */
export default function PhotoSpotsMap({ site, before, after }: { site: [number, number]; before: P; after: P }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: `https://api.maptiler.com/maps/outdoor/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`,
      center: site,
      zoom: 16,
      attributionControl: false,
    });
    const pins: [P, string, string][] = [
      [site, "#f59e0b", "Site"],
      [before, "#38bdf8", "Before photo taken here"],
      [after, "#a855f7", "After photo taken here"],
    ];
    const pts: [number, number][] = [];
    for (const [pt, color, text] of pins) {
      if (!pt) continue;
      pts.push(pt);
      new maplibregl.Marker({ color }).setLngLat(pt).setPopup(new maplibregl.Popup({ offset: 24 }).setText(text)).addTo(m);
    }
    m.on("load", () => {
      const b = pts.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(pts[0], pts[0]));
      m.fitBounds(b, { padding: 40, maxZoom: 18, duration: 0 });
    });
    return () => m.remove();
  }, [site, before, after]);
  return (
    <div>
      <div ref={box} className="h-44 w-full overflow-hidden rounded-xl bg-zinc-900" />
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-zinc-400">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Site</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />Before photo</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-purple-500" />After photo</span>
      </p>
    </div>
  );
}
