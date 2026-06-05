"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl(id: string) {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

export default function MiniMapPreview({
  lat,
  lng,
  styleId = "outdoor",
}: {
  lat: number;
  lng: number;
  styleId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const isFirstStyleRender = useRef(true);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(styleId),
      center: [lng, lat],
      zoom: 15,
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

  useEffect(() => {
    if (isFirstStyleRender.current) { isFirstStyleRender.current = false; return; }
    if (!mapRef.current) return;
    mapRef.current.setStyle(styleUrl(styleId));
  }, [styleId]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[100px] rounded-lg overflow-hidden border border-zinc-700/50"
    />
  );
}
