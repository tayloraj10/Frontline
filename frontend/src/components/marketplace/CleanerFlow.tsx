"use client";

import { distanceLabel, limitLabel } from "@/lib/distance";
import { useEffect, useState } from "react";
import LocalTime from "@/components/marketplace/LocalTime";
import StepTimer from "@/components/marketplace/StepTimer";
import { usePhotoViewer } from "@/components/marketplace/usePhotoViewer";
import { Camera, Check, MapPin } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getPosition } from "@/lib/getPosition";
import { haversineMeters } from "@/lib/nearbyPartners";
import { durationLabel, mk, usd, type Job } from "@/lib/marketplace";
import { useCategories } from "@/lib/categories";
import { uploadToR2 } from "@/lib/uploadToR2";
import FieldAppNotice from "@/components/marketplace/FieldAppNotice";
import { useFieldApp } from "@/lib/useFieldApp";
import { useJobTracker, type TrackerState } from "@/lib/useJobTracker";

export type FlowPhoto = { id: string; kind: string; url: string; distance_m?: number | null; created_at: string; late?: boolean; deleted_at?: string | null };

type Coords = { latitude: number; longitude: number };

const DEFAULT_ON_SITE_M = 152;

/**
 * The cleaner's path through an accepted job: arrive (before photo + location check), do the work,
 * finish (after photo + location check), then wait for the customer and get paid.
 * The server makes the final call on the location check; this just collects the evidence.
 */
export default function CleanerFlow({
  job,
  photos,
  refresh,
}: {
  job: Job;
  photos: FlowPhoto[];
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const { blocked } = useFieldApp();
  const [problem, setProblem] = useState<string | null>(null);
  const [canOverride, setCanOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [bagsAck, setBagsAck] = useState(false);
  const [bagsCount, setBagsCount] = useState("");
  const [trackMissing, setTrackMissing] = useState(false);
  const tracker = useJobTracker(job.id, job.status === "in_progress");
  const base = `/jobs/${job.id}`;
  const cats = useCategories();
  const needsBags = cats.needsBags(job.job_type);
  const photoRequired = cats.get(job.job_type)?.after_photo_required ?? true;

  const before = photos.filter((p) => p.kind === "before" && !p.deleted_at);
  const after = photos.filter((p) => p.kind === "after" && !p.deleted_at);
  const arriving = job.status === "accepted";
  const working = job.status === "in_progress";
  const onSiteM = job.on_site_m ?? DEFAULT_ON_SITE_M;
  const payout = job.cleaner_payout_cents ?? job.price_cents - job.platform_fee_cents;

  async function capture(kind: "before" | "after", file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    setProblem(null);
    try {
      const url = await uploadToR2(file, "marketplace");
      // The photo carries where it was taken so the customer and moderators can see it was on site.
      const c = await locate().catch(() => null);
      await mk(`${base}/photos`, { method: "POST", body: { kind, url, ...(c ?? {}) } });
      await refresh();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function captureAll(kind: "before" | "after", files: File[]) {
    for (const f of files) await capture(kind, f);
  }

  async function locate(): Promise<Coords> {
    const p = await getPosition();
    return { latitude: p.coords.latitude, longitude: p.coords.longitude };
  }

  async function go(step: "start" | "complete", override = false, trackOverride = false) {
    setBusy(step);
    setProblem(null);
    if (step === "complete") await tracker.flush();
    let c: Coords | null = null;
    try {
      c = await locate();
    } catch (e) {
      if (!override) {
        setProblem((e as Error).message);
        setCanOverride(true);
        setBusy(null);
        return;
      }
    }
    try {
      const extra =
        step === "complete" && needsBags
          ? { bags_ack: bagsAck, bags_count: bagsCount.trim() === "" ? null : Number(bagsCount) }
          : {};
      const trackExtra = step === "complete" && trackOverride ? { track_override: true, track_reason: reason.trim() || null } : {};
      await mk(`${base}/${step}`, { method: "POST", body: { ...(c ?? {}), override, ...extra, ...trackExtra } });
      setCanOverride(false);
      setTrackMissing(false);
      await refresh();
    } catch (e) {
      const m = (e as Error).message;
      setProblem(m);
      const noRoute = /did not record your route/i.test(m);
      setTrackMissing(noRoute);
      setCanOverride(!noRoute && /job site|location/i.test(m));
    } finally {
      setBusy(null);
    }
  }

  if (!arriving && !working) {
    if (job.status === "completed") {
      return (
        <Card className="space-y-2 border-sky-400/30 bg-sky-400/5">
          <p className="font-bold text-zinc-100">Waiting for the customer</p>
          <p className="text-sm text-zinc-300">
            They are checking your photos. Your {usd(payout)} releases when they confirm
            {job.release_after ? `, or on ${new Date(job.release_after).toLocaleDateString()} if they do not respond` : ""}.
          </p>
        </Card>
      );
    }
    if (job.status === "confirmed" || job.status === "released") {
      return (
        <Card className="space-y-1 border-emerald-400/30 bg-emerald-400/5">
          <p className="font-bold text-emerald-300">You earned {usd(payout)}</p>
          <p className="text-sm text-zinc-300">
            {job.fee_on_top
              ? `The full ${usd(job.price_cents)} job price is yours. The customer covered the service fee.`
              : `That is the ${usd(job.price_cents)} job price.`}{" "}
            Payment is on its way to your bank through Stripe.
          </p>
        </Card>
      );
    }
    return null;
  }

  return (
    <Card className="space-y-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{arriving ? "Step 1 of 2" : "Step 2 of 2"}</p>
            <p className="text-lg font-extrabold text-zinc-50">{arriving ? "Arrive and start" : "Finish up"}</p>
          </div>
          {arriving && job.arrive_by && (
            <StepTimer deadline={job.arrive_by} label="to arrive and start" startsAt={job.starts_at ?? job.window_start} />
          )}
        </div>
        {arriving && job.arrive_by && (
          <p className="mt-1 text-sm font-semibold text-amber-200">
            {(job.starts_at ?? job.window_start) ? "Scheduled job: be there and start by" : "Start by"} <LocalTime iso={job.arrive_by} />, or the job goes back on the board.
          </p>
        )}
        {job.address_label && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
            <MapPin className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
            {job.address_label}
          </p>
        )}
        {working && job.started_at && <JobTimer startedAt={job.started_at} />}
        {needsBags && job.bag_dropoff_ok && job.bag_dropoff_address && (
          <p className="mt-2 rounded-xl bg-emerald-400/10 p-2 text-sm text-emerald-100 ring-1 ring-inset ring-emerald-400/20">
            The customer says you can leave the full bags at: {job.bag_dropoff_address}
            {job.bag_dropoff_note ? `. ${job.bag_dropoff_note}` : ""}
          </p>
        )}
      </div>

      {blocked && <FieldAppNotice what="job" />}
      <ol className="space-y-3">
        <Item done={arriving ? before.length > 0 : true} title="Before photo" hint="Show the site as you found it. Take it when you arrive.">
          {arriving && <Shot kind="before" busy={busy === "before"} count={before.length} locked={blocked} onPick={(fs) => captureAll("before", fs)} />}
          <Thumbs list={before} />
        </Item>
        {working && (
          <Item done={after.length > 0} title="After photo" hint="Show the finished site. The customer sees this before paying.">
            <Shot kind="after" busy={busy === "after"} count={after.length} locked={blocked} onPick={(fs) => captureAll("after", fs)} />
            <Thumbs list={after} />
          </Item>
        )}
        {working && needsBags && (
          <li className="space-y-2">
            <label className="flex min-h-11 items-start gap-3 text-sm text-zinc-200 touch-manipulation">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-emerald-400"
                checked={bagsAck}
                onChange={(e) => setBagsAck(e.target.checked)}
              />
              <span>
                All the bags are in my finished photo
                <span className="block text-xs text-zinc-500">The customer relies on the photo to see everything you filled.</span>
              </span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={500}
              value={bagsCount}
              onChange={(e) => setBagsCount(e.target.value)}
              placeholder="How many bags? (optional)"
              className="min-h-11 w-full rounded-xl bg-zinc-900 px-3 text-sm text-zinc-100 ring-1 ring-inset ring-zinc-700"
            />
          </li>
        )}
        {working && (
          <Item done={tracker.state === "tracking"} title="Route tracking" hint={trackHint(tracker.state)} />
        )}
        <Item
          done={false}
          title="Location check"
          hint={`We check your phone is within about ${limitLabel(onSiteM)} of the job when you ${arriving ? "start" : "finish"}.`}
        >
          <LiveDistance lat={job.latitude} lng={job.longitude} onSiteM={onSiteM} />
        </Item>
      </ol>

      {problem && (
        <div role="alert" className="space-y-2 rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-100 ring-1 ring-inset ring-amber-400/20">
          <p>{problem}</p>
          {trackMissing && (
            <>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What happened? (optional)"
                className="min-h-11 w-full rounded-xl bg-zinc-900 px-3 text-sm text-zinc-100 ring-1 ring-inset ring-zinc-700"
              />
              <button
                type="button"
                onClick={() => go("complete", false, true)}
                className="inline-flex min-h-11 items-center text-xs font-bold text-amber-300 underline underline-offset-2"
              >
                My route was not recorded, finish anyway (we will review it)
              </button>
            </>
          )}
          {canOverride && (
            <>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why? (optional)"
                className="min-h-11 w-full rounded-xl bg-zinc-900 px-3 text-sm text-zinc-100 ring-1 ring-inset ring-zinc-700"
              />
              <button
                type="button"
                onClick={() => go(arriving ? "start" : "complete", true)}
                className="inline-flex min-h-11 items-center text-xs font-bold text-amber-300 underline underline-offset-2"
              >
                My location is wrong, continue anyway (we will review it)
              </button>
            </>
          )}
        </div>
      )}

      {arriving ? (
        <Button className="w-full" disabled={blocked || before.length === 0} loading={busy === "start"} onClick={() => go("start")}>
          I am here: start job
        </Button>
      ) : (
        <Button className="w-full" disabled={blocked || (photoRequired && after.length === 0) || (needsBags && !bagsAck)} loading={busy === "complete"} onClick={() => go("complete")}>
          Mark complete
        </Button>
      )}
    </Card>
  );
}

export function trackHint(s: TrackerState, what = "job"): string {
  switch (s) {
    case "tracking":
      return "Recording your route while you work. Only you and Frontline admins can see it. Keep the app open.";
    case "unsupported":
      return `Route tracking needs the Frontline app. Open this ${what} in the app on your phone to record your route.`;
    case "denied":
      return "Location access is off. Turn it on for Frontline in your phone settings so your route can be recorded.";
    case "error":
      return "We could not record your route. Check location access and signal.";
    default:
      return "Starting route tracking...";
  }
}

/** Running clock from arrival check-in; the final time is set by the server at the finished-photo submission. */
export function JobTimer({ startedAt, what = "job" }: { startedAt: string; what?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, (now - new Date(startedAt).getTime()) / 1000);
  return <p className="mt-1 text-sm font-semibold text-sky-200">Time on the {what}: {durationLabel(secs)}</p>;
}

function Item({ done, title, hint, children }: { done: boolean; title: string; hint: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-400 text-emerald-950" : "bg-zinc-800 text-zinc-500"}`}
        aria-hidden="true"
      >
        {done ? <Check className="h-4 w-4" /> : <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-bold text-zinc-100">{title}</p>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>
        {children}
      </div>
    </li>
  );
}

function Shot({ kind, busy, count, locked, onPick }: { kind: string; busy: boolean; count: number; locked?: boolean; onPick: (f: File[]) => void }) {
  return (
    <label className={`inline-flex min-h-11 ${locked ? "opacity-50 pointer-events-none" : ""} cursor-pointer items-center gap-2 rounded-2xl bg-zinc-800 px-4 text-sm font-bold text-zinc-100 touch-manipulation hover:bg-zinc-700 active:scale-[0.97]`}>
      <Camera className="h-4 w-4" aria-hidden="true" />
      {busy ? "Uploading..." : count ? "Add more photos" : `Choose ${kind} photos`}
      <input type="file" accept="image/*" multiple className="sr-only" disabled={busy || locked} onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; onPick(fs); }} />
    </label>
  );
}

/**
 * Live "how far am I" for the location check. Starts once the person taps (or right away when location is
 * already allowed), then keeps updating as they walk, so they can open the job early and watch it flip to on site.
 */
export function LiveDistance({ lat, lng, onSiteM, what = "job" }: { lat?: number | null; lng?: number | null; onSiteM: number; what?: string }) {
  const [on, setOn] = useState(false);
  const [dist, setDist] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((r) => r.state === "granted" && setOn(true))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!on || lat == null || lng == null || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setErr(null);
        setDist(Math.round(haversineMeters(p.coords.latitude, p.coords.longitude, lat, lng)));
      },
      () => setErr("Could not get your location. Check that it is allowed, then try again."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on, lat, lng, tick]);
  if (lat == null || lng == null) return null;
  return (
    <div className="space-y-1.5">
      {dist != null && (
        <p className={`text-sm font-bold ${dist <= onSiteM ? "text-emerald-300" : "text-amber-200"}`}>
          {dist <= onSiteM ? "You are on site" : `You are ${distanceLabel(dist)} from the ${what}. Get within ${limitLabel(onSiteM)}.`}
        </p>
      )}
      {err && <p className="text-xs text-amber-200">{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setDist(null);
            setErr(null);
            if (on) setTick((t) => t + 1);
            else setOn(true);
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-zinc-800 px-4 text-sm font-bold text-zinc-100 touch-manipulation hover:bg-zinc-700 active:scale-[0.97]"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {on ? "Recheck my location" : "Check my location"}
        </button>
        {on && <p className="text-xs text-zinc-500">Also updates as you move.</p>}
      </div>
    </div>
  );
}

function Thumbs({ list }: { list: FlowPhoto[] }) {
  const { open, viewer } = usePhotoViewer(list.map((p) => p.url));
  if (list.length === 0) return null;
  return (
    <>
    <ul className="grid grid-cols-4 gap-2">
      {list.map((p, i) => (
        <li key={p.id} className="relative overflow-hidden rounded-lg bg-zinc-900">
          <button type="button" onClick={() => open(i)} aria-label="Enlarge photo" className="block w-full touch-manipulation">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={`${p.kind} photo`} className="aspect-square w-full object-cover" />
          </button>
        </li>
      ))}
    </ul>
    {viewer}
    </>
  );
}
