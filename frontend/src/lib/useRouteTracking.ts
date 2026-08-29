"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestTrackingPermission, startRouteTracking, type TrackedPoint } from "@/lib/backgroundGeolocation";

const SHORT_ROUTE_METERS = 50;
const SHORT_ROUTE_SECONDS = 30;
const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000; // don't resume a session left stale for 6+ hours

// A freshly captured photo (unuploaded File) or a dev-mode sample / rehydrated-from-storage
// photo (already-hosted or data URL). Both carry their own independent lat/lng from the
// tracked point active at capture time. Uploading happens later, centrally, in
// ContributionPanel.handleSubmit.
export type CapturedRoutePhoto =
  | { kind: "captured"; file: File; lat: number; lng: number; previewUrl: string }
  | { kind: "uploaded"; url: string; lat: number; lng: number };

export function previewUrlFor(photo: CapturedRoutePhoto): string {
  return photo.kind === "captured" ? photo.previewUrl : photo.url;
}

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

export function totalDistanceMeters(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += distanceMeters(coords[i - 1], coords[i]);
  return total;
}

export type RouteTrackingPhase = "idle" | "permission" | "tracking" | "reviewing" | "confirmed";

type PersistedPhoto =
  | { kind: "captured"; dataUrl: string; lat: number; lng: number }
  | { kind: "uploaded"; url: string; lat: number; lng: number };

type PersistedSession = {
  phase: "tracking" | "reviewing" | "confirmed";
  startedAt: number;
  coords: [number, number][];
  photos: PersistedPhoto[];
  savedAt: number;
};

function storageKey(campaignId: string) {
  return `frontline:routeTracking:${campaignId}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function dataUrlToFile(dataUrl: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], "resumed-route-photo.jpg", { type: blob.type || "image/jpeg" });
}

/**
 * Owns the full lifecycle of a live GPS route-tracking session: permission, the
 * native location stream, elapsed/distance tracking, captured photos, and review
 * edits. Lifted out of TrackRouteScreen (which only renders whichever phase is
 * active) and up into ContributionPanel, which stays mounted for the whole
 * campaign-page lifetime, so a session survives the user navigating back to the
 * main map or accidentally dismissing the Track Route sheet. Also persists an
 * in-progress session to localStorage and resumes it on a fresh page load, for
 * the one case component state genuinely can't survive: the app process being
 * fully closed/killed.
 */
export function useRouteTracking(campaignId: string | null | undefined) {
  const [phase, setPhase] = useState<RouteTrackingPhase>("idle");
  const [permissionError, setPermissionError] = useState<"whenInUseOnly" | "denied" | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [reviewCoords, setReviewCoords] = useState<[number, number][]>([]);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [routePhotos, setRoutePhotos] = useState<CapturedRoutePhoto[]>([]);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [showShortRouteConfirm, setShowShortRouteConfirm] = useState(false);

  const coordsRef = useRef<[number, number][]>([]);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const campaignIdRef = useRef(campaignId);
  campaignIdRef.current = campaignId;

  const handlePoint = useCallback((point: TrackedPoint) => {
    const next: [number, number] = [point.longitude, point.latitude];
    coordsRef.current = [...coordsRef.current, next];
    setCoords(coordsRef.current);
  }, []);

  // startCoords: the campaign map's already-known current location, if any. Seeds the
  // route with an immediate first point rather than waiting on the native plugin's
  // ~30s polling interval for its first fix, so a pin drops the moment tracking starts.
  const beginTracking = useCallback(async (startCoords?: [number, number]) => {
    setRequesting(true);
    setPermissionError(null);
    try {
      const result = await requestTrackingPermission();
      if (result !== "granted") {
        setPermissionError(result === "whenInUseOnly" ? "whenInUseOnly" : "denied");
        return;
      }
      coordsRef.current = startCoords ? [startCoords] : [];
      setCoords(coordsRef.current);
      setRoutePhotos([]);
      setStartedAt(Date.now());
      setPhase("tracking");
      const handle = await startRouteTracking(handlePoint, (message) => setTrackingError(message));
      stopRef.current = handle.stop;
    } finally {
      setRequesting(false);
    }
  }, [handlePoint]);

  const openTracker = useCallback(() => {
    setPhase("permission");
    setPermissionError(null);
  }, []);

  const distance = totalDistanceMeters(coords);
  const hasEnoughPoints = coords.length >= 2;

  const proceedToReview = useCallback(() => {
    setShowShortRouteConfirm(false);
    setReviewCoords(coordsRef.current);
    setPhase("reviewing");
  }, []);

  const handleStop = useCallback(async () => {
    await stopRef.current?.();
    stopRef.current = null;
    const isShort = distance < SHORT_ROUTE_METERS || elapsedMs < SHORT_ROUTE_SECONDS * 1000;
    if (isShort) {
      setShowShortRouteConfirm(true);
      return;
    }
    proceedToReview();
  }, [distance, elapsedMs, proceedToReview]);

  // Pins the photo to the most recently received tracked point rather than firing a
  // fresh one-shot GPS fix, avoids shutter latency and extra permission surface, and
  // the ~30s polling stream is already accurate enough for icon placement on the map.
  const addRoutePhoto = useCallback(
    (file: File) => {
      const point = coordsRef.current[coordsRef.current.length - 1];
      if (!point) {
        setCaptureError("Keep tracking a moment before snapping a photo.");
        return;
      }
      // Record the photo's spot as its own route node. The ambient tracking interval
      // (30s+) may not tick again for a while, so without this a photo taken mid-interval
      // wouldn't get a vertex of its own to drag/remove independently in the review step.
      handlePoint({ latitude: point[1], longitude: point[0], timestamp: Date.now(), accuracy: 0 });
      setRoutePhotos((prev) => [
        ...prev,
        { kind: "captured", file, lat: point[1], lng: point[0], previewUrl: URL.createObjectURL(file) },
      ]);
    },
    [handlePoint],
  );

  const removeRoutePhoto = useCallback((index: number) => {
    setRoutePhotos((prev) => {
      const removed = prev[index];
      if (removed?.kind === "captured") URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Swaps in a new file at an existing photo's node, keeping its lat/lng so the
  // marker stays put on the route while just the image changes.
  const replaceRoutePhoto = useCallback((index: number, file: File) => {
    setRoutePhotos((prev) =>
      prev.map((p, i) => {
        if (i !== index) return p;
        if (p.kind === "captured") URL.revokeObjectURL(p.previewUrl);
        return { kind: "captured", file, lat: p.lat, lng: p.lng, previewUrl: URL.createObjectURL(file) };
      }),
    );
  }, []);

  const loadSampleRoute = useCallback((sampleCoords: [number, number][], samplePhotos: CapturedRoutePhoto[]) => {
    setReviewCoords(sampleCoords);
    setRoutePhotos(samplePhotos);
    setPhase("reviewing");
  }, []);

  const reset = useCallback(() => {
    stopRef.current?.().catch(() => {});
    stopRef.current = null;
    coordsRef.current = [];
    setPhase("idle");
    setPermissionError(null);
    setStartedAt(null);
    setElapsedMs(0);
    setCoords([]);
    setReviewCoords([]);
    setTrackingError(null);
    setRoutePhotos([]);
    setCaptureError(null);
    setShowShortRouteConfirm(false);
    if (campaignIdRef.current) {
      try {
        localStorage.removeItem(storageKey(campaignIdRef.current));
      } catch {
        // best-effort only
      }
    }
  }, []);

  const confirmDiscard = useCallback(async () => {
    await stopRef.current?.().catch(() => {});
    reset();
  }, [reset]);

  // Called on confirm, hands off {coordinates, photos} to the caller. Deliberately does NOT
  // reset() here: ContributeModal (which is not itself remount-safe — see its comment about
  // remounting fresh whenever mode goes back to "contribute") reads the confirmed route/photos
  // back out of this hook to rehydrate itself if a remount happens between confirming and the
  // user actually tapping the final Submit button. The caller must call reset() once the
  // contribution has actually been submitted (or the user explicitly discards it).
  const confirm = useCallback(
    (finalCoords: [number, number][]) => {
      setReviewCoords(finalCoords);
      setPhase("confirmed");
      return { coordinates: finalCoords, photos: routePhotos };
    },
    [routePhotos],
  );

  // Elapsed-time ticker while tracking, lives here (not TrackRouteScreen) so the chip
  // can keep showing a live elapsed time even while the user is back on the main map.
  useEffect(() => {
    if (phase !== "tracking" || startedAt === null) return;
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(interval);
  }, [phase, startedAt]);

  // Best-effort persistence so an in-progress route survives the app being fully
  // closed/killed (not just the modal being dismissed; that case is already handled
  // by this hook living in the always-mounted ContributionPanel).
  useEffect(() => {
    if (!campaignId) return;
    if (phase !== "tracking" && phase !== "reviewing" && phase !== "confirmed") return;
    if (startedAt === null) return;
    const activeCoords = phase === "tracking" ? coords : reviewCoords;
    let cancelled = false;
    (async () => {
      const photos: PersistedPhoto[] = await Promise.all(
        routePhotos.map(async (p) =>
          p.kind === "uploaded"
            ? p
            : { kind: "captured" as const, dataUrl: await fileToDataUrl(p.file), lat: p.lat, lng: p.lng },
        ),
      );
      if (cancelled) return;
      const payload: PersistedSession = { phase, startedAt, coords: activeCoords, photos, savedAt: Date.now() };
      try {
        localStorage.setItem(storageKey(campaignId), JSON.stringify(payload));
      } catch {
        // quota or storage unavailable, route tracking still works in-memory, just won't resume after a kill
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, phase, startedAt, coords, reviewCoords, routePhotos]);

  // On mount, resume a session left in progress when the app was fully closed.
  useEffect(() => {
    if (!campaignId) return;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey(campaignId));
    } catch {
      return;
    }
    if (!raw) return;
    (async () => {
      let saved: PersistedSession;
      try {
        saved = JSON.parse(raw!);
      } catch {
        return;
      }
      if (Date.now() - saved.savedAt > RESUME_MAX_AGE_MS) {
        try {
          localStorage.removeItem(storageKey(campaignId));
        } catch {
          // ignore
        }
        return;
      }
      const photos: CapturedRoutePhoto[] = await Promise.all(
        saved.photos.map(async (p) =>
          p.kind === "uploaded"
            ? p
            : { kind: "captured" as const, file: await dataUrlToFile(p.dataUrl), lat: p.lat, lng: p.lng, previewUrl: p.dataUrl },
        ),
      );
      coordsRef.current = saved.coords;
      setCoords(saved.coords);
      setReviewCoords(saved.coords);
      setRoutePhotos(photos);
      setStartedAt(saved.startedAt);
      setElapsedMs(Date.now() - saved.startedAt);
      setPhase(saved.phase);
      if (saved.phase === "tracking") {
        const handle = await startRouteTracking(handlePoint, (message) => setTrackingError(message));
        stopRef.current = handle.stop;
      }
    })();
    // Only ever run once on mount. This is a one-shot resume check, not a sync loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    phase,
    permissionError,
    requesting,
    startedAt,
    elapsedMs,
    coords,
    reviewCoords,
    trackingError,
    routePhotos,
    captureError,
    showShortRouteConfirm,
    distance,
    hasEnoughPoints,
    active: phase === "tracking" || phase === "reviewing" || phase === "confirmed",
    setReviewCoords,
    setCaptureError,
    setShowShortRouteConfirm,
    openTracker,
    beginTracking,
    handleStop,
    proceedToReview,
    addRoutePhoto,
    removeRoutePhoto,
    replaceRoutePhoto,
    loadSampleRoute,
    confirmDiscard,
    confirm,
    reset,
  };
}

export type RouteTrackingSession = ReturnType<typeof useRouteTracking>;
