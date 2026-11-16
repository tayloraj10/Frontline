"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isTrackingSupported,
  requestTrackingPermission,
  startRouteTracking,
  type TrackedPoint,
} from "@/lib/backgroundGeolocation";
import { mk } from "@/lib/marketplace";

export type TrackerState = "idle" | "tracking" | "unsupported" | "denied" | "error";

const FLUSH_MS = 30_000;
const queueKey = (key: string) => key;

function loadQueue(jobId: string): TrackedPoint[] {
  try {
    const raw = localStorage.getItem(queueKey(jobId));
    return raw ? (JSON.parse(raw) as TrackedPoint[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(jobId: string, q: TrackedPoint[]) {
  try {
    if (q.length === 0) localStorage.removeItem(queueKey(jobId));
    else localStorage.setItem(queueKey(jobId), JSON.stringify(q.slice(-2000)));
  } catch {
    // storage unavailable: the in-memory queue still works for this session
  }
}

/**
 * Records the cleaner's route while a job is in progress. Native app only: the web cannot track in the
 * background. Points queue locally and upload in batches, so poor signal never loses the route.
 * `flush` sends whatever is queued (call it before marking the job complete).
 */
export function useJobTracker(jobId: string, active: boolean) {
  const send = useCallback(
    async (points: WirePoint[]) => (await mk<{ points: number }>(`/jobs/${jobId}/track`, { method: "POST", body: { points } })).points,
    [jobId],
  );
  return useRouteTracker(`jobtrack:${jobId}`, active, send);
}

/** Same tracker for a sponsored site claim; points go to the claim's own route table. */
export function useSiteTracker(sponsorshipId: string, active: boolean) {
  const send = useCallback(async (points: WirePoint[]) => {
    const res = await fetch(`/api/sponsored/${sponsorshipId}/claim/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
    if (!res.ok) throw new Error(await res.text());
    return ((await res.json()) as { points: number }).points;
  }, [sponsorshipId]);
  return useRouteTracker(`sitetrack:${sponsorshipId}`, active, send);
}

type WirePoint = { latitude: number; longitude: number; accuracy?: number | null; recorded_at: string };

function useRouteTracker(storeKey: string, active: boolean, send: (points: WirePoint[]) => Promise<number>) {
  const jobId = storeKey;
  const [state, setState] = useState<TrackerState>("idle");
  const [sent, setSent] = useState(0);
  const queue = useRef<TrackedPoint[]>([]);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (queue.current.length > 0) {
        const batch = queue.current.slice(0, 200);
        const total = await send(
          batch.map((p) => ({
            latitude: p.latitude,
            longitude: p.longitude,
            accuracy: p.accuracy,
            recorded_at: new Date(p.timestamp).toISOString(),
          })),
        );
        queue.current = queue.current.slice(batch.length);
        saveQueue(jobId, queue.current);
        setSent(total);
      }
    } catch {
      // keep the queue; the next tick retries
    } finally {
      flushing.current = false;
    }
  }, [jobId, send]);

  useEffect(() => {
    if (!active) return;
    let stop: (() => Promise<void>) | null = null;
    let cancelled = false;
    queue.current = loadQueue(jobId);

    (async () => {
      if (!isTrackingSupported()) {
        setState("unsupported");
        return;
      }
      const perm = await requestTrackingPermission().catch(() => "denied" as const);
      if (cancelled) return;
      if (perm === "denied" || perm === "unsupported") {
        setState(perm === "denied" ? "denied" : "unsupported");
        return;
      }
      try {
        const handle = await startRouteTracking(
          (p) => {
            queue.current.push(p);
            saveQueue(jobId, queue.current);
          },
          () => setState("error"),
        );
        if (cancelled) {
          await handle.stop();
          return;
        }
        stop = handle.stop;
        setState("tracking");
      } catch {
        setState("error");
      }
    })();

    const t = setInterval(() => void flush(), FLUSH_MS);
    void flush();
    return () => {
      cancelled = true;
      clearInterval(t);
      void stop?.();
    };
  }, [active, jobId, flush]);

  return { state, sent, flush };
}
