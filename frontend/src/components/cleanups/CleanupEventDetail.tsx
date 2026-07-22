"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getCleanupEvent,
  rsvpToCleanupEvent,
  checkInToCleanupEvent,
  organizerCheckInAttendee,
  logForAttendee,
  logTeamTotal,
  getTeamTotalLogs,
  updateCleanupEvent,
  promoteOrganizer,
  demoteOrganizer,
  addEventPhotos,
  uploadEventPhoto,
  type CleanupEventDetailData,
  type TeamTotalLogEntry,
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
    if (Array.isArray(parsed?.detail) && typeof parsed.detail[0]?.msg === "string") {
      return parsed.detail[0].msg.replace(/^Value error,\s*/, "");
    }
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
            <span className="text-xs font-normal text-emerald-400/70">
              ({event.total_small_bags} small, {event.total_large_bags} large)
            </span>
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

      {event.is_organizer && !isCancelled && (
        <LogTeamTotalForm cleanupId={event.id} organizerUserId={userId!} rsvps={event.rsvps} onLogged={refresh} />
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
            {event.rsvps.map((r) => {
              const hasContribution = r.small_bags + r.large_bags > 0 || r.pounds > 0 || r.points > 0;
              return (
                <li key={r.user_id} className="px-4 py-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] font-bold text-zinc-400 shrink-0">
                        {(r.display_name ?? r.username ?? "?")[0].toUpperCase()}
                      </div>
                      <span className="text-sm text-zinc-200 truncate">{r.display_name ?? r.username ?? "Unknown"}</span>
                      <span className="text-xs text-zinc-600 shrink-0">{r.status}</span>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {r.checked_in_at ? (
                        <span className="text-xs text-emerald-400 whitespace-nowrap">✓ checked in</span>
                      ) : event.is_organizer ? (
                        <OrganizerCheckInButton
                          cleanupId={event.id}
                          organizerUserId={userId!}
                          attendeeUserId={r.user_id}
                          onCheckedIn={refresh}
                          onError={(msg) => setError(extractErrorMessage(new Error(msg), "Failed to check in attendee"))}
                        />
                      ) : null}
                      {event.is_organizer && (
                        <OrganizerLogButton
                          cleanupId={event.id}
                          organizerUserId={userId!}
                          attendeeUserId={r.user_id}
                          attendeeName={r.display_name ?? r.username ?? "attendee"}
                          onLogged={refresh}
                        />
                      )}
                    </div>
                  </div>

                  {(r.is_organizer || r.is_late || hasContribution) && (
                    <div className="flex items-center gap-1.5 flex-wrap pl-8">
                      {r.is_organizer && (
                        <span className="text-[10px] font-semibold text-sky-400 bg-sky-400/10 border border-sky-400/30 rounded px-1.5 py-0.5 shrink-0">
                          ★ Organizer
                        </span>
                      )}
                      {r.is_late && (
                        <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-1.5 py-0.5 shrink-0">
                          Late
                        </span>
                      )}
                      {(r.small_bags + r.large_bags > 0 || r.pounds > 0) && (
                        <span
                          className="text-xs text-emerald-400 shrink-0"
                          title={`${r.small_bags} small bag${r.small_bags === 1 ? "" : "s"} (about a grocery bag size), ${r.large_bags} large bag${r.large_bags === 1 ? "" : "s"} (about a kitchen trash bag size)`}
                        >
                          {r.small_bags + r.large_bags > 0 && (
                            <>
                              🗑️ {r.small_bags + r.large_bags}
                              <span className="text-emerald-400/70"> ({r.small_bags} small, {r.large_bags} large)</span>
                            </>
                          )}
                          {r.pounds > 0 && `${r.small_bags + r.large_bags > 0 ? " · " : ""}⚖️ ${r.pounds.toLocaleString()} lbs`}
                        </span>
                      )}
                      {r.points > 0 && (
                        <span
                          className="text-xs text-sky-400 bg-sky-400/10 border border-sky-400/30 rounded px-1.5 py-0.5 shrink-0"
                          title={
                            r.small_bags + r.large_bags === 0 && r.pounds === 0
                              ? "Credited as their share of an organizer's team-total log, not an individually logged amount"
                              : undefined
                          }
                        >
                          +{r.points.toLocaleString()} pts
                          {r.small_bags + r.large_bags === 0 && r.pounds === 0 && " · team total"}
                        </span>
                      )}
                    </div>
                  )}

                  {event.is_organizer && r.user_id !== userId && (
                    <div className="pl-8">
                      <OrganizerRoleButton
                        cleanupId={event.id}
                        organizerUserId={userId!}
                        targetUserId={r.user_id}
                        isOrganizer={r.is_organizer}
                        onChanged={refresh}
                        onError={(msg) => setError(extractErrorMessage(new Error(msg), "Failed to update organizer"))}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(event.photos.length > 0 || (userId && !isCancelled)) && (
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-zinc-300">
              Photos <span className="text-zinc-500 font-normal">({event.photos.length})</span>
            </span>
            {userId && !isCancelled && (
              <AddEventPhotoButton cleanupId={event.id} userId={userId} onAdded={refresh} />
            )}
          </div>
          {event.photos.length > 0 && (
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
          )}
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

function AddEventPhotoButton({
  cleanupId,
  userId,
  onAdded,
}: {
  cleanupId: string;
  userId: string;
  onAdded: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const url = await uploadEventPhoto(file);
      await addEventPhotos({ cleanupId, userId, photoUrls: [url] });
      await onAdded();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to add photo"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <label className="text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-3 py-1.5 cursor-pointer transition-colors">
        {loading ? "Uploading..." : "Add a photo"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function OrganizerCheckInButton({
  cleanupId,
  organizerUserId,
  attendeeUserId,
  onCheckedIn,
  onError,
}: {
  cleanupId: string;
  organizerUserId: string;
  attendeeUserId: string;
  onCheckedIn: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await organizerCheckInAttendee({ cleanupId, organizerUserId, attendeeUserId });
      await onCheckedIn();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to check in attendee");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={submit}
      disabled={loading}
      className="text-xs text-zinc-500 hover:text-zinc-300 underline shrink-0 disabled:opacity-50"
    >
      {loading ? "Checking in…" : "Check in"}
    </button>
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
  const [smallBags, setSmallBags] = useState("");
  const [largeBags, setLargeBags] = useState("");
  const [pounds, setPounds] = useState("");
  const [scoringMethod, setScoringMethod] = useState<"bags" | "pounds">("bags");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bagPoints = (Number(smallBags) || 0) * SMALL_BAG_VALUE + (Number(largeBags) || 0) * LARGE_BAG_VALUE;
  const poundPoints = (Number(pounds) || 0) * POUND_VALUE;
  const hasNegative = (Number(smallBags) || 0) < 0 || (Number(largeBags) || 0) < 0 || (Number(pounds) || 0) < 0;

  const submit = async () => {
    const small = Number(smallBags) || 0;
    const large = Number(largeBags) || 0;
    const lbs = Number(pounds) || 0;
    if (hasNegative || small + large + lbs <= 0) return;
    setLoading(true);
    setError(null);
    try {
      await logForAttendee({
        cleanupId,
        organizerUserId,
        attendeeUserId,
        smallBags: small || undefined,
        largeBags: large || undefined,
        pounds: lbs || undefined,
        scoringMethod,
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
        <div className="grid grid-cols-3 gap-x-3 gap-y-0 mb-3">
          <label className="text-[11px] text-zinc-600">Small bags</label>
          <label className="text-[11px] text-zinc-600">Large bags</label>
          <label className="text-[11px] text-zinc-600">Pounds</label>
          <p className="text-[11px] text-zinc-700 mb-1">(grocery bag)</p>
          <p className="text-[11px] text-zinc-700 mb-1">(kitchen trash bag)</p>
          <p className="text-[11px] text-zinc-700 mb-1">(if weighed)</p>
          <input
            type="number"
            min={0}
            value={smallBags}
            onChange={(e) => setSmallBags(e.target.value.replace(/^0+(?=\d)/, ""))}
            className={inputCls}
          />
          <input
            type="number"
            min={0}
            value={largeBags}
            onChange={(e) => setLargeBags(e.target.value.replace(/^0+(?=\d)/, ""))}
            className={inputCls}
          />
          <input
            type="number"
            min={0}
            value={pounds}
            onChange={(e) => setPounds(e.target.value.replace(/^0+(?=\d)/, ""))}
            className={inputCls}
          />
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2 mb-3">
          <p className="text-[11px] text-zinc-600">
            Bags and pounds are two ways of estimating the same haul — pick which one determines points.
            Both are still saved for the event&apos;s record.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setScoringMethod("bags")}
              className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${
                scoringMethod === "bags"
                  ? "border-emerald-600 bg-emerald-900/20"
                  : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <p className="text-xs font-semibold text-zinc-200">By bags</p>
              <p className="text-[10px] text-zinc-500">
                {smallBags || 0}×{SMALL_BAG_VALUE} + {largeBags || 0}×{LARGE_BAG_VALUE}
              </p>
              <p className="text-sm font-bold text-emerald-400 mt-0.5">{bagPoints.toLocaleString()} pts</p>
            </button>
            <button
              onClick={() => setScoringMethod("pounds")}
              className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${
                scoringMethod === "pounds"
                  ? "border-emerald-600 bg-emerald-900/20"
                  : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <p className="text-xs font-semibold text-zinc-200">By pounds</p>
              <p className="text-[10px] text-zinc-500">
                {pounds || 0}×{POUND_VALUE}
              </p>
              <p className="text-sm font-bold text-emerald-400 mt-0.5">{poundPoints.toLocaleString()} pts</p>
            </button>
          </div>
        </div>
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={loading || hasNegative}
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

// Mirrors backend/app/services/contribution_scoring.py — keep these in sync.
const SMALL_BAG_VALUE = 1;
const LARGE_BAG_VALUE = 3;
const POUND_VALUE = 0.5;

// Points are awarded in whole/half increments server-side — mirror that here so the
// preview matches what actually gets recorded.
function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function LogTeamTotalForm({
  cleanupId,
  organizerUserId,
  rsvps,
  onLogged,
}: {
  cleanupId: string;
  organizerUserId: string;
  rsvps: CleanupEventDetailData["rsvps"];
  onLogged: () => Promise<void>;
}) {
  const [smallBags, setSmallBags] = useState("");
  const [largeBags, setLargeBags] = useState("");
  const [pounds, setPounds] = useState("");
  const [pool, setPool] = useState<"checked_in" | "going">("checked_in");
  const [scoringMethod, setScoringMethod] = useState<"bags" | "pounds">("bags");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [overrideListOpen, setOverrideListOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [applyAllValue, setApplyAllValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [logs, setLogs] = useState<TeamTotalLogEntry[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [emptyPoolOpen, setEmptyPoolOpen] = useState(false);

  const loadLogs = async () => {
    try {
      setLogs(await getTeamTotalLogs(cleanupId));
    } catch {
      // Non-critical — history is a nice-to-have, don't block the form on it.
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no external system to subscribe to instead
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupId]);

  // Mirrors the backend pool query (contribution_id IS NULL) so the preview count and
  // override list match who will actually be credited, not just who's going/checked in.
  const candidates = rsvps.filter(
    (r) => r.status === "going" && (pool === "going" || r.checked_in_at) && r.points === 0
  );

  const bagPoints = (Number(smallBags) || 0) * SMALL_BAG_VALUE + (Number(largeBags) || 0) * LARGE_BAG_VALUE;
  const poundPoints = (Number(pounds) || 0) * POUND_VALUE;
  const totalPoints = scoringMethod === "pounds" ? poundPoints : bagPoints;
  const perAttendee = candidates.length > 0 ? roundHalf(totalPoints / candidates.length) : 0;
  const hasNegative =
    (Number(smallBags) || 0) < 0 ||
    (Number(largeBags) || 0) < 0 ||
    (Number(pounds) || 0) < 0 ||
    Object.values(overrides).some((v) => v.trim() !== "" && (Number(v) || 0) < 0);

  const applyToAll = () => {
    if (applyAllValue.trim() === "") return;
    setOverrides(Object.fromEntries(candidates.map((r) => [r.user_id, applyAllValue])));
  };

  const clearAll = () => {
    setOverrides({});
    setApplyAllValue("");
  };

  const submit = async () => {
    const small = Number(smallBags) || 0;
    const large = Number(largeBags) || 0;
    const lbs = Number(pounds) || 0;
    if (hasNegative || small + large + lbs <= 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const overridesPayload: Record<string, number> = {};
      for (const [userId, val] of Object.entries(overrides)) {
        const num = Number(val);
        if (val.trim() !== "" && !Number.isNaN(num)) overridesPayload[userId] = num;
      }
      const res = await logTeamTotal({
        cleanupId,
        organizerUserId,
        smallBags: small || undefined,
        largeBags: large || undefined,
        pounds: lbs || undefined,
        attendeePool: pool,
        scoringMethod,
        overrides: Object.keys(overridesPayload).length ? overridesPayload : undefined,
      });
      await onLogged();
      await loadLogs();
      setSmallBags("");
      setLargeBags("");
      setPounds("");
      setOverrides({});
      setResult(`Credited ${res.credited_count} attendee${res.credited_count === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to log team total"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-zinc-300">Log team total</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          Enter the whole event&apos;s haul and split credit equally across eligible attendees.
        </p>
      </div>
      <button
        onClick={() => setWarningOpen((v) => !v)}
        className="w-full text-left text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2 hover:bg-amber-500/15 transition-colors"
      >
        {warningOpen ? (
          <>
            Each submission only splits credit among attendees who don&apos;t already have a contribution
            for this event: anyone already credited is skipped, whether they logged their own
            contribution, an organizer logged one for them individually via &quot;Log for them&quot;, or
            they were credited by an earlier team total (see the log history below). Running this again
            does <span className="font-semibold">not</span> re-split a combined total across everyone;
            enter only the <span className="font-semibold">new</span> amount collected since the last
            submission.{" "}
            <span className="underline">Show less</span>
          </>
        ) : (
          <>
            Re-running this only credits new attendees, it won&apos;t re-split a combined total.{" "}
            <span className="underline">Read more</span>
          </>
        )}
      </button>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[11px] text-zinc-600">Small bags</label>
          <input
            type="number"
            min={0}
            value={smallBags}
            onChange={(e) => setSmallBags(e.target.value.replace(/^0+(?=\d)/, ""))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[11px] text-zinc-600">Large bags</label>
          <input
            type="number"
            min={0}
            value={largeBags}
            onChange={(e) => setLargeBags(e.target.value.replace(/^0+(?=\d)/, ""))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[11px] text-zinc-600">Pounds</label>
          <input
            type="number"
            min={0}
            value={pounds}
            onChange={(e) => setPounds(e.target.value.replace(/^0+(?=\d)/, ""))}
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-600">Split among</span>
        {(["checked_in", "going"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPool(p)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              pool === p
                ? "bg-emerald-700 border-emerald-700 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
            }`}
          >
            {p === "checked_in" ? "Checked in" : "Everyone going"}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
        <p className="text-[11px] text-zinc-600">
          Bags and pounds are two ways of estimating the same haul — pick which one determines points for
          this submission. Both are still saved for the event&apos;s record.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setScoringMethod("bags")}
            className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${
              scoringMethod === "bags"
                ? "border-emerald-600 bg-emerald-900/20"
                : "border-zinc-800 hover:border-zinc-600"
            }`}
          >
            <p className="text-xs font-semibold text-zinc-200">By bags</p>
            <p className="text-[10px] text-zinc-500">
              {smallBags || 0}×{SMALL_BAG_VALUE} + {largeBags || 0}×{LARGE_BAG_VALUE}
            </p>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">{bagPoints.toLocaleString()} pts</p>
          </button>
          <button
            onClick={() => setScoringMethod("pounds")}
            className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${
              scoringMethod === "pounds"
                ? "border-emerald-600 bg-emerald-900/20"
                : "border-zinc-800 hover:border-zinc-600"
            }`}
          >
            <p className="text-xs font-semibold text-zinc-200">By pounds</p>
            <p className="text-[10px] text-zinc-500">
              {pounds || 0}×{POUND_VALUE}
            </p>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">{poundPoints.toLocaleString()} pts</p>
          </button>
        </div>
        <p className="text-xs text-zinc-400">
          Total: <span className="font-semibold text-zinc-100">{totalPoints.toLocaleString()} pts</span>
          {candidates.length > 0 && (
            <>
              {" "}
              · ~<span className="font-semibold text-zinc-100">{perAttendee.toLocaleString(undefined, { maximumFractionDigits: 1 })} pts</span> each across {candidates.length} attendee{candidates.length === 1 ? "" : "s"}
            </>
          )}
        </p>
        {candidates.length === 0 && (
          <button
            onClick={() => setEmptyPoolOpen((v) => !v)}
            className="w-full text-left text-xs text-amber-400/90"
          >
            {emptyPoolOpen ? (
              <>
                No eligible attendees in the {pool === "checked_in" ? "checked-in" : "everyone going"} pool:
                everyone in it already has a contribution for this event. Submitting won&apos;t credit
                anyone. <span className="underline">Show less</span>
              </>
            ) : (
              <>
                No eligible attendees right now. <span className="underline">Read more</span>
              </>
            )}
          </button>
        )}
      </div>

      <div>
        <button
          onClick={() => setLogsOpen((v) => !v)}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          {logsOpen ? "Hide" : "Show"} log history{logs.length > 0 ? ` (${logs.length})` : ""}
        </button>
        {logsOpen &&
          (logs.length === 0 ? (
            <p className="text-xs text-zinc-600 mt-1.5">No team totals logged yet.</p>
          ) : (
            <div className="mt-1.5 space-y-1.5">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-2 text-xs border border-zinc-800 rounded-lg px-2.5 py-1.5"
                >
                  <div>
                    <span className="text-zinc-300">
                      {log.small_bags ?? 0} small, {log.large_bags ?? 0} large
                      {log.pounds ? `, ${log.pounds} lbs` : ""}
                    </span>
                    <span className="text-zinc-600"> · </span>
                    <span className="text-zinc-500">
                      by {log.scoring_method === "pounds" ? "pounds" : "bags"}
                    </span>
                    <span className="text-zinc-600"> · </span>
                    <span className="text-emerald-400">{log.total_value.toLocaleString()} pts</span>
                    <span className="text-zinc-600"> · </span>
                    <span className="text-zinc-500">
                      credited {log.credited_count} attendee{log.credited_count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="text-zinc-600 text-right shrink-0">
                    <div>{log.organizer_name}</div>
                    <div>{new Date(log.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>

      <button
        onClick={() => setAdvancedOpen((v) => !v)}
        className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        {advancedOpen ? "Hide advanced options" : "Advanced options"}
      </button>
      {advancedOpen && (
        <div className="border-t border-zinc-800 pt-2 space-y-2">
          <p className="text-[11px] text-zinc-600">
            Override individual point values instead of an equal split. Leave blank for an equal share.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              placeholder={`e.g. ${perAttendee}`}
              value={applyAllValue}
              onChange={(e) => setApplyAllValue(e.target.value)}
              className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-100 text-xs focus:outline-none focus:border-zinc-500"
            />
            <button
              onClick={applyToAll}
              disabled={applyAllValue.trim() === ""}
              className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-40 disabled:hover:text-sky-400 transition-colors"
            >
              Apply to all
            </button>
            <button onClick={clearAll} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              Clear (use auto split)
            </button>
          </div>

          <button
            onClick={() => setOverrideListOpen((v) => !v)}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {overrideListOpen
              ? "Hide individual values"
              : `Show individual values (${candidates.length} attendee${candidates.length === 1 ? "" : "s"})`}
          </button>

          {overrideListOpen &&
            (candidates.length === 0 ? (
              <p className="text-xs text-zinc-600">No eligible attendees for the selected pool.</p>
            ) : (
              <div className="space-y-1.5">
                {candidates.map((r) => (
                  <div key={r.user_id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-400">
                      {r.display_name ?? r.username ?? "Unknown"}
                    </span>
                    <input
                      type="number"
                      min={0}
                      placeholder={String(perAttendee)}
                      value={overrides[r.user_id] ?? ""}
                      onChange={(e) => setOverrides((prev) => ({ ...prev, [r.user_id]: e.target.value }))}
                      className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-100 text-xs focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
      {result && <p className="text-emerald-400 text-xs">{result}</p>}

      <button
        onClick={submit}
        disabled={loading || hasNegative}
        className="w-full mt-3 px-3 py-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors"
      >
        {loading ? "Logging…" : "Log team total"}
      </button>
    </div>
  );
}

function OrganizerRoleButton({
  cleanupId,
  organizerUserId,
  targetUserId,
  isOrganizer,
  onChanged,
  onError,
}: {
  cleanupId: string;
  organizerUserId: string;
  targetUserId: string;
  isOrganizer: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      if (isOrganizer) {
        await demoteOrganizer({ cleanupId, organizerUserId, targetUserId });
      } else {
        await promoteOrganizer({ cleanupId, organizerUserId, targetUserId });
      }
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update organizer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="text-xs text-zinc-500 hover:text-zinc-300 underline shrink-0 disabled:opacity-40"
    >
      {loading ? "…" : isOrganizer ? "Remove organizer" : "Make organizer"}
    </button>
  );
}
