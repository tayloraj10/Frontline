"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl() {
  return `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`;
}

/**
 * Review/edit step for a captured route: one draggable marker per recorded
 * GPS point (to fix stray spikes), tap-to-delete. Add-node/reorder is out of
 * scope for v1 — this only ever removes or repositions existing points.
 * Mirrors BusinessLocationMapPicker's draggable-marker pattern and
 * RoutePicker's setData()-based line redraw.
 */
export default function RouteNodeEditor({
  coordinates,
  onChange,
  heightClassName = "h-[360px]",
}: {
  coordinates: [number, number][];
  onChange: (coordinates: [number, number][]) => void;
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const coordsRef = useRef<[number, number][]>(coordinates);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const redrawLine = () => {
    const m = mapRef.current;
    if (!m) return;
    const src = m.getSource("route-node-editor") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const coords = coordsRef.current;
    src.setData({
      type: "FeatureCollection",
      features:
        coords.length >= 2
          ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }]
          : [],
    });
  };

  const rebuildMarkers = () => {
    const m = mapRef.current;
    if (!m) return;
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current = coordsRef.current.map((coord, index) => {
      const marker = new maplibregl.Marker({ color: "#f59e0b", draggable: true }).setLngLat(coord).addTo(m);

      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        coordsRef.current = coordsRef.current.map((c, i) => (i === index ? [lng, lat] : c));
        redrawLine();
        onChangeRef.current(coordsRef.current);
      });

      marker.getElement().addEventListener("click", (e) => {
        e.stopPropagation();
        if (coordsRef.current.length <= 2) return; // keep at least 2 points for a valid line
        coordsRef.current = coordsRef.current.filter((_, i) => i !== index);
        redrawLine();
        rebuildMarkers();
        onChangeRef.current(coordsRef.current);
      });

      return marker;
    });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current || coordsRef.current.length === 0) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      center: coordsRef.current[0],
      zoom: 15,
      attributionControl: false,
    });
    mapRef.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");

    m.on("load", () => {
      m.addSource("route-node-editor", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "route-node-editor-casing",
        type: "line",
        source: "route-node-editor",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
      });
      m.addLayer({
        id: "route-node-editor-line",
        type: "line",
        source: "route-node-editor",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f59e0b", "line-width": 4 },
      });
      redrawLine();
      rebuildMarkers();

      const bounds = coordsRef.current.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coordsRef.current[0], coordsRef.current[0]),
      );
      m.fitBounds(bounds, { padding: 60 });
    });

    return () => {
      markersRef.current.forEach((mk) => mk.remove());
      markersRef.current = [];
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative w-full ${heightClassName}`}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden border border-zinc-700/50" />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-zinc-900/95 border border-zinc-700 rounded-lg text-xs text-zinc-200 shadow-xl whitespace-nowrap">
        Drag a point to fix a stray reading, or tap one to remove it.
      </div>
    </div>
  );
}
