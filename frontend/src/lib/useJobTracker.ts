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
const queueKey = (jobId: string) => `jobtrack:${jobId}`;

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
        const res = await mk<{ points: number }>(`/jobs/${jobId}/track`, {
          method: "POST",
          body: {
            points: batch.map((p) => ({
              latitude: p.latitude,
              longitude: p.longitude,
              accuracy: p.accuracy,
              recorded_at: new Date(p.timestamp).toISOString(),
            })),
          },
        });
        queue.current = queue.current.slice(batch.length);
        saveQueue(jobId, queue.current);
        setSent(res.points);
      }
    } catch {
      // keep the queue; the next tick retries
    } finally {
      flushing.current = false;
    }
  }, [jobId]);

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
