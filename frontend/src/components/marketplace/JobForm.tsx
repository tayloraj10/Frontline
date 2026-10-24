"use client";

import { useState } from "react";
import { Camera, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select, TextArea, TextInput } from "@/components/ui/fields";
import { JOB_TYPE_LABELS, TIME_MODE_LABELS, mk, usd, type TimeMode } from "@/lib/marketplace";
import { uploadToR2 } from "@/lib/uploadToR2";
import AgreementAccept from "./AgreementAccept";
import JobLocationPicker, { EMPTY_PLACE, placeProblem, placeToPayload, type JobPlace } from "./JobLocationPicker";

const STEPS = ["What", "Where", "When", "Pay"] as const;

type Target = { user_id: string; username: string | null; rate_type: "hourly" | "fixed"; rate_cents: number | null };

const MODE_HELP: Record<TimeMode, string> = {
  specific: "An exact date and start time.",
  window: "Any time inside a date range. The cleaner picks the slot.",
  flexible: "Within the next few days. Best for low urgency work.",
};

const startOfDay = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const endOfDay = (d: string) => new Date(`${d}T23:59:00`).toISOString();

/**
 * One form for both directions: with `cleaner` it is a booking request to that person,
 * without it the job is posted to the open board. Money is held only once a cleaner accepts.
 */
const MAX_PHOTOS = 4;

export default function JobForm({
  cleaner,
  services,
  termsAccepted,
  flexibleMaxDays,
}: {
  cleaner?: Target;
  services: string[];
  termsAccepted: boolean;
  flexibleMaxDays: number;
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(termsAccepted);
  const [title, setTitle] = useState("");
  const [jobType, setJobType] = useState(services[0] ?? "litter");
  const [size, setSize] = useState<"" | "small" | "medium" | "large">("");
  const [description, setDescription] = useState("");
  const [place, setPlace] = useState<JobPlace>(EMPTY_PLACE);
  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<TimeMode>("window");
  const [startsAt, setStartsAt] = useState("");
  const [winStart, setWinStart] = useState("");
  const [winEnd, setWinEnd] = useState("");
  const [days, setDays] = useState(Math.min(7, flexibleMaxDays));
  const [priceType, setPriceType] = useState<"hourly" | "fixed">(cleaner?.rate_type ?? "fixed");
  const [price, setPrice] = useState(cleaner?.rate_cents ? String(cleaner.rate_cents / 100) : "");
  const [hazards, setHazards] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!accepted) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-400">Before you post or request a job, please accept the customer terms.</p>
        <AgreementAccept kind="customer" onAccepted={() => setAccepted(true)} />
      </div>
    );
  }

  function next() {
    setError(null);
    let problem: string | null = null;
    if (step === 0 && !title.trim()) problem = "Add a short title.";
    if (step === 1) problem = placeProblem(place);
    if (step === 2) {
      if (mode === "specific" && !startsAt) problem = "Pick a date and time.";
      if (mode === "window" && (!winStart || !winEnd || winEnd < winStart)) problem = "Pick a start and end date.";
    }
    if (problem) return setError(problem);
    setStep(step + 1);
  }

  async function submit() {
    setError(null);
    const dollars = Number(price);
    const where = placeProblem(place);
    if (where) return setError(where);
    if (!Number.isFinite(dollars) || dollars <= 0) return setError("Enter a price.");
    if (mode === "specific" && !startsAt) return setError("Pick a date and time.");
    if (mode === "window" && (!winStart || !winEnd || winEnd < winStart)) return setError("Pick a start and end date.");
    if (!hazards) return setError("Confirm the site safety check to continue.");
    setBusy(true);
    try {
      const job = await mk<{ id: string }>("/jobs", {
        method: "POST",
        body: {
          cleaner_id: cleaner?.user_id ?? null,
          title: title.trim(),
          description: description.trim(),
          job_type: jobType,
          size: size || null,
          hazards_ack: hazards,
          address_label: place.label.trim() || null,
          ...placeToPayload(place),
          time_mode: mode,
          starts_at: mode === "specific" ? new Date(startsAt).toISOString() : null,
          window_start: mode === "window" ? startOfDay(winStart) : null,
          window_end: mode === "window" ? endOfDay(winEnd) : null,
          flexible_days: mode === "flexible" ? days : null,
          price_type: priceType,
          price_cents: Math.round(dollars * 100),
          photos,
        },
      });
      router.push(`/marketplace/jobs/${job.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const room = MAX_PHOTOS - photos.length;
      const urls = await Promise.all(Array.from(files).slice(0, room).map((f) => uploadToR2(f, "marketplace")));
      setPhotos((cur) => [...cur, ...urls].slice(0, MAX_PHOTOS));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      {cleaner && (
        <Card padding="sm" className="text-sm text-zinc-300">
          Booking <span className="font-bold text-zinc-100">{cleaner.username ?? "this cleaner"}</span>
          {cleaner.rate_cents ? ` (${usd(cleaner.rate_cents)}${cleaner.rate_type === "hourly" ? "/hr" : " per job"})` : ""}.
          You are not charged until they accept.
        </Card>
      )}

      <div className="space-y-2">
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-emerald-400" : "bg-zinc-800"}`} />
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
      </div>

      {step === 0 && (
        <div className="space-y-5">
      <Field label="Title">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Clear litter along the lot fence" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type of work">
          <Select value={jobType} onChange={(e) => setJobType(e.target.value)}>
            {(services.length ? services : Object.keys(JOB_TYPE_LABELS)).map((s) => (
              <option key={s} value={s}>
                {JOB_TYPE_LABELS[s] ?? s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Size" optional>
          <Select value={size} onChange={(e) => setSize(e.target.value as typeof size)}>
            <option value="">Not sure</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </Select>
        </Field>
      </div>

      <Field label="Details" optional hint="What needs doing, access notes, anything the cleaner should know.">
        <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </Field>

      <Field label="Photos" optional hint="Show the cleaner what the site looks like now. Up to 4.">
        <div className="space-y-2">
          {photos.length > 0 && (
            <ul className="grid grid-cols-4 gap-2">
              {photos.map((u) => (
                <li key={u} className="relative overflow-hidden rounded-lg bg-zinc-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="Site photo" className="aspect-square w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setPhotos((cur) => cur.filter((x) => x !== u))}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-zinc-100 touch-manipulation"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < MAX_PHOTOS && (
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl bg-zinc-800 px-4 text-sm font-bold text-zinc-100 touch-manipulation hover:bg-zinc-700 active:scale-[0.97]">
              <Camera className="h-4 w-4" aria-hidden="true" />
              {uploading ? "Uploading..." : photos.length ? "Add more" : "Add photos"}
              <input type="file" accept="image/*" multiple className="sr-only" disabled={uploading} onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </Field>

        </div>
      )}

      {step === 1 && <JobLocationPicker value={place} onChange={setPlace} />}

      {step === 2 && (
      <div>
        <p className="mb-2 text-sm font-semibold text-zinc-200">When</p>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-zinc-900 p-1">
          {(["specific", "window", "flexible"] as TimeMode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-10 rounded-xl text-[13px] font-bold touch-manipulation transition-colors ${
                mode === m ? "bg-zinc-700 text-zinc-50 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {TIME_MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">{MODE_HELP[mode]}</p>
        <div className="mt-3">
          {mode === "specific" && (
            <TextInput type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} aria-label="Start date and time" />
          )}
          {mode === "window" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <TextInput type="date" value={winStart} onChange={(e) => setWinStart(e.target.value)} />
              </Field>
              <Field label="To">
                <TextInput type="date" value={winEnd} min={winStart} onChange={(e) => setWinEnd(e.target.value)} />
              </Field>
            </div>
          )}
          {mode === "flexible" && (
            <Field label="Within" hint={`Up to ${flexibleMaxDays} days. The request expires after that.`}>
              <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[3, 7, 10, flexibleMaxDays]
                  .filter((d, i, a) => d <= flexibleMaxDays && a.indexOf(d) === i)
                  .map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
              </Select>
            </Field>
          )}
        </div>
      </div>

      )}

      {step === 3 && (
        <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pay type">
          <Select value={priceType} onChange={(e) => setPriceType(e.target.value as "hourly" | "fixed")}>
            <option value="fixed">Fixed price</option>
            <option value="hourly">Hourly</option>
          </Select>
        </Field>
        <Field label={priceType === "hourly" ? "Rate ($/hr)" : "Price ($)"}>
          <TextInput inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="60" />
        </Field>
      </div>

      <label className="flex items-start gap-3 rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-100 ring-1 ring-inset ring-amber-400/20">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-emerald-400" checked={hazards} onChange={(e) => setHazards(e.target.checked)} />
        <span>
          I have the right to authorize this work, I described the site honestly, and there is no hazardous waste, sharps, biohazard
          or unsafe space involved.
        </span>
      </label>

        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        {step > 0 && (
          <Button variant="secondary" onClick={() => { setError(null); setStep(step - 1); }}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button className="flex-1" onClick={next}>
            Next
          </Button>
        ) : (
          <Button className="flex-1" loading={busy} onClick={submit}>
            {cleaner ? "Send booking request" : "Post to the job board"}
          </Button>
        )}
      </div>
    </div>
  );
}
