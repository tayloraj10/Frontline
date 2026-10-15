"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BusinessLocationMapPicker from "@/app/admin/BusinessLocationMapPicker";
import AddressAutocomplete from "@/app/admin/AddressAutocomplete";
import { createCleanupEvent, updateCleanupEvent } from "@/lib/cleanupEvents";
import { createClient } from "@/lib/supabase/client";
import RoutePicker from "@/components/map/RoutePicker";
import CohostGroupPicker from "@/components/cleanups/CohostGroupPicker";
import NearbyPartnersPanel from "@/components/cleanups/NearbyPartnersPanel";
import { useNearbyPartners } from "@/lib/nearbyPartners";
import type { RouteLineString } from "@/lib/cleanupRoutes";
import type { FlowStep as GuidedStep } from "@/components/ui/FlowSheet";
import { FlowFooter } from "@/components/ui/FlowSheet";

const hostEventStepsBase: GuidedStep[] = [
  { key: "basics", label: "Basics" },
  { key: "schedule", label: "Schedule & Logging" },
  { key: "logistics", label: "Logistics" },
  { key: "location", label: "Location" },
];
const hostEventStepPartners: GuidedStep = { key: "partners", label: "Nearby Partners" };
const hostEventStepPhoto: GuidedStep = { key: "photo", label: "Cover photo" };

const inputCls = "w-full min-h-12 rounded-2xl bg-zinc-800 px-4 py-3 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 ring-1 ring-inset ring-white/5 focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-shadow";

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
  const [guidedStep, setGuidedStep] = useState(0);
  const [locating, setLocating] = useState(false);
  const [showAddressDetails, setShowAddressDetails] = useState(false);
  const { partners: nearbyPartners } = useNearbyPartners(lat, lng, undefined, undefined, route?.coordinates);
  const hasNearbyPartners = nearbyPartners.length > 0;
  const [selectedOfferIds, setSelectedOfferIds] = useState<string[]>([]);
  const toggleOfferId = (offerId: string) => {
    setSelectedOfferIds((prev) => (prev.includes(offerId) ? prev.filter((id) => id !== offerId) : [...prev, offerId]));
  };
  const hostEventSteps: GuidedStep[] = hasNearbyPartners
    ? [...hostEventStepsBase, hostEventStepPartners, hostEventStepPhoto]
    : [...hostEventStepsBase, hostEventStepPhoto];

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const endBeforeStart = !!scheduledEnd && !!scheduledStart && new Date(scheduledEnd) <= new Date(scheduledStart);

  const canSubmit = !!title.trim() && !!scheduledStart && lat !== null && lng !== null && !endBeforeStart;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
        const created = await createCleanupEvent({
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
        if (selectedOfferIds.length > 0) {
          const supabase = createClient();
          const allOffers = nearbyPartners.flatMap((p) => p.eventOffers);
          await supabase
            .schema("public")
            .from("cleanup_event_offers")
            .insert(selectedOfferIds.map((offer_id) => ({
              cleanup_id: created.id,
              offer_id,
              added_by: organizerUserId,
              max_redemptions: allOffers.find((o) => o.id === offer_id)?.event_redemption_limit ?? null,
            })));
          const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
          for (const offer_id of selectedOfferIds) {
            fetch(`${fastapiUrl}/api/partners/offers/${offer_id}/events/${created.id}/notify-attachment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ organizer_user_id: organizerUserId }),
            }).catch(() => {});
          }
        }
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

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">Title</label>
        <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. Riverside Park Cleanup" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">Description</label>
        <textarea className={`${inputCls} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
      </div>
    </>
  );

  const scheduleSection = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-zinc-200">Starts</label>
          <input type="datetime-local" className={inputCls} value={scheduledStart} onChange={e => setScheduledStart(e.target.value)} required />
          <p className="text-[11px] text-zinc-600">Tap outside the calendar to confirm your selection.</p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-zinc-200">Ends</label>
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

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">How should cleanups get logged?</label>
        <div className="relative">
          <select
            className={`${inputCls} appearance-none pr-11 truncate`}
            value={loggingMode}
            onChange={(e) => setLoggingMode(e.target.value as "organizer_total" | "individual")}
          >
            <option value="organizer_total">Organizer logs team total</option>
            <option value="individual">Attendees log themselves</option>
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
        </div>
        <p className="text-xs text-zinc-400">
          {loggingMode === "organizer_total"
            ? "Recommended. You enter the combined haul once everyone's done; points get split across attendees."
            : "Attendees self-log from the map near the event; no team total needed."}
        </p>
      </div>
    </>
  );

  const logisticsSection = (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">RSVP limit (optional)</label>
        <input
          type="number"
          min={1}
          className={inputCls}
          value={maxAttendees}
          onChange={(e) => setMaxAttendees(e.target.value.replace(/^0+(?=\d)/, ""))}
          placeholder="No limit"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">Event link (optional)</label>
        <input
          type="url"
          className={inputCls}
          value={externalLink}
          onChange={(e) => setExternalLink(e.target.value)}
          placeholder="https://... (site, waiver form, sign-up sheet)"
        />
      </div>
    </>
  );

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const fullAddress = [addressLine1, city, [state, postalCode].filter(Boolean).join(" "), country].filter(Boolean).join(", ");

  const locationSection = (
    <>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-zinc-800 p-1" role="tablist" aria-label="Event location type">
        {([
          { route: false, label: "📍 One spot", hint: "Meet at an address" },
          { route: true, label: "🛤️ A route", hint: "Clean along a stretch" },
        ] as const).map((opt) => (
          <button
            key={opt.label}
            type="button"
            role="tab"
            aria-selected={showRoutePicker === opt.route}
            onClick={() => {
              setShowRoutePicker(opt.route);
              if (!opt.route) setRoute(null);
            }}
            className={`min-h-12 rounded-full px-3 text-sm font-bold transition-[background-color,color] duration-150 touch-manipulation ${showRoutePicker === opt.route ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-400 -mt-1">
        {showRoutePicker
          ? "Jump to the area first, then tap the map to draw the route. The spot you searched is the meetup point."
          : "Search for an address, or tap the map to drop the pin."}
      </p>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">{showRoutePicker ? "Where is the route?" : "Find the spot"}</label>
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
          placeholder={showRoutePicker ? "Search a street, park, or neighborhood..." : "Search for an address..."}
        />
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex items-center justify-center min-h-11 px-4 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-sm font-semibold text-zinc-200 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
        >
          {locating ? "Locating..." : "📍 Use my location"}
        </button>
      </div>

      {showRoutePicker ? (
        lat !== null && lng !== null ? (
          <RoutePicker
            centerLat={lat}
            centerLng={lng}
            initialCoordinates={route?.coordinates ?? null}
            heightClassName="h-[420px]"
            onChange={(coords) => setRoute(coords ? { type: "LineString", coordinates: coords } : null)}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-700 px-4 py-10 text-center text-sm text-zinc-400">
            Search above or use your location to jump the map to the right area.
          </div>
        )
      ) : (
        <BusinessLocationMapPicker lat={lat} lng={lng} onChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }} locationNoun="event" square />
      )}

      {fullAddress && (
        <div className="rounded-2xl bg-zinc-800/60 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Address shown on the event</p>
          <p className="mt-0.5 text-sm text-zinc-100">{fullAddress}</p>
          <button
            type="button"
            onClick={() => setShowAddressDetails((v) => !v)}
            className="mt-2 inline-flex items-center min-h-11 text-sm font-semibold text-zinc-300 hover:text-zinc-100"
          >
            {showAddressDetails ? "Hide details" : "Edit details"}
          </button>
        </div>
      )}

      {(showAddressDetails || !fullAddress) && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <div className="col-span-2 space-y-1.5">
            <label className="block text-sm font-semibold text-zinc-200">Street address</label>
            <input className={inputCls} value={addressLine1} onChange={e => setAddressLine1(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-zinc-200">City</label>
            <input className={inputCls} value={city} onChange={e => setCity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-zinc-200">State</label>
            <input className={inputCls} value={state} onChange={e => setState(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-zinc-200">Postal code</label>
            <input className={inputCls} value={postalCode} onChange={e => setPostalCode(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-zinc-200">Country</label>
            <input className={inputCls} value={country} onChange={e => setCountry(e.target.value)} />
          </div>
        </div>
      )}
    </>
  );

  const partnersSection = (
    <NearbyPartnersPanel
      partners={nearbyPartners}
      selectedOfferIds={selectedOfferIds}
      onToggleOffer={toggleOfferId}
      maxAttendees={maxAttendees}
      onSetMaxAttendees={setMaxAttendees}
    />
  );

  const photoSection = (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">Cover photo (optional)</label>
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

  const hostEventStepSections = hasNearbyPartners
    ? [basicsSection, scheduleSection, logisticsSection, locationSection, partnersSection, photoSection]
    : [basicsSection, scheduleSection, logisticsSection, locationSection, photoSection];
  const activeGuidedStep = Math.min(guidedStep, hostEventSteps.length - 1);

  const lastStep = activeGuidedStep === hostEventSteps.length - 1;
  const blocked = [
    !title.trim() ? "Add a title to continue" : null,
    !scheduledStart ? "Pick a start date to continue" : endBeforeStart ? "End time must be after the start" : null,
    null,
    lat === null || lng === null ? "Set a location to continue" : null,
    ...(hasNearbyPartners ? [null] : []),
    null,
  ][activeGuidedStep];
  const cancelHref = mode === "edit" && cleanupId ? `/cleanup-events/${cleanupId}` : `/groups/${groupSlug}`;
  const goBack = activeGuidedStep > 0 ? () => setGuidedStep((s) => Math.max(0, s - 1)) : () => router.push(cancelHref);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {hostEventSteps.map((st, n) => (
            <span key={st.key} className={`h-1 flex-1 rounded-full transition-colors duration-200 ${n <= activeGuidedStep ? "bg-zinc-100" : "bg-zinc-700"}`} />
          ))}
        </div>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Step {activeGuidedStep + 1} of {hostEventSteps.length}
        </p>
        <h2 className="text-xl font-black text-zinc-100 tracking-tight">{hostEventSteps[activeGuidedStep].label}</h2>
      </div>

      <div className="space-y-4">{hostEventStepSections[activeGuidedStep]}</div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {lastStep ? (
        <FlowFooter
          onBack={goBack}
          backLabel={activeGuidedStep > 0 ? "Back" : "Cancel"}
          primaryLabel={mode === "edit" ? (loading ? "Saving..." : "Save changes") : loading ? "Creating..." : "Create event"}
          onPrimary={() => handleSubmit()}
          primaryDisabled={loading || !canSubmit}
        />
      ) : (
        <FlowFooter
          onBack={goBack}
          backLabel={activeGuidedStep > 0 ? "Back" : "Cancel"}
          primaryLabel="Next"
          onPrimary={() => setGuidedStep((s) => Math.min(hostEventSteps.length - 1, s + 1))}
          primaryDisabled={!!blocked}
          hint={blocked}
        />
      )}
    </form>
  );
}
