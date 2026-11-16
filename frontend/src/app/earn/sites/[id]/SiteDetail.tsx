"use client";

import { distanceLabel, limitLabel } from "@/lib/distance";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Camera, Trash2 } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note, TextInput } from "@/components/ui/fields";
import { Section } from "@/components/ui/PageShell";
import ShareButton from "@/components/ShareButton";
import AddToSiteButton from "@/components/sponsorships/AddToSiteButton";
import { claimRangeNote } from "@/components/map/useSponsoredMapLayer";
import MinBagsNote from "@/components/sponsorships/MinBagsNote";
import FieldAppNotice from "@/components/marketplace/FieldAppNotice";
import DailyLimitNote from "@/components/billing/DailyLimitNote";
import RetakeNotice, { isFrozen } from "@/components/marketplace/RetakeNotice";
import { useSiteTracker } from "@/lib/useJobTracker";
import { trackHint, LiveDistance, JobTimer } from "@/components/marketplace/CleanerFlow";
import StepTimer from "@/components/marketplace/StepTimer";
import ReportBlock from "@/components/marketplace/ReportBlock";
import PhotoGallery, { type GalleryPhoto } from "@/components/marketplace/PhotoGallery";
import { useFieldApp } from "@/lib/useFieldApp";
import { useCopy } from "@/lib/settingText";
import { scrollToTop } from "@/lib/scrollToTop";
import { ensureLoggedIn } from "@/lib/loginRedirect";
import { getPosition } from "@/lib/getPosition";
import { openDirections } from "@/lib/directions";
import { uploadToR2 } from "@/lib/uploadToR2";
import { minBagsShort, minLargeBags } from "@/lib/sponsoredBags";
import { describeRule, type PayoutRule } from "../../SponsoredSites";

interface SiteClaim {
  id: string;
  status: "claimed" | "in_progress";
  before_deadline_at: string | null;
  after_deadline_at: string | null;
  started_at?: string | null;
  sponsor_id?: string | null;
  photos?: GalleryPhoto[];
}
interface ClaimResult {
  status: string;
  amount_cents: number;
  paid_out_at: string | null;
}
interface Site {
  id: string;
  label: string;
  message: string | null;
  payout_rule: PayoutRule;
  remaining_cents: number;
  open_to_additions?: boolean;
  radius_meters: number | null;
  latitude: number;
  longitude: number;
  available: boolean;
  claimed_by_me: boolean;
  is_mine?: boolean;
  my_claim: SiteClaim | null;
  retake_at?: string | null;
  retake_reason?: "done" | "gave_up";
  early_access?: boolean;
  early_access_until?: string | null;
  early_access_locked?: boolean;
  scheduled?: boolean;
  opens_at?: string | null;
  plus_opens_at?: string | null;
}

const MiniMapPreview = dynamic(() => import("@/components/map/MiniMapPreview"), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-2xl bg-zinc-900" />,
});

const usd = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const minsLeft = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  return m <= 0 ? "expired" : `${m} min left`;
};
function errorText(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const p = JSON.parse(err.message);
    if (p && typeof p.detail === "string") return p.detail;
  } catch {
    // not JSON
  }
  return err.message || fallback;
}

export default function SiteDetail({ id, loggedIn }: { id: string; loggedIn: boolean }) {
  const copy = useCopy();
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { blocked } = useFieldApp();
  // Photos upload as soon as they are picked, so a slow connection shows up before you hit submit.
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [bags, setBags] = useState("");
  const [bagsAck, setBagsAck] = useState(false);
  const [canOverride, setCanOverride] = useState(false);
  const [trackMissing, setTrackMissing] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmBack, setConfirmBack] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const postedUrls = useRef(new Set<string>());
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);

  const addPhotos = async (picked: File[]) => {
    setError(null);
    setUploading((n) => n + picked.length);
    for (const file of picked) {
      try {
        const url = await uploadToR2(file);
        setPhotos((cur) => [...cur, { file, url }]);
      } catch (err) {
        setError(errorText(err, "A photo did not upload. Try it again."));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  // The popup's Add money link ends in #add-money: open the box and scroll to it. View details stays at the top.
  const [wantsAdd, setWantsAdd] = useState(false);
  const [away, setAway] = useState<number | null>(null);
  const tracker = useSiteTracker(id, site?.my_claim?.status === "in_progress");
  useEffect(() => {
    setWantsAdd(window.location.hash === "#add-money");
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sponsored/sites", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setSite(((await res.json()).sites as Site[]).find((s) => s.id === id) ?? null);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Could not load this site"));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  // What happened to your last finished claim here: waiting for review, or what you earned.
  const loadResult = useCallback(async () => {
    if (!loggedIn) return;
    try {
      const r = await fetch(`/api/sponsored/${id}/claim/result`, { cache: "no-store" });
      if (r.ok) setResult((await r.json()).result ?? null);
    } catch {
      // leave blank
    }
  }, [id, loggedIn]);
  useEffect(() => {
    loadResult();
  }, [loadResult]);

  // Distance from you, only when location is already allowed so opening the page never prompts.
  const siteLat = site?.latitude;
  const siteLng = site?.longitude;
  useEffect(() => {
    if (siteLat == null || siteLng == null) return;
    let cancelled = false;
    (async () => {
      try {
        const perm = await navigator.permissions?.query({ name: "geolocation" });
        if (!perm || perm.state !== "granted") return;
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { maximumAge: 120000, timeout: 6000 }),
        );
        const R = 6371000;
        const rad = (x: number) => (x * Math.PI) / 180;
        const dLat = rad(siteLat - pos.coords.latitude);
        const dLng = rad(siteLng - pos.coords.longitude);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(pos.coords.latitude)) * Math.cos(rad(siteLat)) * Math.sin(dLng / 2) ** 2;
        if (!cancelled) setAway(2 * R * Math.asin(Math.sqrt(a)));
      } catch {
        // leave blank
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteLat, siteLng]);

  const resetForm = () => {
    setPhotos([]);
    setBags("");
    setBagsAck(false);
    setCanOverride(false);
    setTrackMissing(false);
    setReason("");
    setConfirmBack(false);
    lastPos.current = null;
  };

  const act = async (step: "claim" | "before-photo" | "after-photo" | "release", override = false, trackOverride = false) => {
    if (!site) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!(await ensureLoggedIn())) return;
      const body: Record<string, unknown> = {};
      // Claiming works from anywhere (you get a travel window); only the photos need your location.
      if (step === "claim") {
        body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } else if (step !== "release") {
        if (override) {
          // Never wait on location a second time (it can hang for 25 seconds): reuse the fix from the first try, if any.
          if (lastPos.current) {
            body.latitude = lastPos.current.lat;
            body.longitude = lastPos.current.lng;
          }
        } else {
          try {
            const pos = await getPosition();
            lastPos.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            body.latitude = pos.coords.latitude;
            body.longitude = pos.coords.longitude;
          } catch (e) {
            // No location: offer the "continue anyway" path instead of a dead end.
            setCanOverride(true);
            throw e;
          }
        }
        if (override) {
          body.override = true;
          body.reason = reason.trim() || null;
        }
        if (trackOverride) {
          body.track_override = true;
          body.track_reason = reason.trim() || null;
        }
        if (step === "after-photo") body.bags_ack = bagsAck;
      }
      if (step === "before-photo" || step === "after-photo") {
        if (photos.length === 0) throw new Error("Take or choose at least one photo first.");
        if (step === "after-photo" && !bagsAck) throw new Error("Confirm that all the bags are in your finished photo.");
        if (step === "after-photo" && !(parseInt(bags, 10) >= minLargeBags(site.payout_rule))) {
          throw new Error(`This site needs at least ${minLargeBags(site.payout_rule)} large bag${minLargeBags(site.payout_rule) === 1 ? "" : "s"} collected to be paid.`);
        }
        if (step === "after-photo") await tracker.flush();
        const [first, ...extra] = photos;
        const postExtras = async () => {
          for (const { url } of extra) {
            // A retry after "finish anyway" must not add the same extra photo twice.
            if (postedUrls.current.has(url)) continue;
            postedUrls.current.add(url);
            const r = await fetch(`/api/sponsored/${site.id}/claim/photos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: step === "before-photo" ? "before" : "after", photo_url: url, latitude: body.latitude, longitude: body.longitude, override: override || undefined }),
            });
            if (!r.ok) throw new Error(await r.text());
          }
        };
        // Extra after photos go in while the claim is still open; extra before photos need the claim started first.
        if (step === "after-photo") await postExtras();
        body.photo_url = first.url;
        if (step === "after-photo" && bags) body.bags = parseInt(bags, 10);
        if (step === "before-photo") {
          const r0 = await fetch(`/api/sponsored/${site.id}/claim/before-photo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!r0.ok) throw new Error(await r0.text());
          // The site has started either way: a failed extra photo must never leave the page stuck on step 1.
          let extrasFailed = false;
          try {
            await postExtras();
          } catch {
            extrasFailed = true;
            extra.forEach(({ url }) => postedUrls.current.delete(url));
          }
          resetForm();
          await load();
          if (extrasFailed) setError("The site has started, but some extra photos did not save. Add them again below.");
          setNotice("Site started. Now clean it up, then take your after photos. Your finish timer is running.");
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }
      const res = await fetch(`/api/sponsored/${site.id}/${step === "claim" ? "claim" : `claim/${step}`}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (step === "after-photo") {
        // The "Waiting for review" card below already covers the normal case; only explain the cap.
        if (!(data.amount_cents > 0)) setNotice("Submitted, but you have hit a payout cap, so nothing was queued.");
      }
      resetForm();
      await load();
      await loadResult();
      if (step === "after-photo") window.scrollTo({ top: 0, behavior: "smooth" });
      // Claiming swaps the page to the active claim view, so start at the top of it.
      if (step === "claim") scrollToTop(document.querySelector("h1"));
    } catch (err) {
      const msg = errorText(err, "Something went wrong");
      if (/did not record your route/i.test(msg)) setTrackMissing(true);
      else if (step !== "claim" && step !== "release" && /location|at the sponsored site/i.test(msg)) setCanOverride(true);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const extend = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/sponsored/${id}/claim/extend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error(await res.text());
      await load();
      setNotice("Added more time. Your timer has been extended.");
    } catch (err) {
      setError(errorText(err, "Could not add time"));
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Link href="/earn" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Earn
    </Link>
  );
  const resultCard = result && (
    <div className="mb-3">
      {result.status === "pending_review" ? (
        <Note tone="good">Waiting for review. An admin is checking your photos{result.amount_cents > 0 ? `, then ${usd(result.amount_cents)} is yours` : ""}.</Note>
      ) : result.status === "rejected" ? (
        <Note tone="warn">Your last submission here was not approved, so nothing was paid.</Note>
      ) : result.amount_cents > 0 ? (
        <Note tone="good">
          You earned {usd(result.amount_cents)}.{result.paid_out_at ? " It has been sent to your Stripe account." : " It will be sent to your Stripe account."}
        </Note>
      ) : null}
    </div>
  );
  if (loading) return <>{back}<p className="text-sm text-zinc-400">Loading...</p></>;
  if (!site) {
    return (
      <>
        {back}
        {resultCard}
        <Note tone="warn">{error ?? "This site is not open right now, or it was already fully paid out."}</Note>
      </>
    );
  }

  const claim = site.my_claim;
  const canClaim = site.available && !site.early_access_locked && !claim && !site.is_mine;
  const status = claim
    ? { text: "You have this site", variant: "success" as const }
    : isFrozen(site.retake_at)
      ? { text: result?.status === "pending_review" ? "Waiting for review" : "Try again later", variant: "pending" as const }
    : site.available
      ? site.early_access_locked
        ? { text: "Plus members only for now", variant: "pending" as const }
        : { text: "Open to claim", variant: "success" as const }
      : { text: "Someone else is working it", variant: "neutral" as const };

  return (
    <>
      {back}
      {error && !(claim && (canOverride || trackMissing)) && <div className="mb-3"><Note tone="warn">{error}</Note></div>}
      {notice && <div className="mb-3"><Note tone="good">{notice}</Note></div>}
      {!claim && resultCard}
      {!claim && isFrozen(site.retake_at) && <div className="mb-3"><RetakeNotice what="site" done={site.retake_reason === "done"} until={site.retake_at!} /></div>}

      {claim && (
        <Section title="Your claim">
          <Card className="space-y-3 p-4">
            {claim.status === "claimed" && claim.before_deadline_at && (
              <StepTimer deadline={claim.before_deadline_at} label="to get there and start" />
            )}
            {claim.status === "in_progress" && claim.after_deadline_at && (
              <div className="space-y-2">
                <StepTimer deadline={claim.after_deadline_at} label="to finish and submit" />
                <Button variant="secondary" className="w-full" loading={busy} onClick={extend}>
                  I need more time (add an hour)
                </Button>
              </div>
            )}
            <ol className="space-y-1 text-sm text-zinc-300">
              <li className={claim.status === "claimed" ? "font-semibold text-zinc-100" : "text-zinc-500 line-through"}>
                1. Get to the site (within {limitLabel(site.radius_meters ?? 152)}) and take a starting photo ({claim.status === "claimed" ? minsLeft(claim.before_deadline_at) : "done"}).
              </li>
              <li className={claim.status === "in_progress" ? "font-semibold text-zinc-100" : "text-zinc-400"}>
                2. Clean it up, then take an after photo and enter your large bag count
                {claim.status === "in_progress" ? ` (${minsLeft(claim.after_deadline_at)})` : ""}.
              </li>
              <li className="text-zinc-400">3. An admin reviews the photos, then you are paid through Stripe.</li>
            </ol>
            <MinBagsNote rule={site.payout_rule} />
            {claim.photos && claim.photos.length > 0 && (
              <PhotoGallery
                photos={claim.photos}
                canEdit={claim.status === "in_progress" && !blocked}
                addKinds={["before"]}
                onAdd={async (kind, file) => {
                  const pos = await getPosition();
                  const url = await uploadToR2(file);
                  const res = await fetch(`/api/sponsored/${site.id}/claim/photos`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ kind, photo_url: url, latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
                  });
                  if (!res.ok) throw new Error(errorText(new Error(await res.text()), "Could not add the photo"));
                  await load();
                }}
                onRemove={async (pid) => {
                  const res = await fetch(`/api/sponsored/${site.id}/claim/photos/${pid}`, { method: "DELETE" });
                  if (!res.ok) throw new Error(errorText(new Error(await res.text()), "Could not remove the photo"));
                  await load();
                }}
              />
            )}
            {blocked && <FieldAppNotice what="site" />}
            {claim.status === "in_progress" && claim.started_at && <JobTimer startedAt={claim.started_at} what="site" />}
            {claim.status === "in_progress" && (
              <p className="text-xs text-zinc-500">
                <span className="font-semibold text-zinc-300">Route tracking:</span> {trackHint(tracker.state, "site")}
              </p>
            )}
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-500">
                <span className="font-semibold text-zinc-300">Location check:</span> we check your phone is within about {limitLabel(site.radius_meters ?? 152)} of the site when you submit photos.
              </p>
              <LiveDistance lat={site.latitude} lng={site.longitude} onSiteM={site.radius_meters ?? 152} what="site" />
            </div>
            <label className={`inline-flex min-h-11 items-center gap-2 rounded-2xl bg-zinc-800 px-4 text-sm font-bold text-zinc-100 touch-manipulation hover:bg-zinc-700 active:scale-[0.97] ${blocked ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
              <Camera className="h-4 w-4" aria-hidden="true" />
              {photos.length ? "Add more photos" : "Choose photos"}
              <input
                disabled={blocked}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (picked.length) void addPhotos(picked);
                }}
              />
            </label>
            {uploading > 0 && <p className="text-xs text-zinc-400">Uploading {uploading} photo{uploading === 1 ? "" : "s"}...</p>}
            {photos.length > 0 && (
              <ul className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <StagedThumb key={p.url} file={p.file} onRemove={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} />
                ))}
              </ul>
            )}
            {claim.status === "in_progress" && (
              <>
                <TextInput type="number" inputMode="numeric" min="1" step="1" placeholder="Large bags collected" aria-label="Large bags collected" value={bags} onChange={(e) => setBags(e.target.value)} />
                <label className="flex items-start gap-2 text-sm text-zinc-200">
                  <input type="checkbox" checked={bagsAck} onChange={(e) => setBagsAck(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-400" />
                  All the bags are in my finished photo
                </label>
              </>
            )}
            {(canOverride || trackMissing) && (
              <div className="space-y-2 rounded-2xl bg-amber-500/10 p-3 ring-1 ring-inset ring-amber-400/30">
                <p className="text-sm font-semibold text-amber-200">{error ?? "We could not confirm your location."}</p>
                <p className="text-xs text-zinc-300">
                  {trackMissing && !canOverride
                    ? "If your phone or signal failed, you can finish anyway and an admin will review it. Add a note if you like."
                    : "Move closer to the site and try again. If you really are at the site and your phone is wrong, you can continue anyway and an admin will review it. Add a note if you like."}
                </p>
                <TextInput placeholder="What went wrong? (optional)" aria-label="Reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                {canOverride && (
                  <Button className="w-full !bg-amber-400 !text-zinc-900 hover:!bg-amber-300" loading={busy} disabled={blocked || photos.length === 0} onClick={() => act(claim.status === "claimed" ? "before-photo" : "after-photo", true, trackMissing)}>
                    My location is wrong, continue anyway (we will review it)
                  </Button>
                )}
                {trackMissing && claim.status === "in_progress" && (
                  <Button variant="secondary" className="w-full" loading={busy} disabled={blocked || photos.length === 0} onClick={() => act("after-photo", canOverride, true)}>
                    My route was not recorded, finish anyway (we will review it)
                  </Button>
                )}
              </div>
            )}
            <Button
              className="w-full"
              disabled={blocked || photos.length === 0 || uploading > 0 || (claim.status === "in_progress" && !bagsAck)}
              loading={busy}
              onClick={() => act(claim.status === "claimed" ? "before-photo" : "after-photo")}
            >
              {claim.status === "claimed" ? "I am here: start site" : "Submit after photos"}
            </Button>
            {confirmBack ? (
              <div className="space-y-2 rounded-2xl bg-red-500/10 p-3 ring-1 ring-inset ring-red-500/30">
                <p className="text-sm text-zinc-200">
                  {copy("Back out of this site? You will have to wait {wait} before you can take it again. This is not a strike.")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="destructive" loading={busy} onClick={() => act("release")}>Yes, back out</Button>
                  <Button variant="secondary" onClick={() => setConfirmBack(false)}>Keep the site</Button>
                </div>
              </div>
            ) : (
              <Button variant="destructive" className="w-full" onClick={() => setConfirmBack(true)}>Back out of this site</Button>
            )}
            {claim.sponsor_id && <ReportBlock userId={claim.sponsor_id} siteLabel={site.label} role="sponsor" />}
          </Card>
        </Section>
      )}

      <div className="mb-4 overflow-hidden rounded-2xl ring-1 ring-inset ring-zinc-800">
        <MiniMapPreview lat={site.latitude} lng={site.longitude} interactive locate heightClassName="h-56" radiusM={site.radius_meters ?? 152} />
      </div>

      <Card className={`mb-4 space-y-3 p-4 ${site.is_mine ? "!ring-2 !ring-amber-300/70" : ""}`}>
        {site.is_mine && (
          <p className="rounded-xl bg-amber-300/15 px-3 py-2 text-sm font-bold text-amber-200 ring-1 ring-inset ring-amber-300/40">
            This is your sponsored site.
          </p>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-zinc-100">{site.label}</h1>
            {site.message && <p className="mt-1 text-sm text-zinc-400">&quot;{site.message}&quot;</p>}
          </div>
          <ShareButton variant="icon" content={{ title: site.label, text: `A cleanup site with ${usd(site.remaining_cents)} set aside.`, url: `/earn/sites/${site.id}` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={status.variant}>{status.text}</Badge>
          <span className="text-sm text-zinc-300">{usd(site.remaining_cents)} left</span>
        </div>
        <p className="mt-2 text-sm text-zinc-300">{describeRule(site.payout_rule)}</p>
        <p className="text-xs font-medium text-emerald-300">{minBagsShort(site.payout_rule)}</p>
        {site.scheduled ? (
          <p className="mt-2 text-xs text-violet-300">Scheduled. Plus members see it {when(site.plus_opens_at)}, everyone {when(site.opens_at)}.</p>
        ) : (
          site.early_access && (
            <p className="mt-2 text-xs text-violet-300">
              {site.early_access_locked
                ? `✦ Plus members only. Opens to everyone ${when(site.early_access_until)}.`
                : `✦ Plus members only until ${when(site.early_access_until)}.`}
            </p>
          )
        )}
        {loggedIn && <DailyLimitNote compact className="mt-3" />}
        {away != null && !claim && (
          <p className={`mt-1 text-xs font-medium ${away <= (site.radius_meters ?? 152) ? "text-emerald-300" : "text-amber-300"}`}>
            {away <= (site.radius_meters ?? 152)
              ? `You are at the site (${distanceLabel(away)} away).`
              : `You are ${distanceLabel(away)} away.`}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openDirections(site.latitude, site.longitude)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-zinc-800 px-4 text-sm font-semibold text-zinc-200 transition-[background-color,transform] duration-150 hover:bg-zinc-700 active:scale-[0.97] touch-manipulation"
          >
            <span aria-hidden="true">🧭</span>
            Get directions
          </button>
          <Link
            href={`/campaigns/trash-war?lat=${site.latitude}&lng=${site.longitude}&zoom=16`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-zinc-800 px-4 text-sm font-semibold text-zinc-200 transition-[background-color,transform] duration-150 hover:bg-zinc-700 active:scale-[0.97] touch-manipulation"
          >
            <span aria-hidden="true">📍</span>
            Show on map
          </Link>
        </div>
      </Card>

      {!claim && (
        <Section title="How claiming works">
          <Card className="space-y-2 p-4 text-sm text-zinc-300">
            <p>{copy("1. Claim the site from anywhere. You then have {arrive} to get there.")} {claimRangeNote(site.radius_meters)}</p>
            <p>{copy("2. Take a starting photo at the site within that time, or the claim expires. You then get {work} to finish.")}</p>
            <p>3. Clean up, then take an after photo and enter your large bag count.</p>
            <p>4. An admin reviews it and you are paid through Stripe.</p>
            <MinBagsNote rule={site.payout_rule} />
            <p className="text-xs text-zinc-500">You can hold one job or site at a time.</p>
            {loggedIn ? (
              canClaim && (
                <>
                  {isFrozen(site.retake_at) && <RetakeNotice what="site" done={site.retake_reason === "done"} until={site.retake_at!} />}
                  <Button className="w-full" disabled={isFrozen(site.retake_at)} loading={busy} onClick={() => act("claim")}>Claim this site</Button>
                </>
              )
            ) : (
              <Link href={`/login?next=${encodeURIComponent(`/earn/sites/${site.id}`)}`} className="block rounded-xl bg-emerald-400 px-4 py-3 text-center text-sm font-bold text-emerald-950">
                Log in or sign up to claim
              </Link>
            )}
          </Card>
        </Section>
      )}

      {site.open_to_additions && loggedIn && !claim && (
        <div id="add-money" className="scroll-mt-24">
          <Section title="Add money">
            <AddToSiteButton id={site.id} label={site.label} autoOpen={wantsAdd} successPath={`/earn/sites/${site.id}`} />
          </Section>
        </div>
      )}
    </>
  );
}

function StagedThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <li className="relative overflow-hidden rounded-xl bg-zinc-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="Selected photo" className="aspect-square w-full object-cover" />}
      <button
        type="button"
        aria-label="Remove photo"
        onClick={onRemove}
        className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-zinc-100 touch-manipulation active:scale-95"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}
