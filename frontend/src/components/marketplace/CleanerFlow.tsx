"use client";

import { useState } from "react";
import { usePhotoViewer } from "@/components/marketplace/usePhotoViewer";
import { Camera, Check, MapPin } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getPosition } from "@/lib/getPosition";
import { mk, usd, type Job } from "@/lib/marketplace";
import { uploadToR2 } from "@/lib/uploadToR2";

export type FlowPhoto = { id: string; kind: string; url: string; distance_m?: number | null; created_at: string };

type Coords = { latitude: number; longitude: number };

const ON_SITE_M = 150;

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
  const [problem, setProblem] = useState<string | null>(null);
  const [canOverride, setCanOverride] = useState(false);
  const [reason, setReason] = useState("");
  const base = `/jobs/${job.id}`;

  const before = photos.filter((p) => p.kind === "before");
  const after = photos.filter((p) => p.kind === "after");
  const arriving = job.status === "accepted";
  const working = job.status === "in_progress";
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

  async function locate(): Promise<Coords> {
    const p = await getPosition();
    return { latitude: p.coords.latitude, longitude: p.coords.longitude };
  }

  async function go(step: "start" | "complete", override = false) {
    setBusy(step);
    setProblem(null);
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
      await mk(`${base}/${step}`, { method: "POST", body: { ...(c ?? {}), override } });
      setCanOverride(false);
      await refresh();
    } catch (e) {
      const m = (e as Error).message;
      setProblem(m);
      setCanOverride(/job site|location/i.test(m));
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
            {usd(job.price_cents)} job price, minus {usd(job.platform_fee_cents)} platform fee. Payment is released.
          </p>
          <p className="text-xs text-zinc-500">Bank payouts turn on once Stripe Connect is live.</p>
        </Card>
      );
    }
    return null;
  }

  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{arriving ? "Step 1 of 2" : "Step 2 of 2"}</p>
        <p className="text-lg font-extrabold text-zinc-50">{arriving ? "Arrive and start" : "Finish up"}</p>
        {job.address_label && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
            <MapPin className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
            {job.address_label}
          </p>
        )}
      </div>

      <ol className="space-y-3">
        <Item done={arriving ? before.length > 0 : true} title="Before photo" hint="Show the site as you found it. Take it when you arrive.">
          {arriving && <Shot kind="before" busy={busy === "before"} count={before.length} onPick={(f) => capture("before", f)} />}
          <Thumbs list={before} />
        </Item>
        {working && (
          <Item done={after.length > 0} title="After photo" hint="Show the finished site. The customer sees this before paying.">
            <Shot kind="after" busy={busy === "after"} count={after.length} onPick={(f) => capture("after", f)} />
            <Thumbs list={after} />
          </Item>
        )}
        <Item
          done={false}
          title="Location check"
          hint={`We check your phone is within about ${ON_SITE_M} m of the job when you ${arriving ? "start" : "finish"}.`}
        />
      </ol>

      {problem && (
        <div role="alert" className="space-y-2 rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-100 ring-1 ring-inset ring-amber-400/20">
          <p>{problem}</p>
          {canOverride && (
            <>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why? (optional)"
                className="min-h-10 w-full rounded-xl bg-zinc-900 px-3 text-sm text-zinc-100 ring-1 ring-inset ring-zinc-700"
              />
              <button
                type="button"
                onClick={() => go(arriving ? "start" : "complete", true)}
                className="text-xs font-bold text-amber-300 underline underline-offset-2"
              >
                My location is wrong, continue anyway (we will review it)
              </button>
            </>
          )}
        </div>
      )}

      {arriving ? (
        <Button className="w-full" disabled={before.length === 0} loading={busy === "start"} onClick={() => go("start")}>
          I am here: start job
        </Button>
      ) : (
        <Button className="w-full" disabled={after.length === 0} loading={busy === "complete"} onClick={() => go("complete")}>
          Mark complete
        </Button>
      )}
    </Card>
  );
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

function Shot({ kind, busy, count, onPick }: { kind: string; busy: boolean; count: number; onPick: (f: File | undefined) => void }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl bg-zinc-800 px-4 text-sm font-bold text-zinc-100 touch-manipulation hover:bg-zinc-700 active:scale-[0.97]">
      <Camera className="h-4 w-4" aria-hidden="true" />
      {busy ? "Uploading..." : count ? "Add another" : `Take ${kind} photo`}
      <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => onPick(e.target.files?.[0])} />
    </label>
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
          {p.distance_m != null && (
            <span
              className={`pointer-events-none absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${p.distance_m <= ON_SITE_M ? "bg-emerald-400 text-emerald-950" : "bg-amber-400 text-amber-950"}`}
            >
              {p.distance_m <= ON_SITE_M ? "On site" : `${p.distance_m} m away`}
            </span>
          )}
        </li>
      ))}
    </ul>
    {viewer}
    </>
  );
}
