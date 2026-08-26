"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BusinessLocationMapPicker from "@/app/admin/BusinessLocationMapPicker";
import AddressAutocomplete from "@/app/admin/AddressAutocomplete";
import { createCleanupEvent, updateCleanupEvent } from "@/lib/cleanupEvents";
import RoutePicker from "@/components/map/RoutePicker";
import CohostGroupPicker from "@/components/cleanups/CohostGroupPicker";
import type { RouteLineString } from "@/lib/cleanupRoutes";
import { GuidedStepper, StepperNav, ViewModeToggle, type GuidedStep } from "@/components/ui/GuidedStepper";

const hostEventSteps: GuidedStep[] = [
  { key: "basics", label: "Basics" },
  { key: "schedule", label: "Schedule & Logging" },
  { key: "location", label: "Logistics & Location" },
  { key: "photo", label: "Cover photo" },
];

const inputCls = "w-full min-h-11 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500";

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed?.detail) && typeof parsed.detail[0]?.msg === "string") {
      return parsed.detail[0].msg.replace(/^Value error,\s*/, "");
    }
  } catch {
    // not JSON, fall through to generic fallback
  }
  return fallback;
}

export default function CreateCleanupEventForm({
  groupId,
  groupSlug,
  campaignId,
  organizerUserId,
  mode = "create",
  cleanupId,
  initialValues,
  initialCohostGroupIds = [],
}: {
  groupId: string;
  groupSlug: string;
  campaignId?: string;
  organizerUserId: string;
  mode?: "create" | "edit";
  cleanupId?: string;
  initialValues?: {
    title: string;
    description: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    lat: number;
    lng: number;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    maxAttendees: number | null;
    externalLink: string | null;
    imageUrl: string | null;
    route: RouteLineString | null;
    loggingMode?: "organizer_total" | "individual";
  };
  initialCohostGroupIds?: string[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [scheduledStart, setScheduledStart] = useState(toDatetimeLocal(initialValues?.scheduledStart ?? null));
  const [scheduledEnd, setScheduledEnd] = useState(toDatetimeLocal(initialValues?.scheduledEnd ?? null));
  const [lat, setLat] = useState<number | null>(initialValues?.lat ?? null);
  const [lng, setLng] = useState<number | null>(initialValues?.lng ?? null);
  const [addressLine1, setAddressLine1] = useState(initialValues?.addressLine1 ?? "");
  const [city, setCity] = useState(initialValues?.city ?? "");
  const [state, setState] = useState(initialValues?.state ?? "");
  const [postalCode, setPostalCode] = useState(initialValues?.postalCode ?? "");
  const [country, setCountry] = useState(initialValues?.country ?? "");
  const [maxAttendees, setMaxAttendees] = useState(initialValues?.maxAttendees ? String(initialValues.maxAttendees) : "");
  const [externalLink, setExternalLink] = useState(initialValues?.externalLink ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(initialValues?.imageUrl ?? null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteLineString | null>(initialValues?.route ?? null);
  const [showRoutePicker, setShowRoutePicker] = useState(!!initialValues?.route);
  const hadInitialRoute = !!initialValues?.route;
  const [cohostGroupIds, setCohostGroupIds] = useState<string[]>(initialCohostGroupIds);
  const [loggingMode, setLoggingMode] = useState<"organizer_total" | "individual">(initialValues?.loggingMode ?? "organizer_total");
  const [viewMode, setViewMode] = useState<"guided" | "full">(() => {
    if (typeof window === "undefined") return "guided";
    return localStorage.getItem("frontline:host-event-view-mode") === "full" ? "full" : "guided";
  });
  const changeViewMode = (mode: "guided" | "full") => {
    setViewMode(mode);
    localStorage.setItem("frontline:host-event-view-mode", mode);
  };
  const [guidedStep, setGuidedStep] = useState(0);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const endBeforeStart = !!scheduledEnd && !!scheduledStart && new Date(scheduledEnd) <= new Date(scheduledStart);

  const canSubmit = !!title.trim() && !!scheduledStart && lat !== null && lng !== null && !endBeforeStart;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || lat === null || lng === null) return;
    if (endBeforeStart) {
      setError("End time must be after the start time.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode === "edit" && cleanupId) {
        await updateCleanupEvent({
          cleanupId,
          organizerUserId,
          title,
          description,
          imageFile,
          scheduledStart: new Date(scheduledStart).toISOString(),
          scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
          latitude: lat,
          longitude: lng,
          addressLine1: addressLine1.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          postalCode: postalCode.trim() || null,
          country: country.trim() || null,
          maxAttendees: maxAttendees.trim() ? Number(maxAttendees) : null,
          externalLink: externalLink.trim() || null,
          route,
          clearRoute: hadInitialRoute && !route,
          cohostGroupIds,
          loggingMode,
        });
        router.push(`/cleanup-events/${cleanupId}`);
      } else {
        if (!campaignId) {
          setError("The Trash War campaign isn't available right now. Please try again later.");
          setLoading(false);
          return;
        }
        await createCleanupEvent({
          campaignId,
          groupId,
          organizerUserId,
          title,
          description,
          imageFile,
          scheduledStart: new Date(scheduledStart).toISOString(),
          scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
          latitude: lat,
          longitude: lng,
          addressLine1: addressLine1.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          postalCode: postalCode.trim() || null,
          country: country.trim() || null,
          maxAttendees: maxAttendees.trim() ? Number(maxAttendees) : null,
          externalLink: externalLink.trim() || null,
          route,
          cohostGroupIds,
          loggingMode,
        });
        router.push(`/groups/${groupSlug}`);
      }
      router.refresh();
    } catch (err) {
      setError(extractErrorMessage(err, `Couldn't ${mode === "edit" ? "save" : "create"} the event. Please try again.`));
      setLoading(false);
    }
  };

  const basicsSection = (
    <>
      <CohostGroupPicker
        primaryGroupId={groupId}
        value={cohostGroupIds}
        onChange={setCohostGroupIds}
      />

      <div className="space-y-1">
        <label className="text-xs text-zinc-500">Title</label>
        <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. Riverside Park Cleanup" />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-zinc-500">Description</label>
        <textarea className={`${inputCls} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
      </div>
    </>
  );

  const scheduleSection = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Starts</label>
          <input type="datetime-local" className={inputCls} value={scheduledStart} onChange={e => setScheduledStart(e.target.value)} required />
          <p className="text-[11px] text-zinc-600">Tap outside the calendar to confirm your selection.</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Ends</label>
          <input
            type="datetime-local"
            className={inputCls}
            value={scheduledEnd}
            min={scheduledStart || undefined}
            onChange={e => setScheduledEnd(e.target.value)}
            aria-invalid={endBeforeStart}
          />
          {!scheduledEnd && (
            <p className="text-[11px] text-zinc-600">If left blank, check-in stays open until 2 hours after the start time.</p>
          )}
          {endBeforeStart && (
            <p className="text-[11px] text-red-400">
              That end time is before the start time ({new Date(scheduledStart).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}). Pick an end time after the start.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-zinc-500">How should cleanups get logged?</label>
        <select
          className={inputCls}
          value={loggingMode}
          onChange={(e) => setLoggingMode(e.target.value as "organizer_total" | "individual")}
        >
          <option value="organizer_total">Organizer logs team total (recommended)</option>
          <option value="individual">Attendees self-log individually</option>
        </select>
        <p className="text-xs text-zinc-400">
          {loggingMode === "organizer_total"
            ? "You enter the combined haul once everyone's done; points get split across attendees."
            : "Attendees self-log from the map near the event; no team total needed."}
        </p>
      </div>
    </>
  );

  const locationSection = (
    <>
      <div className="space-y-1">
        <label className="text-xs text-zinc-500">RSVP limit (optional)</label>
        <input
          type="number"
          min={1}
          className={inputCls}
          value={maxAttendees}
          onChange={(e) => setMaxAttendees(e.target.value.replace(/^0+(?=\d)/, ""))}
          placeholder="No limit"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-zinc-500">Event link (optional)</label>
        <input
          type="url"
          className={inputCls}
          value={externalLink}
          onChange={(e) => setExternalLink(e.target.value)}
          placeholder="https://... (site, waiver form, sign-up sheet)"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-zinc-500">Street address</label>
        <AddressAutocomplete
          value={addressLine1}
          onChange={setAddressLine1}
          onSelect={(s) => {
            setAddressLine1(s.addressLine1);
            setCity(s.city);
            setState(s.state);
            setPostalCode(s.postalCode);
            setCountry(s.country);
            setLat(s.lat);
            setLng(s.lng);
          }}
          placeholder="Search for an address..."
        />
        <BusinessLocationMapPicker lat={lat} lng={lng} onChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }} locationNoun="event" />
        <div className="grid grid-cols-2 gap-4 pt-1">
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">City</label>
            <input className={inputCls} value={city} onChange={e => setCity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">State</label>
            <input className={inputCls} value={state} onChange={e => setState(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Postal code</label>
            <input className={inputCls} value={postalCode} onChange={e => setPostalCode(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Country</label>
            <input className={inputCls} value={country} onChange={e => setCountry(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={showRoutePicker}
            onChange={(e) => {
              setShowRoutePicker(e.target.checked);
              if (!e.target.checked) setRoute(null);
            }}
          />
          Add a cleanup route (optional)
        </label>
        {showRoutePicker && lat !== null && lng !== null && (
          <RoutePicker
            centerLat={lat}
            centerLng={lng}
            initialCoordinates={route?.coordinates ?? null}
            onChange={(coords) => setRoute(coords ? { type: "LineString", coordinates: coords } : null)}
          />
        )}
        {showRoutePicker && (lat === null || lng === null) && (
          <p className="text-[11px] text-zinc-600">Set the event location above first, then draw the route.</p>
        )}
      </div>
    </>
  );

  const photoSection = (
    <>
      <div className="space-y-1">
        <label className="text-xs text-zinc-500">Cover photo (optional)</label>
        <p className="text-[11px] text-zinc-600">Shown at the top of the event page. This is not a photo from the cleanup itself.</p>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleImageChange}
          className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600 active:file:bg-zinc-600 transition-colors duration-150"
        />
        {imagePreview && (
          <div className="mt-2 flex flex-wrap gap-2">
            <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-zinc-700 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  setImagePreview(null);
                  if (imageInputRef.current) imageInputRef.current.value = "";
                }}
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded bg-black/70 text-white text-xs leading-none"
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  const hostEventStepSections = [basicsSection, scheduleSection, locationSection, photoSection];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ViewModeToggle viewMode={viewMode} onChange={changeViewMode} />

      {viewMode === "guided" ? (
        <>
          <GuidedStepper steps={hostEventSteps} activeIndex={guidedStep} onJump={setGuidedStep} />
          <div className="space-y-4">{hostEventStepSections[guidedStep]}</div>
          <StepperNav
            activeIndex={guidedStep}
            count={hostEventSteps.length}
            accent="emerald"
            onPrev={() => setGuidedStep((s) => Math.max(0, s - 1))}
            onNext={() => setGuidedStep((s) => Math.min(hostEventSteps.length - 1, s + 1))}
          />
        </>
      ) : (
        <>
          {basicsSection}
          {scheduleSection}
          {locationSection}
          {photoSection}
        </>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {(viewMode === "full" || guidedStep === hostEventSteps.length - 1) && (
        <div className={`flex gap-2 ${viewMode === "guided" ? "pt-3 mt-1 border-t border-zinc-800" : ""}`}>
          <button
            type="button"
            onClick={() => router.push(mode === "edit" && cleanupId ? `/cleanup-events/${cleanupId}` : `/groups/${groupSlug}`)}
            className="flex-1 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="flex-1 py-2 text-sm bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-600 active:scale-[0.97] disabled:active:scale-100 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-medium transition-[background-color,transform] duration-150 touch-manipulation"
          >
            {mode === "edit" ? (loading ? "Saving…" : "Save Changes") : (loading ? "Creating…" : "Create Event")}
          </button>
        </div>
      )}
    </form>
  );
}
