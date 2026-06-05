"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MINI_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster" as const,
      source: "osm",
      paint: {
        "raster-opacity": 0.75,
        "raster-saturation": -0.5,
        "raster-brightness-max": 0.8,
      },
    },
  ],
};

export default function MiniMapPreview({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: MINI_STYLE,
      center: [lng, lat],
      zoom: 14,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = m;
    const marker = new maplibregl.Marker({ color: "#22c55e" })
      .setLngLat([lng, lat])
      .addTo(m);
    markerRef.current = marker;
    return () => {
      m.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLngLat([lng, lat]);
    mapRef.current.setCenter([lng, lat]);
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[100px] rounded-lg overflow-hidden border border-zinc-700/50"
    />
  );
}
