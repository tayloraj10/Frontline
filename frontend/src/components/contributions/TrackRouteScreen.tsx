"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  requestTrackingPermission,
  openLocationSettings,
  startRouteTracking,
  type TrackedPoint,
} from "@/lib/backgroundGeolocation";
import RouteNodeEditor from "./RouteNodeEditor";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl() {
  return `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`;
}

const SHORT_ROUTE_METERS = 50;
const SHORT_ROUTE_SECONDS = 30;

/** Haversine distance in meters between two [lng, lat] points. */
function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function totalDistanceMeters(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += distanceMeters(coords[i - 1], coords[i]);
  return total;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return miles >= 0.1 ? `${miles.toFixed(2)} mi` : `${Math.round(meters)} m`;
}

type Phase = "permission" | "tracking" | "reviewing";

/**
 * Full-screen "Track Route" capture flow: request Always location permission,
 * record a live GPS path (including while backgrounded, via the custom
 * capacitor-background-geolocation-frontline plugin), then hand off to
 * RouteNodeEditor for a quick review/edit pass before confirming. iOS only —
 * requestTrackingPermission()/startRouteTracking() no-op on web.
 */
export default function TrackRouteScreen({
  onConfirm,
  onCancel,
}: {
  onConfirm: (coordinates: [number, number][]) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("permission");
  const [permissionError, setPermissionError] = useState<"whenInUseOnly" | "denied" | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [reviewCoords, setReviewCoords] = useState<[number, number][]>([]);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showShortRouteConfirm, setShowShortRouteConfirm] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  const coordsRef = useRef<[number, number][]>([]);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const redraw = () => {
    const m = mapRef.current;
    if (!m) return;
    const src = m.getSource("track-route") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const c = coordsRef.current;
    src.setData({
      type: "FeatureCollection",
      features:
        c.length >= 2 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } }] : [],
    });
    if (c.length > 0) m.panTo(c[c.length - 1]);
  };

  const handlePoint = (point: TrackedPoint) => {
    const next: [number, number] = [point.longitude, point.latitude];
    coordsRef.current = [...coordsRef.current, next];
    setCoords(coordsRef.current);
    redraw();
  };

  const beginTracking = async () => {
    setRequesting(true);
    setPermissionError(null);
    try {
      const result = await requestTrackingPermission();
      if (result !== "granted") {
        setPermissionError(result === "whenInUseOnly" ? "whenInUseOnly" : "denied");
        return;
      }
      coordsRef.current = [];
      setCoords([]);
      setStartedAt(Date.now());
      setPhase("tracking");
      const handle = await startRouteTracking(handlePoint, (message) => setTrackingError(message));
      stopRef.current = handle.stop;
    } finally {
      setRequesting(false);
    }
  };

  // Elapsed-time ticker while tracking.
  useEffect(() => {
    if (phase !== "tracking" || startedAt === null) return;
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(interval);
  }, [phase, startedAt]);

  // Map instance, created once tracking starts.
  useEffect(() => {
    if (phase !== "tracking" || !containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      center: coordsRef.current[0] ?? [-74.006, 40.7128],
      zoom: 16,
      attributionControl: false,
    });
    mapRef.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.on("load", () => {
      m.addSource("track-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "track-route-casing",
        type: "line",
        source: "track-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
      });
      m.addLayer({
        id: "track-route-line",
        type: "line",
        source: "track-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ef4444", "line-width": 4 },
      });
      redraw();
    });
    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, [phase]);

  const distance = totalDistanceMeters(coords);

  const handleStop = async () => {
    await stopRef.current?.();
    stopRef.current = null;
    const isShort = distance < SHORT_ROUTE_METERS || elapsedMs < SHORT_ROUTE_SECONDS * 1000;
    if (isShort) {
      setShowShortRouteConfirm(true);
      return;
    }
    proceedToReview();
  };

  const proceedToReview = () => {
    setShowShortRouteConfirm(false);
    setReviewCoords(coordsRef.current);
    setPhase("reviewing");
  };

  const handleCancelTracking = () => setShowDiscardConfirm(true);

  const confirmDiscard = async () => {
    await stopRef.current?.().catch(() => {});
    stopRef.current = null;
    setShowDiscardConfirm(false);
    onCancel();
  };

  useEffect(() => {
    return () => {
      stopRef.current?.().catch(() => {});
    };
  }, []);

  if (phase === "permission") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8 px-4 text-center">
        <span className="text-4xl">🛰️</span>
        <h3 className="text-base font-semibold text-zinc-100">Track your route live</h3>
        <p className="text-sm text-zinc-400 max-w-xs">
          Frontline will record your GPS path as you clean, even if your phone locks or the app is in the
          background. This needs &quot;Always&quot; location access.
        </p>

        {permissionError && (
          <div className="w-full max-w-xs px-3 py-2.5 rounded-lg border border-orange-800/60 bg-orange-950/30 text-xs text-orange-300">
            {permissionError === "whenInUseOnly"
              ? "You granted \"While Using\" access, but background tracking needs \"Always\". Open Settings and change Location to Always."
              : "Location access is off for Frontline. Open Settings and allow Always location access to use Track Route."}
            <button
              type="button"
              onClick={() => openLocationSettings()}
              className="mt-2 w-full py-1.5 rounded-md bg-orange-900/60 hover:bg-orange-900 text-orange-200 text-xs font-medium transition-colors"
            >
              Open Settings
            </button>
          </div>
        )}

        <div className="flex gap-2 w-full max-w-xs mt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 active:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={beginTracking}
            disabled={requesting}
            className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {requesting ? "Requesting…" : permissionError ? "Try Again" : "Start Tracking"}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "tracking") {
    return (
      <div className="relative w-full h-[70vh] min-h-[420px]">
        <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden border border-zinc-700/50" />

        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-zinc-900/95 border border-red-800/60 rounded-lg text-xs text-zinc-100 shadow-xl whitespace-nowrap flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Recording route — {formatElapsed(elapsedMs)} · {formatDistance(distance)}
        </div>

        {trackingError && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 bg-orange-950/95 border border-orange-800 rounded-lg text-[11px] text-orange-300 shadow-xl whitespace-nowrap">
            {trackingError}
          </div>
        )}

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          <button
            type="button"
            onClick={handleCancelTracking}
            className="px-4 py-2.5 text-sm font-medium bg-zinc-900/95 hover:bg-zinc-800 active:bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg shadow-xl transition-colors touch-manipulation"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStop}
            className="px-4 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-500 active:bg-red-500 text-white rounded-lg shadow-xl transition-colors touch-manipulation"
          >
            Stop
          </button>
        </div>

        {showDiscardConfirm && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 rounded-lg">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 max-w-xs text-center">
              <p className="text-sm text-zinc-200 mb-3">Discard this route? Your recorded path will be lost.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="flex-1 py-2 rounded-md border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors"
                >
                  Keep Tracking
                </button>
                <button
                  type="button"
                  onClick={confirmDiscard}
                  className="flex-1 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {showShortRouteConfirm && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 rounded-lg">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 max-w-xs text-center">
              <p className="text-sm text-zinc-200 mb-3">
                This route looks really short — is this what you meant to capture?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowShortRouteConfirm(false)}
                  className="flex-1 py-2 rounded-md border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors"
                >
                  Keep Tracking
                </button>
                <button
                  type="button"
                  onClick={proceedToReview}
                  className="flex-1 py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition-colors"
                >
                  Use This Route
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // phase === "reviewing"
  return (
    <div className="flex flex-col gap-3">
      <RouteNodeEditor coordinates={reviewCoords} onChange={setReviewCoords} heightClassName="h-[50vh] min-h-[320px]" />
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
        <span>{reviewCoords.length} point{reviewCoords.length === 1 ? "" : "s"}</span>
        <span>{formatDistance(totalDistanceMeters(reviewCoords))}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 active:bg-zinc-800 transition-colors"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reviewCoords)}
          disabled={reviewCoords.length < 2}
          className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          Use This Route
        </button>
      </div>
    </div>
  );
}
