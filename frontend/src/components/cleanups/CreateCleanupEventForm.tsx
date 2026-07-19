"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BusinessLocationMapPicker from "@/app/admin/BusinessLocationMapPicker";
import AddressAutocomplete from "@/app/admin/AddressAutocomplete";
import { createCleanupEvent, updateCleanupEvent } from "@/lib/cleanupEvents";
import RoutePicker from "@/components/map/RoutePicker";
import type { RouteLineString } from "@/lib/cleanupRoutes";

const inputCls = "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500";

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateCleanupEventForm({
  groupId,
  groupSlug,
  organizerUserId,
  campaigns,
  mode = "create",
  cleanupId,
  initialValues,
}: {
  groupId: string;
  groupSlug: string;
  organizerUserId: string;
  campaigns: { id: string; title: string }[];
  mode?: "create" | "edit";
  cleanupId?: string;
  initialValues?: {
    title: string;
    description: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    lat: number;
    lng: number;
    maxAttendees: number | null;
    externalLink: string | null;
    imageUrl: string | null;
    route: RouteLineString | null;
  };
}) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [scheduledStart, setScheduledStart] = useState(toDatetimeLocal(initialValues?.scheduledStart ?? null));
  const [scheduledEnd, setScheduledEnd] = useState(toDatetimeLocal(initialValues?.scheduledEnd ?? null));
  const [lat, setLat] = useState<number | null>(initialValues?.lat ?? null);
  const [lng, setLng] = useState<number | null>(initialValues?.lng ?? null);
  const [address, setAddress] = useState("");
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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const canSubmit = mode === "edit"
    ? !!title.trim() && !!scheduledStart && lat !== null && lng !== null
    : !!campaignId && !!title.trim() && !!scheduledStart && lat !== null && lng !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || lat === null || lng === null) return;
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
          maxAttendees: maxAttendees.trim() ? Number(maxAttendees) : null,
          externalLink: externalLink.trim() || null,
          route,
          clearRoute: hadInitialRoute && !route,
        });
        router.push(`/cleanup-events/${cleanupId}`);
      } else {
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
          maxAttendees: maxAttendees.trim() ? Number(maxAttendees) : null,
          externalLink: externalLink.trim() || null,
          route,
        });
        router.push(`/groups/${groupSlug}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${mode === "edit" ? "save" : "create"} event`);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {mode !== "edit" && (
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-zinc-500">Campaign</label>
            <select className={inputCls} value={campaignId} onChange={e => setCampaignId(e.target.value)} required>
              {campaigns.length === 0 && <option value="">No active campaigns</option>}
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        )}
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Title</label>
          <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. Riverside Park Cleanup" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Description</label>
          <textarea className={`${inputCls} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Starts</label>
          <input type="datetime-local" className={inputCls} value={scheduledStart} onChange={e => setScheduledStart(e.target.value)} required />
          <p className="text-[11px] text-zinc-600">Tap outside the calendar to confirm your selection.</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Ends</label>
          <input type="datetime-local" className={inputCls} value={scheduledEnd} onChange={e => setScheduledEnd(e.target.value)} />
          {!scheduledEnd && (
            <p className="text-[11px] text-zinc-600">If left blank, check-in stays open until 2 hours after the start time.</p>
          )}
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Location</label>
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            onSelect={(s) => {
              setAddress(s.addressLine1);
              setLat(s.lat);
              setLng(s.lng);
            }}
            placeholder="Search for an address..."
          />
          <BusinessLocationMapPicker lat={lat} lng={lng} onChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }} locationNoun="event" />
        </div>
        <div className="col-span-2 space-y-2">
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
        <div className="col-span-2 space-y-1">
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
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Event link (optional)</label>
          <input
            type="url"
            className={inputCls}
            value={externalLink}
            onChange={(e) => setExternalLink(e.target.value)}
            placeholder="https://... (site, waiver form, sign-up sheet)"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Event image</label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500 transition-colors group shrink-0"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Event" className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full text-2xl">🧹</span>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>
            <div className="text-xs text-zinc-500 space-y-0.5">
              <p>JPG, PNG or WebP</p>
              <p>Max 5 MB</p>
            </div>
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="px-4 py-2 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-medium transition-colors"
        >
          {mode === "edit" ? (loading ? "Saving…" : "Save Changes") : (loading ? "Creating…" : "Create Event")}
        </button>
      </div>
    </form>
  );
}
