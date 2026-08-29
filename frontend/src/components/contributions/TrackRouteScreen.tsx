"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { openLocationSettings } from "@/lib/backgroundGeolocation";
import { type CapturedRoutePhoto, previewUrlFor, totalDistanceMeters, type RouteTrackingSession } from "@/lib/useRouteTracking";
import RouteNodeEditor from "./RouteNodeEditor";
import { CameraModal, mediaResultToFile } from "./photoCapture";
import { Camera } from "@capacitor/camera";
import { isNativePlatform } from "@/lib/capacitor";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl() {
  return `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`;
}

const isDevTool = process.env.NODE_ENV !== "production";

// A short walk around City Hall Park, NYC, dev-only stand-in for a real
// recorded route so the review/adjust screen can be styled without walking.
const SAMPLE_ROUTE_COORDS: [number, number][] = [
  [-74.0074, 40.7132],
  [-74.0068, 40.7127],
  [-74.006, 40.712],
  [-74.0052, 40.7117],
  [-74.0045, 40.7122],
  [-74.0043, 40.7131],
  [-74.005, 40.7138],
  [-74.006, 40.7141],
];

// Dev-only stand-in for in-tracking photo capture, pre-hosted URLs since there's
// no real camera capture to back them with sample Files.
const SAMPLE_ROUTE_PHOTOS: CapturedRoutePhoto[] = [
  { kind: "uploaded", url: "https://picsum.photos/seed/route-photo-1/400", lat: 40.7127, lng: -74.0068 },
  { kind: "uploaded", url: "https://picsum.photos/seed/route-photo-2/400", lat: 40.7122, lng: -74.0045 },
];

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

/**
 * Full-screen "Track Route" capture flow: request Always location permission,
 * record a live GPS path (including while backgrounded, via the custom
 * capacitor-background-geolocation-frontline plugin), then hand off to
 * RouteNodeEditor for a quick review/edit pass before confirming. iOS only;
 * requestTrackingPermission()/startRouteTracking() no-op on web.
 *
 * This component only renders whichever phase is active. The actual tracking
 * session (permission state, GPS stream, elapsed/distance, captured photos)
 * lives in `session`, a useRouteTracking() instance owned by ContributionPanel
 * (which stays mounted for the whole campaign page), so the session survives
 * this screen being unmounted when the user navigates back to the main map or
 * dismisses the sheet mid-track.
 */
export default function TrackRouteScreen({
  session,
  currentCoords,
  onConfirm,
  onCancel,
}: {
  session: RouteTrackingSession;
  // The campaign map's already-known current location, if any — used to seed the
  // route's first point immediately when tracking starts, instead of waiting on the
  // native plugin's first fix.
  currentCoords?: [number, number] | null;
  onConfirm: (coordinates: [number, number][], photos: CapturedRoutePhoto[]) => void;
  onCancel: () => void;
}) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showEncouragement, setShowEncouragement] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const coordsRef = useRef<[number, number][]>(session.coords);
  coordsRef.current = session.coords;

  const {
    phase,
    permissionError,
    requesting,
    elapsedMs,
    reviewCoords,
    trackingError,
    routePhotos,
    captureError,
    showShortRouteConfirm,
    distance,
    hasEnoughPoints,
  } = session;

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
    // Orange pin at the route's starting point, dropped once and left in place for
    // the whole session (distinct from the moving line, which tracks current position).
    if (c.length > 0 && !startMarkerRef.current) {
      startMarkerRef.current = new maplibregl.Marker({ color: "#f59e0b" }).setLngLat(c[0]).addTo(m);
    }
  };

  // Redraw as new points arrive (and once immediately on resume, if the map's
  // already up from a prior render of this effect's cleanup-then-recreate cycle).
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.coords]);

  // One-time nudge to take photos along the route, shown a few seconds into
  // tracking and auto-dismissed shortly after (or immediately on first capture).
  useEffect(() => {
    if (phase !== "tracking") return;
    const showTimer = setTimeout(() => setShowEncouragement(true), 4000);
    return () => clearTimeout(showTimer);
  }, [phase]);

  useEffect(() => {
    if (!showEncouragement) return;
    const hideTimer = setTimeout(() => setShowEncouragement(false), 6000);
    return () => clearTimeout(hideTimer);
  }, [showEncouragement]);

  // Map instance, created whenever this screen is mounted while tracking is active
  // (including when resuming after the user navigates back from the main map).
  useEffect(() => {
    if (phase !== "tracking" || !containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      center: coordsRef.current[coordsRef.current.length - 1] ?? [-74.006, 40.7128],
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
      startMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleCancelTracking = () => setShowDiscardConfirm(true);

  const confirmDiscard = async () => {
    setShowDiscardConfirm(false);
    await session.confirmDiscard();
    onCancel();
  };

  const handleTakeRoutePhoto = async () => {
    session.setCaptureError(null);
    if (!isNativePlatform()) {
      setShowCamera(true);
      return;
    }
    try {
      const result = await Camera.takePhoto({ quality: 90 });
      session.addRoutePhoto(await mediaResultToFile(result));
      setShowEncouragement(false);
    } catch (err) {
      if (err instanceof Error && err.message === "User cancelled photos app") return;
      console.error("Camera.takePhoto failed", err);
      session.setCaptureError("Couldn't add that photo, please try again.");
    }
  };

  const handleCameraCapture = (file: File) => {
    session.addRoutePhoto(file);
    setShowEncouragement(false);
  };

  if (phase === "permission" || phase === "idle") {
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
            onClick={() => {
              session.reset();
              onCancel();
            }}
            className="flex-1 py-2.5 rounded-lg border border-zinc-700 bg-zinc-900/60 text-zinc-300 text-sm font-medium backdrop-blur-sm shadow-elevation-3 transition-[background-color,transform] duration-150 hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] touch-manipulation"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => session.beginTracking(currentCoords ?? undefined)}
            disabled={requesting}
            className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-500 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-50 text-white text-sm font-medium shadow-elevation-3 transition-[background-color,transform] duration-150 touch-manipulation"
          >
            {requesting ? "Requesting…" : permissionError ? "Try Again" : "Start Tracking"}
          </button>
        </div>

        {isDevTool && (
          <button
            type="button"
            onClick={() => session.loadSampleRoute(SAMPLE_ROUTE_COORDS, SAMPLE_ROUTE_PHOTOS)}
            className="mt-1 text-[11px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
          >
            🧪 Load sample route (dev)
          </button>
        )}
      </div>
    );
  }

  if (phase === "tracking") {
    return (
      <div className="flex flex-col gap-0.5 pb-6">
        <div className="text-center text-[11px] font-bold text-amber-300 leading-tight px-2 py-1.5 rounded-md bg-amber-950/40 border border-amber-800/50">
          You can close this window, tracking keeps running · Location updates every 30s
        </div>

        <div className="relative w-full h-[45vh] min-h-[300px]">
          <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden border border-zinc-700/50" />

          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1">
            <div className="px-4 py-2 bg-zinc-900/95 border border-red-800/60 rounded-lg text-xs text-zinc-100 shadow-elevation-3 backdrop-blur-sm whitespace-nowrap flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Recording route, {formatElapsed(elapsedMs)} · {formatDistance(distance)}
            </div>
          </div>

          {trackingError && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 max-w-[85%] px-3 py-1.5 bg-orange-950/95 border border-orange-800 rounded-lg text-[11px] text-orange-300 shadow-elevation-3 backdrop-blur-sm text-center">
            {trackingError}
          </div>
        )}

        {showEncouragement && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 max-w-[85%] px-3 py-2 bg-zinc-900/95 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 shadow-elevation-3 backdrop-blur-sm text-center">
            📸 Snap a photo as you go, it&apos;ll drop a pin where you took it.
          </div>
        )}

        {captureError && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 max-w-[85%] px-3 py-1.5 bg-orange-950/95 border border-orange-800 rounded-lg text-[11px] text-orange-300 shadow-elevation-3 backdrop-blur-sm text-center">
            {captureError}
          </div>
        )}

        {routePhotos.length > 0 && (
          <div className="absolute bottom-16 left-0 right-0 z-10 flex gap-2 px-3 overflow-x-auto">
            {routePhotos.map((photo, i) => (
              <div key={i} className="relative flex-shrink-0">
                <img
                  src={previewUrlFor(photo)}
                  alt=""
                  className="w-12 h-12 rounded-md object-cover border-2 border-white shadow-elevation-3"
                />
                <button
                  type="button"
                  onClick={() => session.removeRoutePhoto(i)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-zinc-900 border border-zinc-600 text-zinc-300 text-[10px] leading-none flex items-center justify-center transition-transform duration-150 active:scale-[0.9] touch-manipulation"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          <button
            type="button"
            onClick={handleCancelTracking}
            className="px-4 py-2.5 text-sm font-medium bg-zinc-900/95 hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] border border-zinc-700 text-zinc-200 rounded-lg shadow-elevation-3 backdrop-blur-sm transition-[background-color,transform] duration-150 touch-manipulation"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTakeRoutePhoto}
            className="px-4 py-2.5 text-sm font-medium bg-zinc-900/95 hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] border border-zinc-700 text-zinc-200 rounded-lg shadow-elevation-3 backdrop-blur-sm transition-[background-color,transform] duration-150 touch-manipulation"
          >
            📷 Photo
          </button>
          <button
            type="button"
            onClick={session.handleStop}
            className="px-4 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-500 active:bg-red-500 active:scale-[0.97] text-white rounded-lg shadow-elevation-3 transition-[background-color,transform] duration-150 touch-manipulation"
          >
            Stop
          </button>
        </div>

        {showCamera && <CameraModal onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />}

        {showDiscardConfirm && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-lg">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 max-w-xs text-center shadow-elevation-3">
              <p className="text-sm text-zinc-200 mb-3">Discard this route? Your recorded path will be lost.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="flex-1 py-2 rounded-md border border-zinc-700 text-zinc-300 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-zinc-800 active:scale-[0.96] touch-manipulation"
                >
                  Keep Tracking
                </button>
                <button
                  type="button"
                  onClick={confirmDiscard}
                  className="flex-1 py-2 rounded-md bg-red-600 hover:bg-red-500 active:scale-[0.96] text-white text-xs font-medium transition-[background-color,transform] duration-150 touch-manipulation"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {showShortRouteConfirm && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-lg">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 max-w-xs text-center shadow-elevation-3">
              <p className="text-sm text-zinc-200 mb-3">
                {hasEnoughPoints
                  ? "This route looks really short, is this what you meant to capture?"
                  : "No route was recorded yet. Keep tracking to capture at least two points."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => session.setShowShortRouteConfirm(false)}
                  className="flex-1 py-2 rounded-md border border-zinc-700 text-zinc-300 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-zinc-800 active:scale-[0.96] touch-manipulation"
                >
                  Keep Tracking
                </button>
                {hasEnoughPoints && (
                  <button
                    type="button"
                    onClick={session.proceedToReview}
                    className="flex-1 py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 active:scale-[0.96] text-white text-xs font-medium transition-[background-color,transform] duration-150 touch-manipulation"
                  >
                    Use This Route
                  </button>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    );
  }

  // phase === "reviewing"
  return (
    <div className="flex flex-col gap-3">
      {routePhotos.length === 0 && (
        <div className="text-center text-xs font-medium text-amber-300 leading-tight px-3 py-2 rounded-md bg-amber-950/40 border border-amber-800/50">
          No photos were taken during tracking. Don&apos;t forget to add photos before you submit.
        </div>
      )}
      <RouteNodeEditor
        coordinates={reviewCoords}
        onChange={session.setReviewCoords}
        heightClassName="h-[50vh] min-h-[320px]"
        photos={routePhotos.map((p) => ({ lat: p.lat, lng: p.lng, previewUrl: previewUrlFor(p) }))}
        onRemovePhoto={session.removeRoutePhoto}
        onReplacePhoto={session.replaceRoutePhoto}
      />
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
        <span>{reviewCoords.length} point{reviewCoords.length === 1 ? "" : "s"}</span>
        <span>{formatDistance(totalDistanceMeters(reviewCoords))}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await session.confirmDiscard();
            onCancel();
          }}
          className="flex-1 py-2.5 rounded-lg border border-zinc-700 bg-zinc-900/60 text-zinc-300 text-sm font-medium backdrop-blur-sm shadow-elevation-3 transition-[background-color,transform] duration-150 hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] touch-manipulation"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={() => {
            const { coordinates, photos } = session.confirm(reviewCoords);
            onConfirm(coordinates, photos);
          }}
          disabled={reviewCoords.length < 2}
          className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-500 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-50 text-white text-sm font-medium shadow-elevation-3 transition-[background-color,transform] duration-150 touch-manipulation"
        >
          Use This Route
        </button>
      </div>
    </div>
  );
}
