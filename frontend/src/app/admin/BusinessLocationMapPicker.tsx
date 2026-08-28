"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl() {
  return `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`;
}

const CONTINENTAL_US_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-125, 24.5],
  [-66.9, 49.5],
];

export default function BusinessLocationMapPicker({
  lat,
  lng,
  onChange,
  locationNoun = "business",
  interactive = true,
  initialCenter,
  initialZoom = 12,
  square = false,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  locationNoun?: string;
  interactive?: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  square?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastAppliedRef = useRef<{ lat: number; lng: number } | null>(
    lat !== null && lng !== null ? { lat, lng } : null
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      ...(lat !== null && lng !== null
        ? { center: [lng, lat] as [number, number], zoom: initialZoom }
        : initialCenter
        ? { center: initialCenter, zoom: initialZoom }
        : { bounds: CONTINENTAL_US_BOUNDS, fitBoundsOptions: { padding: 20 } }),
      attributionControl: false,
      interactive,
    });
    mapRef.current = m;
    if (interactive) {
      m.addControl(new maplibregl.NavigationControl(), "top-right");
      if (navigator.geolocation) {
        m.addControl(
          new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: false,
            showUserLocation: true,
          }),
          "top-right"
        );
      }
    }

    const marker = new maplibregl.Marker({ color: "#f59e0b", draggable: interactive });
    if (lat !== null && lng !== null) {
      marker.setLngLat([lng, lat]).addTo(m);
    }
    if (interactive) {
      marker.on("dragend", () => {
        const { lat: newLat, lng: newLng } = marker.getLngLat();
        onChangeRef.current(newLat, newLng);
      });
    }
    markerRef.current = marker;

    if (interactive) {
      m.on("click", (e) => {
        marker.setLngLat(e.lngLat);
        if (!marker.getElement().isConnected) marker.addTo(m);
        onChangeRef.current(e.lngLat.lat, e.lngLat.lng);
      });
    }

    return () => {
      m.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recenter and move the pin when lat/lng change from outside this component
  // (e.g. an address autocomplete selection), without fighting user drags —
  // a drag already updates the marker directly, and setLngLat here is a no-op
  // when the coordinates already match.
  useEffect(() => {
    const m = mapRef.current;
    const marker = markerRef.current;
    if (!m || !marker || lat === null || lng === null) return;
    if (lastAppliedRef.current?.lat === lat && lastAppliedRef.current?.lng === lng) return;
    lastAppliedRef.current = { lat, lng };
    marker.setLngLat([lng, lat]);
    if (!marker.getElement().isConnected) marker.addTo(m);
    m.flyTo({ center: [lng, lat], zoom: 14 });
  }, [lat, lng]);

  return (
    <div>
      <div
        ref={containerRef}
        className={`w-full ${square ? "h-[280px]" : "h-[220px]"} rounded-lg overflow-hidden border border-zinc-700/50 shadow-elevation-1`}
      />
      <p className="text-xs text-zinc-400 mt-1">
        {interactive ? `Click or drag the pin to set the ${locationNoun} location. ` : ""}
        {lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "No location set."}
      </p>
    </div>
  );
}
