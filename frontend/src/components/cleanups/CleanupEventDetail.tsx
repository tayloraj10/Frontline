"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getCleanupEvent,
  rsvpToCleanupEvent,
  checkInToCleanupEvent,
  logForAttendee,
  updateCleanupEvent,
  type CleanupEventDetailData,
} from "@/lib/cleanupEvents";
import RoutePreviewMap from "@/components/map/RoutePreviewMap";
import Lightbox from "@/components/Lightbox";

const inputCls =
  "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // not JSON, fall through to raw message
  }
  return err.message || fallback;
}

function formatSchedule(start: string | null, end: string | null): string {
  if (!start) return "Time TBD";
  const startDate = new Date(start);
  let text = startDate.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (end) {
    text += ` – ${new Date(end).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return text;
}

function formatCheckInWindow(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    return `${startDate.toLocaleTimeString(undefined, opts)} – ${endDate.toLocaleTimeString(undefined, opts)}`;
  }
  return `${startDate.toLocaleString(undefined, { month: "short", day: "numeric", ...opts })} – ${endDate.toLocaleString(undefined, { month: "short", day: "numeric", ...opts })}`;
}

function formatFeetAndMeters(meters: number): string {
  const feet = Math.round(meters * 3.28084);
  return `${feet.toLocaleString()}ft (${Math.round(meters).toLocaleString()}m)`;
}

function formatApproxFeetAndMeters(meters: number): string {
  const feet = Math.round((meters * 3.28084) / 50) * 50;
  return `~${feet.toLocaleString()}ft (${Math.round(meters).toLocaleString()}m)`;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CleanupEventDetail({
  initialEvent,
  userId,
}: {
  initialEvent: CleanupEventDetailData;
  userId: string | null;
}) {
  const [event, setEvent] = useState(initialEvent);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [showJoinCodeField, setShowJoinCodeField] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<"checking" | "resolved" | "unavailable">("checking");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const viewerCheckedInInitial = !!initialEvent.viewer_rsvp?.checked_in_at;

  // Passively check proximity so attendees can see at a glance whether they're in
  // range, without requiring the "Check in with my location" button click first.
  useEffect(() => {
    if (!userId || viewerCheckedInInitial) return;
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDistanceMeters(haversineMeters(pos.coords.latitude, pos.coords.longitude, event.lat, event.lng));
        setLocationStatus("resolved");
      },
      () => {
        // Permission denied or unavailable — this is a passive hint, not a required
        // action (the check-in button still works on click), but still say so.
        setLocationStatus("unavailable");
      },
      { maximumAge: 60000, timeout: 10000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, viewerCheckedInInitial]);

  const refresh = async () => {
    const fresh = await getCleanupEvent(event.id, userId);
    setEvent(fresh);
  };

  const handleRsvp = async (status: "going" | "maybe" | "cancelled") => {
    if (!userId) return;
    setRsvpLoading(true);
    setError(null);
    try {
      await rsvpToCleanupEvent({ cleanupId: event.id, userId, status });
      await refresh();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to RSVP"));
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleCheckInWithLocation = () => {
    if (!userId) return;
    setError(null);
    setCheckInLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await checkInToCleanupEvent({
            cleanupId: event.id,
            userId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          await refresh();
        } catch (err) {
          setError(extractErrorMessage(err, "Failed to check in"));
        } finally {
          setCheckInLoading(false);
        }
      },
      () => {
        setError("Couldn't get your location. Try the join code instead.");
        setCheckInLoading(false);
      }
    );
  };

  const handleCheckInWithCode = async () => {
    if (!userId || !joinCodeInput.trim()) return;
    setError(null);
    setCheckInLoading(true);
    try {
      await checkInToCleanupEvent({ cleanupId: event.id, userId, joinCode: joinCodeInput.trim() });
      await refresh();
      setJoinCodeInput("");
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to check in"));
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleCancelEvent = async () => {
    if (!userId) return;
    if (!confirm(`Cancel "${event.title}"? Attendees will see this event as cancelled.`)) return;
    setCancelLoading(true);
    setError(null);
    try {
      await updateCleanupEvent({ cleanupId: event.id, organizerUserId: userId, status: "cancelled" });
      await refresh();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to cancel event"));
    } finally {
      setCancelLoading(false);
    }
  };

  const viewerStatus = event.viewer_rsvp?.status ?? null;
  const viewerCheckedIn = !!event.viewer_rsvp?.checked_in_at;
  const goingCount = event.going_count;
  const spotsLeft = event.max_attendees !== null ? event.max_attendees - goingCount : null;
  const blockGoing = event.is_full && viewerStatus !== "going";
  const isCancelled = event.status === "cancelled";

  return (
    <div className="space-y-6">
      {event.image_url && (
        <div className="w-full aspect-video rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
        </div>
      )}

      {event.route && (
        <RoutePreviewMap
          coordinates={event.route.coordinates}
          bufferCoordinates={event.route_buffer?.coordinates as [number, number][][] | undefined}
          groupLogoUrl={event.group_logo_url}
          enlargeable
          interactive
          isEvent
        />
      )}

      <div>
        <div className="flex items-center gap-2 mb-1.5">
          {event.group_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.group_logo_url}
              alt={event.group_name}
              className="w-9 h-9 rounded-full object-cover border border-zinc-700/50"
            />
          ) : (
            <span className="w-9 h-9 rounded-full bg-sky-900/60 border border-sky-700/50 flex items-center justify-center text-sm">
              🧹
            </span>
          )}
          <Link href={`/groups/${event.group_slug}`} className="text-sm text-sky-400 hover:text-sky-300">
            {event.group_name}
          </Link>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-black text-zinc-100 leading-tight truncate">{event.title}</h1>
            <span
              title="This feature should work but is still being tested."
              className="text-xs text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5 shrink-0 cursor-help"
            >
              Beta
            </span>
          </div>
          {event.is_organizer && (
            <div className="flex items-center gap-2 shrink-0 pt-1">
              <Link
                href={`/groups/${event.group_slug}/events/${event.id}/edit`}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Edit
              </Link>
              {!isCancelled && (
                <button
                  onClick={handleCancelEvent}
                  disabled={cancelLoading}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  {cancelLoading ? "Cancelling…" : "Cancel event"}
                </button>
              )}
            </div>
          )}
        </div>
        {isCancelled && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-red-800/60 bg-red-950/30 px-2.5 py-1 text-xs font-semibold text-red-400">
            Cancelled
          </p>
        )}
        <p className="mt-1.5 text-sm text-zinc-400">{formatSchedule(event.scheduled_start, event.scheduled_end)}</p>
        {formatCheckInWindow(event.check_in_window_start, event.check_in_window_end) && (
          <p className="mt-0.5 text-xs text-zinc-500">
            Check-in window: {formatCheckInWindow(event.check_in_window_start, event.check_in_window_end)}
          </p>
        )}
        {!viewerCheckedInInitial && userId && (
          <div className="mt-2">
            {locationStatus === "checking" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-xs font-medium text-zinc-400">
                📍 Checking your distance to the event…
              </span>
            )}
            {locationStatus === "resolved" && distanceMeters !== null && (
              distanceMeters <= event.check_in_radius_meters ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/60 bg-emerald-900/30 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                  🟢 You&apos;re in check-in range
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-700/60 bg-amber-900/20 px-2.5 py-1 text-xs font-semibold text-amber-400">
                  🟠 {formatFeetAndMeters(distanceMeters)} away — outside the {formatApproxFeetAndMeters(event.check_in_radius_meters)} check-in range
                </span>
              )
            )}
            {locationStatus === "unavailable" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-xs font-medium text-zinc-500">
                📍 Enable location to see if you&apos;re in check-in range
              </span>
            )}
          </div>
        )}
        {(event.total_small_bags + event.total_large_bags) > 0 && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
            🗑️ {event.total_small_bags + event.total_large_bags} bags
            {event.total_pounds > 0 && ` · ${event.total_pounds.toLocaleString()} lbs`} logged so far
          </p>
        )}
        {event.description && <p className="mt-3 text-sm text-zinc-300 leading-relaxed">{event.description}</p>}
        {event.external_link && (
          <a
            href={event.external_link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300 underline"
          >
            Event link ↗
          </a>
        )}
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {isCancelled ? null : !userId ? (
        <Link
          href={`/login?next=/cleanup-events/${event.id}`}
          className="block text-center px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-sky-950 text-sm font-semibold rounded-lg transition-colors"
        >
          Log in to RSVP
        </Link>
      ) : (
        <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-300">
              {goingCount} going
              {event.max_attendees !== null && (
                <span className="text-zinc-500 font-normal">
                  {" "}
                  / {event.max_attendees} · {event.is_full ? "Event full" : `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`}
                </span>
              )}
            </span>
            {viewerCheckedIn && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/60 bg-emerald-900/30 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                ✓ Checked in
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(["going", "maybe", "cancelled"] as const).map((status) => {
              const activeClasses =
                status === "going"
                  ? "bg-emerald-500 border-emerald-500 text-emerald-950"
                  : status === "maybe"
                  ? "bg-amber-500 border-amber-500 text-amber-950"
                  : "bg-red-500 border-red-500 text-red-950";
              return (
                <button
                  key={status}
                  disabled={rsvpLoading || (status === "going" && blockGoing)}
                  onClick={() => handleRsvp(status)}
                  title={status === "going" && blockGoing ? "This event is full" : undefined}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                    viewerStatus === status
                      ? activeClasses
                      : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
                  }`}
                >
                  {status === "going" ? "Going" : status === "maybe" ? "Maybe" : "Can't go"}
                </button>
              );
            })}
          </div>

          {!viewerCheckedIn && (
            <div className="pt-2 border-t border-zinc-800 space-y-2">
              <button
                onClick={handleCheckInWithLocation}
                disabled={checkInLoading}
                className="w-full px-3 py-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors"
              >
                {checkInLoading ? "Checking in…" : "Check in with my location"}
              </button>
              {showJoinCodeField ? (
                <div className="flex items-center gap-2">
                  <input
                    className={inputCls}
                    placeholder="Join code"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    maxLength={6}
                  />
                  <button
                    onClick={handleCheckInWithCode}
                    disabled={checkInLoading || !joinCodeInput.trim()}
                    className="px-3 py-2 text-sm font-medium bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded-lg transition-colors shrink-0"
                  >
                    Submit
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowJoinCodeField(true)}
                  className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Have a join code instead?
                </button>
              )}
            </div>
          )}

          <Link
            href={`/campaigns/${event.campaign_slug}?lat=${event.lat}&lng=${event.lng}`}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-sky-950 rounded-lg shadow-md shadow-sky-500/30 transition-colors"
          >
            <span aria-hidden="true">📍</span>
            Log your cleanup on the map
          </Link>
        </div>
      )}

      {event.is_organizer && event.join_code && (
        <div className="border border-amber-700/40 bg-amber-900/10 rounded-xl p-4">
          <p className="text-xs text-amber-400/80 mb-1">Organizer join code</p>
          <p className="text-2xl font-black tracking-widest text-amber-300">{event.join_code}</p>
          <p className="mt-1 text-xs text-zinc-500">Share this with attendees who can&apos;t check in by location.</p>
        </div>
      )}

      <div className="border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/40">
          <span className="text-sm font-semibold text-zinc-300">
            Attendees <span className="text-zinc-500 font-normal">({event.rsvps.length})</span>
          </span>
        </div>
        {event.rsvps.length === 0 ? (
          <div className="px-4 py-6 text-center text-zinc-600 text-sm">No RSVPs yet.</div>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {event.rsvps.map((r) => (
              <li key={r.user_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] font-bold text-zinc-400 shrink-0">
                    {(r.display_name ?? r.username ?? "?")[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-zinc-200 truncate">{r.display_name ?? r.username ?? "Unknown"}</span>
                  <span className="text-xs text-zinc-600 shrink-0">{r.status}</span>
                  {(r.small_bags + r.large_bags) > 0 && (
                    <span className="text-xs text-emerald-400 shrink-0">
                      🗑️ {r.small_bags + r.large_bags}
                      {r.pounds > 0 && ` · ${r.pounds.toLocaleString()} lbs`}
                    </span>
                  )}
                  {r.is_late && (
                    <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-1.5 py-0.5 shrink-0">
                      Late
                    </span>
                  )}
                </div>
                {r.checked_in_at ? (
                  <span className="text-xs text-emerald-400 shrink-0">✓ checked in</span>
                ) : event.is_organizer ? (
                  <OrganizerLogButton
                    cleanupId={event.id}
                    organizerUserId={userId!}
                    attendeeUserId={r.user_id}
                    attendeeName={r.display_name ?? r.username ?? "attendee"}
                    onLogged={refresh}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {event.photos.length > 0 && (
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/40">
            <span className="text-sm font-semibold text-zinc-300">
              Photos <span className="text-zinc-500 font-normal">({event.photos.length})</span>
            </span>
          </div>
          <div className="p-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
            {event.photos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${i}`}
                src={url}
                alt=""
                onClick={() => setLightboxIndex(i)}
                className="w-full aspect-square object-cover rounded-lg cursor-pointer bg-zinc-800 border border-zinc-800 hover:border-zinc-600 transition-colors"
              />
            ))}
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          images={event.photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

function OrganizerLogButton({
  cleanupId,
  organizerUserId,
  attendeeUserId,
  attendeeName,
  onLogged,
}: {
  cleanupId: string;
  organizerUserId: string;
  attendeeUserId: string;
  attendeeName: string;
  onLogged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [smallBags, setSmallBags] = useState("1");
  const [largeBags, setLargeBags] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const small = Number(smallBags) || 0;
    const large = Number(largeBags) || 0;
    if (small + large <= 0) return;
    setLoading(true);
    setError(null);
    try {
      await logForAttendee({
        cleanupId,
        organizerUserId,
        attendeeUserId,
        smallBags: small,
        largeBags: large,
      });
      await onLogged();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log contribution");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-500 hover:text-zinc-300 underline shrink-0"
      >
        Log for them
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
      <div
        className="relative max-w-xs w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="text-sm font-semibold text-zinc-100 mb-3">Log contribution for {attendeeName}</h4>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-[11px] text-zinc-600 mb-1">Plastic grocery bags</label>
            <input
              type="number"
              min={0}
              value={smallBags}
              onChange={(e) => setSmallBags(e.target.value.replace(/^0+(?=\d)/, ""))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[11px] text-zinc-600 mb-1">Kitchen trash bags</label>
            <input
              type="number"
              min={0}
              value={largeBags}
              onChange={(e) => setLargeBags(e.target.value.replace(/^0+(?=\d)/, ""))}
              className={inputCls}
            />
          </div>
        </div>
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors"
          >
            {loading ? "Logging…" : "Log contribution"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
