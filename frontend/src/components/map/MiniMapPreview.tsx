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
  interactive = false,
  heightClassName = "h-[100px]",
  zoneCampaignId,
  radiusM,
  area,
}: {
  lat: number;
  lng: number;
  styleId?: string;
  interactive?: boolean;
  heightClassName?: string;
  /** When set, draws the campaign's zone (ZIP) boundaries from its territory tiles. */
  zoneCampaignId?: string;
  /** Draws a circle of this many meters around the pin (a job's work radius). */
  radiusM?: number | null;
  /** Draws this polygon instead of the circle (a job's drawn work area). */
  area?: GeoJSON.Polygon | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const isFirstStyleRender = useRef(true);
  const zoneIdRef = useRef(zoneCampaignId);
  zoneIdRef.current = zoneCampaignId;

  // style.load fires again after setStyle, so the overlay is re-added on map style changes
  const addZones = (m: maplibregl.Map) => {
    const id = zoneIdRef.current;
    if (!id || m.getSource("zones")) return;
    m.addSource("zones", {
      type: "vector",
      tiles: [`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/${id}/{z}/{x}/{y}.mvt`],
      minzoom: 0,
      maxzoom: 14,
    });
    m.addLayer({
      id: "zones-outline",
      type: "line",
      source: "zones",
      "source-layer": "territories",
      paint: { "line-color": "#38bdf8", "line-width": 2.5, "line-opacity": 0.95 },
    });
  };

  const siteRef = useRef({ lat, lng, radiusM, area });
  useEffect(() => {
    siteRef.current = { lat, lng, radiusM, area };
  });

  // A circle (or the drawn polygon) showing how far the work spreads. Re-added on every style load.
  const addSite = (m: maplibregl.Map) => {
    const { lat: la, lng: ln, radiusM: r, area: poly } = siteRef.current;
    if (m.getSource("site")) return;
    let geometry: GeoJSON.Polygon | null = poly ?? null;
    if (!geometry && r && r > 0) {
      const dLat = r / 111320;
      const dLng = r / (111320 * Math.cos((la * Math.PI) / 180));
      const ring = Array.from({ length: 65 }, (_, i) => {
        const a = (i / 64) * 2 * Math.PI;
        return [ln + dLng * Math.cos(a), la + dLat * Math.sin(a)];
      });
      geometry = { type: "Polygon", coordinates: [ring] };
    }
    if (!geometry) return;
    m.addSource("site", { type: "geojson", data: { type: "Feature", properties: {}, geometry } });
    m.addLayer({ id: "site-fill", type: "fill", source: "site", paint: { "fill-color": "#22c55e", "fill-opacity": 0.18 } });
    m.addLayer({ id: "site-line", type: "line", source: "site", paint: { "line-color": "#22c55e", "line-width": 2.5 } });
    const pts = geometry.coordinates[0];
    const b = new maplibregl.LngLatBounds(pts[0] as [number, number], pts[0] as [number, number]);
    pts.forEach((p) => b.extend(p as [number, number]));
    m.fitBounds(b, { padding: 40, maxZoom: 17, duration: 0 });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(styleId),
      center: [lng, lat],
      zoom: 15,
      interactive,
      attributionControl: false,
    });
    mapRef.current = m;
    m.on("style.load", () => {
      addZones(m);
      addSite(m);
    });
    if (interactive) m.addControl(new maplibregl.NavigationControl(), "top-right");
    const marker = new maplibregl.Marker({ color: "#22c55e" })
      .setLngLat([lng, lat])
      .addTo(m);
    markerRef.current = marker;
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
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
    const m = mapRef.current;
    if (!m) return;
    if (!zoneCampaignId) {
      if (m.getLayer("zones-outline")) m.removeLayer("zones-outline");
      if (m.getSource("zones")) m.removeSource("zones");
    } else if (m.isStyleLoaded()) {
      addZones(m);
    }
  }, [zoneCampaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isFirstStyleRender.current) { isFirstStyleRender.current = false; return; }
    if (!mapRef.current) return;
    mapRef.current.setStyle(styleUrl(styleId));
  }, [styleId]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${heightClassName} rounded-lg overflow-hidden border border-zinc-700/50`}
    />
  );
}
