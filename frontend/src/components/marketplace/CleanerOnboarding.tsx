"use client";

import { useEffect, useState } from "react";
import { getPosition } from "@/lib/getPosition";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import ProgressBar from "@/components/ui/ProgressBar";
import { Card } from "@/components/ui/Card";
import { Field, Select, TextArea, TextInput } from "@/components/ui/fields";
import { JOB_TYPE_LABELS, mk, type MeStatus } from "@/lib/marketplace";
import Avatar from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import { uploadToR2 } from "@/lib/uploadToR2";
import AddressAutocomplete from "@/app/admin/AddressAutocomplete";
import AgreementAccept from "./AgreementAccept";
import { inNativeApp } from "@/lib/nativeApp";

const PROFILE_STATUS: Record<string, { label: string; tone: "success" | "pending" | "error" | "neutral"; note: string }> = {
  pending_review: { label: "Pending review", tone: "pending", note: "Your profile is being set up. You can take jobs, and we notify you when one is posted near you." },
  active: { label: "Active", tone: "success", note: "You can take open jobs at their posted price, and we notify you about new jobs near you." },
  paused: { label: "Paused", tone: "neutral", note: "Your profile is hidden for now." },
  suspended: { label: "Suspended", tone: "error", note: "Your profile has been suspended. Contact support if you think this is a mistake." },
};

export default function CleanerOnboarding({ initial }: { initial: MeStatus }) {
  const [me, setMe] = useState(initial);
  const p = me.cleaner_profile;

  const [headline, setHeadline] = useState(p?.headline ?? "");
  const [bio, setBio] = useState(p?.bio ?? "");
  const [services, setServices] = useState<string[]>(p?.services ?? []);
  const [rateType, setRateType] = useState<"hourly" | "fixed">("fixed");
  const [radius, setRadius] = useState(String(Math.round((p?.service_radius_km ?? 24) * 0.621371)));
  const [area, setArea] = useState(p?.area_label ?? "");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [languages, setLanguages] = useState((p?.languages ?? []).join(", "));
  const [years, setYears] = useState(p?.years_experience != null ? String(p.years_experience) : "");
  const [equipment, setEquipment] = useState((p?.equipment ?? []).join(", "));
  const [availability, setAvailability] = useState(p?.availability ?? "");
  const [prefSize, setPrefSize] = useState<string>(p?.preferred_size ?? "");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const url = await uploadToR2(file, "profiles");
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in again to update your photo.");
      const { error: e } = await supabase.schema("public").from("profiles").update({ avatar_url: url }).eq("id", auth.user.id);
      if (e) throw new Error(e.message);
      setMe((m) => ({ ...m, avatar_url: url }));
    } catch (e) {
      setPhotoError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function reload() {
    setMe(await mk<MeStatus>("/me"));
  }

  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  async function startPayouts() {
    setPayBusy(true);
    setPayError(null);
    try {
      const { url } = await mk<{ url: string }>("/payouts/onboard", { method: "POST", body: { from_app: inNativeApp() } });
      window.location.href = url;
    } catch (e) {
      setPayError((e as Error).message);
      setPayBusy(false);
    }
  }

  // Back from Stripe's hosted onboarding: ask Stripe where the account stands, then reload.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("payouts")) return;
    window.history.replaceState(null, "", window.location.pathname);
    mk("/payouts/status")
      .then(() => mk<MeStatus>("/me"))
      .then(setMe)
      .catch(() => {});
  }, []);

  const [locating, setLocating] = useState(false);

  async function pin() {
    setLocating(true);
    setError(null);
    try {
      const pos = await getPosition();
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setSearch("Current location");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get your location.");
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await mk("/cleaner-profile", {
        method: "PUT",
        body: {
          headline,
          bio,
          services,
          rate_type: rateType,
          rate_cents: p?.rate_cents ?? null,
          service_radius_km: Math.max(1, Math.round((Number(radius) || 15) / 0.621371)),
          area_label: area || null,
          languages: splitList(languages),
          years_experience: years.trim() === "" ? null : Number(years),
          equipment: splitList(equipment),
          availability: availability.trim() || null,
          preferred_size: prefSize || null,
          ...(coords ?? {}),
        },
      });
      await reload();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!me.cleaner_agreement_accepted) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">Before you create a profile, read and sign the independent cleaner agreement. It covers safety, insurance, and how payment works.</p>
        <AgreementAccept kind="cleaner" onAccepted={() => void reload()} />
      </div>
    );
  }

  const st = p ? PROFILE_STATUS[p.status] : null;

  const checklist = [
    { label: "Profile photo", done: !!me.avatar_url },
    { label: "Headline", done: headline.trim().length > 0 },
    { label: "About you", done: bio.trim().length >= 20 },
    { label: "Work you do", done: services.length > 0 },
    { label: "Location", done: !!coords || !!p?.area_label },
    { label: "Experience", done: years.trim() !== "" },
    { label: "Equipment", done: splitList(equipment).length > 0 },
    { label: "Availability", done: availability.trim().length > 0 },
    { label: "Payouts, ID and tax with Stripe", done: !!p?.payouts_enabled },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checklist.length) * 100);

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-bold text-zinc-100">Profile {pct}% complete</p>
          {pct === 100 && <Badge variant="success">Complete</Badge>}
        </div>
        <ProgressBar value={pct} label={`${pct}% complete`} />
        {pct < 100 && (
          <p className="text-sm text-zinc-400">
            Still to add: {checklist.filter((c) => !c.done).map((c) => c.label.toLowerCase()).join(", ")}. Fuller profiles get hired more.
          </p>
        )}
      </Card>
      {p?.status === "suspended" && (
        <div role="alert" className="space-y-2 rounded-2xl bg-red-500/10 p-4 ring-2 ring-inset ring-red-400/60">
          <p className="font-bold text-red-200">Your cleaner profile is suspended</p>
          <p className="text-sm text-red-100/80">
            You cannot take jobs while it is suspended. {me.strikes && me.strikes.items.length > 0
              ? `It happens at ${me.strikes.limit} strikes within ${me.strikes.window_days} days, and you have ${me.strikes.items.length}. The strikes are listed below.`
              : "An admin may have suspended it."}{" "}
            If you think this is a mistake, contact support to appeal.
          </p>
        </div>
      )}

      {p && st && (
        <Card className={`space-y-2 ${p.status === "suspended" ? "!ring-red-400/50" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-zinc-100">Profile status</p>
            <Badge variant={st.tone}>{st.label}</Badge>
          </div>
          <p className="text-sm text-zinc-400">{st.note}</p>
        </Card>
      )}

      {p && me.strikes && me.strikes.items.length > 0 && (
        <Card className="space-y-2 border-amber-400/30">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-amber-300">Your strikes</p>
            <Badge variant={p.status === "suspended" ? "error" : "pending"}>
              {me.strikes.items.length} of {me.strikes.limit}
            </Badge>
          </div>
          <p className="text-sm text-zinc-400">
            You get a strike when you take a job and do not start it in time, or back out after its start time. {me.strikes.limit} strikes within {me.strikes.window_days} days suspends your cleaner profile. Each strike drops off after {me.strikes.window_days} days.
          </p>
          <ul className="space-y-1.5 text-sm">
            {me.strikes.items.map((s, i) => (
              <li key={i} className="rounded-xl bg-zinc-900/60 p-2.5">
                <span className="font-semibold text-zinc-100">{s.kind === "no_show" ? "Did not start in time" : "Backed out after the start time"}</span>
                {s.job_title && <span className="text-zinc-300">: {s.job_title}</span>}
                <span className="block text-xs text-zinc-500">
                  {new Date(s.created_at).toLocaleDateString()}, drops off {new Date(s.expires_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {p && (
        <Card className={`space-y-3 ${p.payouts_enabled ? "" : "!ring-amber-400/40"}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-zinc-100">Payouts</p>
            <Badge variant={p.payouts_enabled ? "success" : "pending"}>{p.payouts_enabled ? "Ready" : "Setup needed"}</Badge>
          </div>
          <p className="text-sm text-zinc-400">
            {p.payouts_enabled
              ? "You are set up to get paid. Earnings are sent to your bank through Stripe after a customer confirms a job."
              : "Set up payouts with Stripe to take jobs. It takes a few minutes. Stripe verifies your ID and collects your tax details and bank account on its own pages. Frontline never sees or stores your ID images or full tax numbers."}
          </p>
          <p className="text-xs text-zinc-500">
            Tax forms such as a 1099 are delivered electronically. While you work a job in the mobile app, your route and time on site are recorded so the work can be verified.
          </p>
          {payError && <p role="alert" className="text-sm text-red-400">{payError}</p>}
          <Button variant={p.payouts_enabled ? "secondary" : "primary"} className="w-full" loading={payBusy} onClick={startPayouts}>
            {p.payouts_enabled ? "Update payout details" : "Set up payouts"}
          </Button>
        </Card>
      )}

      <Card className={`space-y-3 ${me.avatar_url ? "" : "!ring-amber-400/40"}`}>
        <div className="flex items-center gap-4">
          <Avatar avatarUrl={me.avatar_url} name={headline || "Me"} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-zinc-100">Profile photo (required)</p>
            <p className="text-sm text-zinc-400">A clear photo of your face. Customers see it before they trust you with their site.</p>
          </div>
        </div>
        {photoError && <p role="alert" className="text-sm text-red-400">{photoError}</p>}
        <label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-2xl bg-zinc-800 px-4 text-sm font-bold text-zinc-100 touch-manipulation hover:bg-zinc-700">
          {photoBusy ? "Uploading..." : me.avatar_url ? "Change photo" : "Add photo"}
          <input type="file" accept="image/*" className="sr-only" disabled={photoBusy} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
        </label>
      </Card>

      <Card className="space-y-4">
        <Field label="Headline" hint="One line customers see first.">
          <TextInput value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} />
        </Field>
        <Field label="About you" optional>
          <TextArea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1500} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Years of experience" optional>
            <TextInput inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, ""))} maxLength={2} />
          </Field>
          <Field label="Preferred job size" optional>
            <Select value={prefSize} onChange={(e) => setPrefSize(e.target.value)}>
              <option value="">No preference</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
              <option value="any">Any size</option>
            </Select>
          </Field>
        </div>
        <Field label="Languages" hint="Separate with commas." optional>
          <TextInput value={languages} onChange={(e) => setLanguages(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Equipment you bring" hint="Like grabbers, gloves, a truck. Separate with commas." optional>
          <TextInput value={equipment} onChange={(e) => setEquipment(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Usual availability" hint="Like weekday evenings and weekends." optional>
          <TextInput value={availability} onChange={(e) => setAvailability(e.target.value)} maxLength={200} />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-zinc-200">Work you do</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(JOB_TYPE_LABELS).map(([k, label]) => {
              const on = services.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setServices(on ? services.filter((s) => s !== k) : [...services, k])}
                  className={`min-h-11 rounded-full px-4 text-sm font-semibold touch-manipulation ${on ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40" : "bg-zinc-800 text-zinc-400"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field
          label="Where are you based out of?"
          hint="A general spot is fine, like your neighborhood. We use it to tell you about jobs near you. Customers never see it."
        >
          <AddressAutocomplete
            value={search}
            onChange={setSearch}
            onSelect={(a) => {
              setSearch(a.addressLine1 || search);
              setCoords({ latitude: a.lat, longitude: a.lng });
              setArea(a.city || a.addressLine1 || area);
            }}
            placeholder="Neighborhood, street or landmark"
          />
        </Field>
        <Button variant="secondary" className="w-full" loading={locating} onClick={pin}>
          {coords ? "Location set. Tap to update" : "Use my current location instead"}
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Area name" hint="Filled in from your location. Shown on your profile, like Brooklyn.">
            <TextInput value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Travel radius (miles)" hint="How far you will go">
            <TextInput inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} />
          </Field>
        </div>
        {coords && <p className="text-sm text-emerald-300">Location set. You will be notified about jobs within {Number(radius) || 15} miles.</p>}
        {!coords && p && !p.area_label && <p className="text-sm text-amber-300">Set your location to get job alerts.</p>}

        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-300">Saved.</p>}
        <Button className="w-full" loading={busy} disabled={!me.avatar_url || !headline.trim() || services.length === 0 || (!coords && !p?.area_label)} onClick={save}>
          {p ? "Save changes" : "Save and start taking jobs"}
        </Button>
      </Card>
    </div>
  );
}
