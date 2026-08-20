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
  getNearbyReports,
  type CleanupEventDetailData,
  type TeamTotalLogEntry,
  type NearbyReport,
} from "@/lib/cleanupEvents";
import type { RouteLineString } from "@/lib/cleanupRoutes";
import { searchUsers, type UserSearchResult } from "@/lib/users";
import RoutePreviewMap from "@/components/map/RoutePreviewMap";
import NearbyReportsMap from "@/components/map/NearbyReportsMap";
import Lightbox from "@/components/Lightbox";
import ReportPhotoButton from "@/components/ReportPhotoButton";
import Avatar from "@/components/ui/Avatar";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useGameSettings, SettingValue } from "@/lib/gameSettings";
import { refreshUserPoints } from "@/lib/userPoints";
import ShareButton from "@/components/ShareButton";

const inputCls =
  "w-full min-h-11 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500";

const EditGlyph = () => (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
    <path
      d="M11.5 1.5 14.5 4.5 5 14H2v-3L11.5 1.5Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CancelGlyph = () => (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

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
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [checkInPointsAwarded, setCheckInPointsAwarded] = useState<number | null>(null);
  const [recentCheckinPoints, setRecentCheckinPoints] = useState<Record<string, number>>({});
  const [previewAsAttendee, setPreviewAsAttendee] = useState(false);
  const [viewMode, setViewMode] = useState<"guided" | "full">(() => {
    if (typeof window === "undefined") return "guided";
    const stored = window.localStorage.getItem("cleanup-event-view-mode");
    return stored === "full" ? "full" : "guided";
  });
  const [guidedStep, setGuidedStep] = useState(0);
  const changeViewMode = (mode: "guided" | "full") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cleanup-event-view-mode", mode);
    }
  };
  const { values: checkinPointValues } = useGameSettings(["cleanup_event_checkin_value"]);
  const checkinPointValue = checkinPointValues.cleanup_event_checkin_value;

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
          const result = await checkInToCleanupEvent({
            cleanupId: event.id,
            userId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          if (result.points_awarded > 0) {
            setCheckInPointsAwarded(result.points_awarded);
            refreshUserPoints(userId);
          }
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
      const result = await checkInToCleanupEvent({ cleanupId: event.id, userId, joinCode: joinCodeInput.trim() });
      if (result.points_awarded > 0) {
        setCheckInPointsAwarded(result.points_awarded);
        refreshUserPoints(userId);
      }
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
    setConfirmingCancel(false);
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
  const effectiveIsOrganizer = event.is_organizer && !previewAsAttendee;

  return (
    <div className="space-y-6">
      {event.image_url && (
        <div className="w-full aspect-video rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={event.image_url} alt={event.title} className="w-full h-full object-contain" />
        </div>
      )}

      {event.route ? (
        <RoutePreviewMap
          coordinates={event.route.coordinates}
          bufferCoordinates={event.route_buffer?.coordinates as [number, number][][] | undefined}
          groupLogoUrl={event.group_logo_url}
          cohostLogoUrls={event.cohost_groups.map((g) => g.group_logo_url)}
          enlargeable
          interactive
          isEvent
        />
      ) : (
        <RoutePreviewMap
          point={[event.lng, event.lat]}
          pointRadiusMeters={event.check_in_radius_meters}
          groupLogoUrl={event.group_logo_url}
          cohostLogoUrls={event.cohost_groups.map((g) => g.group_logo_url)}
          enlargeable
          interactive
          isEvent
        />
      )}
      {(() => {
        const fullAddress = [
          event.address_line1,
          [event.city, event.state].filter(Boolean).join(", "),
          event.postal_code,
          event.country,
        ].filter(Boolean).join(", ");
        return fullAddress ? (
          <p className="text-sm text-zinc-400 flex items-center gap-1.5">
            <span aria-hidden="true">📍</span>
            {fullAddress}
          </p>
        ) : null;
      })()}
      <div className="flex items-center gap-4">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-sky-400 hover:text-sky-300 active:text-sky-300 transition-colors duration-150"
        >
          <span aria-hidden="true">🧭</span>
          Get directions
        </a>
        <Link
          href={`/campaigns/${event.campaign_slug}?lat=${event.lat}&lng=${event.lng}`}
          className="inline-flex items-center gap-1.5 text-sm text-sky-400 hover:text-sky-300 active:text-sky-300 transition-colors duration-150"
        >
          <span aria-hidden="true">📍</span>
          Show on map
        </Link>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          {(event.group_logo_url || event.cohost_groups.some((g) => g.group_logo_url)) && (
            <div className="flex items-center -space-x-2">
              {event.group_logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.group_logo_url}
                  alt={event.group_name}
                  className="w-9 h-9 rounded-full object-cover border border-zinc-700/50 relative"
                />
              )}
              {event.cohost_groups.map((g) => (
                g.group_logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={g.group_id}
                    src={g.group_logo_url}
                    alt={g.group_name}
                    className="w-9 h-9 rounded-full object-cover border border-zinc-700/50 relative"
                  />
                )
              ))}
            </div>
          )}
          <Link href={`/groups/${event.group_slug}`} className="text-sm text-sky-400 hover:text-sky-300 active:text-sky-300 transition-colors duration-150">
            {event.group_name}
          </Link>
          {event.cohost_groups.length > 0 && (
            <span className="text-sm text-zinc-400">
              in partnership with{" "}
              {event.cohost_groups.map((g, i) => (
                <span key={g.group_id}>
                  {i > 0 && ", "}
                  <Link href={`/groups/${g.group_slug}`} className="text-sky-400 hover:text-sky-300 active:text-sky-300 transition-colors duration-150">
                    {g.group_name}
                  </Link>
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-black text-zinc-100 leading-tight break-words">{event.title}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 sm:pt-1">
            <ShareButton variant="icon" content={{ title: event.title, text: `Join ${event.group_name}'s cleanup event.` }} />
            {effectiveIsOrganizer && (
              <>
                <Link
                  href={`/groups/${event.group_slug}/events/${event.id}/edit`}
                  title="Edit"
                  className="w-11 h-11 flex items-center justify-center rounded-full border border-emerald-800/60 bg-emerald-950/30 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50 hover:border-emerald-700 active:text-emerald-300 active:bg-emerald-950/50 active:border-emerald-700 active:scale-[0.9] transition-[background-color,border-color,color,transform] duration-150 shrink-0 touch-manipulation"
                >
                  <EditGlyph />
                </Link>
                {!isCancelled && (
                  <button
                    onClick={() => setConfirmingCancel(true)}
                    disabled={cancelLoading}
                    title={cancelLoading ? "Cancelling…" : "Cancel event"}
                    className="w-11 h-11 flex items-center justify-center rounded-full border border-red-800/60 bg-red-950/30 text-red-400 hover:text-red-300 hover:bg-red-950/50 hover:border-red-700 active:text-red-300 active:bg-red-950/50 active:border-red-700 active:scale-[0.9] transition-[background-color,border-color,color,transform] duration-150 shrink-0 touch-manipulation disabled:opacity-40 disabled:active:text-red-400"
                  >
                    {cancelLoading ? (
                      <div className="w-4 h-4 border-2 border-red-400/60 border-t-red-200 rounded-full animate-spin" />
                    ) : (
                      <CancelGlyph />
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="mt-1.5">
          {event.logging_mode === "organizer_total" ? (
            <span
              title="The organizer logs one combined total for everyone at the end."
              className="inline-flex items-center gap-1 text-xs text-amber-300 bg-amber-950/40 border border-amber-700/40 rounded-full px-2 py-0.5 cursor-help"
            >
              👥 Team log
            </span>
          ) : (
            <span
              title="Attendees log their own cleanup individually from the map."
              className="inline-flex items-center gap-1 text-xs text-sky-300 bg-sky-950/40 border border-sky-700/40 rounded-full px-2 py-0.5 cursor-help"
            >
              🙋 Self-log
            </span>
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
        {(event.total_small_bags + event.total_large_bags > 0 ||
          event.total_pounds > 0 ||
          event.reports_cleared_count > 0) && (
          <div className="mt-3 rounded-xl border border-emerald-800/50 bg-gradient-to-br from-emerald-950/40 to-emerald-950/10 px-4 py-3.5 shadow-elevation-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-3">
              Logged so far
            </p>
            <div className="flex items-center gap-5 flex-wrap">
              {event.total_small_bags > 0 && (
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-500/15 text-lg shrink-0"
                  >
                    🛍️
                  </span>
                  <div>
                    <p className="text-2xl font-black text-zinc-100 leading-none">{event.total_small_bags}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">small bag{event.total_small_bags === 1 ? "" : "s"}</p>
                  </div>
                </div>
              )}
              {event.total_large_bags > 0 && (
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-500/15 text-lg shrink-0"
                  >
                    🗑️
                  </span>
                  <div>
                    <p className="text-2xl font-black text-zinc-100 leading-none">{event.total_large_bags}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">large bag{event.total_large_bags === 1 ? "" : "s"}</p>
                  </div>
                </div>
              )}
              {event.total_pounds > 0 && (
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-500/15 text-lg shrink-0"
                  >
                    ⚖️
                  </span>
                  <div>
                    <p className="text-2xl font-black text-zinc-100 leading-none">
                      {event.total_pounds.toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">lbs</p>
                  </div>
                </div>
              )}
            </div>
            {event.reports_cleared_count > 0 && (
              <p className="mt-3 text-xs font-semibold text-orange-400">
                🧹 Cleared {event.reports_cleared_count} trash report{event.reports_cleared_count === 1 ? "" : "s"}{" "}
                (+{event.report_clear_bonus_value} pts)
              </p>
            )}
            {event.volume_bonus_tiers > 0 && event.volume_bonus_applied && (
              <p className="mt-3 text-xs font-semibold text-amber-400">
                🎉 Volume bonus:{" "}
                <span className="line-through text-zinc-500 font-normal">
                  {event.team_total_base_value.toLocaleString()} pts
                </span>{" "}
                →{" "}
                {(event.team_total_base_value * event.volume_bonus_multiplier).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{" "}
                pts (+{Math.round((event.volume_bonus_multiplier - 1) * 100)}%)
              </p>
            )}
          </div>
        )}
        {event.description && <p className="mt-3 text-sm text-zinc-300 leading-relaxed">{event.description}</p>}
        {event.external_link && (
          <a
            href={event.external_link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300 active:text-sky-300 transition-colors duration-150 underline"
          >
            Event link ↗
          </a>
        )}
      </div>

      {event.is_organizer && !isCancelled && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
          {previewAsAttendee ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-700/60 bg-sky-900/30 px-2.5 py-1 text-xs font-semibold text-sky-300">
              👁️ Previewing what attendees see
            </span>
          ) : (
            <div className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900 p-0.5 text-xs font-semibold">
              {(["guided", "full"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeViewMode(mode)}
                  className={`px-3 py-1.5 rounded-md transition-colors touch-manipulation ${
                    viewMode === mode
                      ? "bg-sky-500 text-sky-950"
                      : "text-zinc-400 hover:text-zinc-200 active:text-zinc-200"
                  }`}
                >
                  {mode === "guided" ? "Guided" : "Full page"}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setPreviewAsAttendee((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors touch-manipulation ${
              previewAsAttendee
                ? "border-sky-600 bg-sky-500 text-sky-950 hover:bg-sky-400 active:bg-sky-400"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 active:text-zinc-200 active:border-zinc-500"
            }`}
          >
            {previewAsAttendee ? "Exit preview" : "👁️ Preview what attendees see"}
          </button>
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {(() => {
        const checkinSection = isCancelled ? null : !userId ? (
          <Link
            href={`/login?next=/cleanup-events/${event.id}`}
            className="block text-center px-4 py-2.5 bg-sky-500 hover:bg-sky-400 active:bg-sky-400 active:scale-[0.97] text-sky-950 text-sm font-semibold rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
          >
            Log in to RSVP
          </Link>
        ) : (
          <div className="border border-zinc-800 rounded-xl p-4 space-y-3 shadow-elevation-1">
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
                  {(event.viewer_rsvp?.checkin_points ?? checkInPointsAwarded ?? 0) > 0 &&
                    ` · +${event.viewer_rsvp?.checkin_points ?? checkInPointsAwarded} pts`}
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
                        : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 active:text-zinc-200 active:border-zinc-500 active:scale-[0.97]"
                    }`}
                  >
                    {status === "going" ? "Going" : status === "maybe" ? "Maybe" : "Can't go"}
                  </button>
                );
              })}
            </div>

            {!viewerCheckedIn && (
              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <p className="text-xs text-emerald-400/80 font-medium">
                  🏅 Earn <SettingValue value={checkinPointValue} loading={checkinPointValue === undefined} /> points for checking in
                </p>
                <button
                  onClick={handleCheckInWithLocation}
                  disabled={checkInLoading}
                  className="w-full px-3 py-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-600 active:scale-[0.97] disabled:active:scale-100 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
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
                      className="px-3 py-2 text-sm font-medium bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-600 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-50 text-white rounded-lg transition-[background-color,transform] duration-150 touch-manipulation shrink-0"
                    >
                      Submit
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowJoinCodeField(true)}
                    className="w-full text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150"
                  >
                    Have a join code instead?
                  </button>
                )}
              </div>
            )}

            {event.logging_mode === "organizer_total" ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-lg shadow-elevation-1">
                <span aria-hidden="true">ℹ️</span>
                The organizer will log the event totals for everyone.
              </div>
            ) : (
              <Link
                href={`/campaigns/${event.campaign_slug}?lat=${event.lat}&lng=${event.lng}`}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold bg-sky-500 hover:bg-sky-400 active:bg-sky-400 active:scale-[0.97] text-sky-950 rounded-lg shadow-md shadow-sky-500/30 transition-[background-color,transform] duration-150 touch-manipulation"
              >
                <span aria-hidden="true">📍</span>
                Log your cleanup on the map
              </Link>
            )}
          </div>
        );

        const checkedInCount = event.rsvps.filter((r) => r.checked_in_at).length;
        const checkinSummarySection = effectiveIsOrganizer && !isCancelled && (
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <span className="font-semibold text-zinc-200">{goingCount} <span className="font-normal text-zinc-500">RSVP&apos;d yes</span></span>
              <span className="text-zinc-700">·</span>
              <span className="font-semibold text-emerald-400">{checkedInCount} <span className="font-normal text-zinc-500">checked in</span></span>
            </div>
            <button
              type="button"
              onClick={() => refresh()}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.97] transition-[border-color,transform] duration-150 touch-manipulation shrink-0"
            >
              ↻ Refresh
            </button>
          </div>
        );

        const checkinRosterSection = effectiveIsOrganizer && !isCancelled && event.rsvps.length > 0 && (
          <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1">
            <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/40">
              <span className="text-sm font-semibold text-zinc-300">
                Attendees <span className="text-zinc-500 font-normal">({event.rsvps.length})</span>
              </span>
            </div>
            <ul className="divide-y divide-zinc-800/60">
              {event.rsvps.map((r) => (
                <li key={r.user_id} className="px-4 py-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Avatar
                      avatarUrl={r.avatar_url}
                      name={r.display_name ?? r.username ?? "?"}
                      username={r.username}
                      size="xs"
                    />
                    <span className="text-sm text-zinc-200 truncate">{r.display_name ?? r.username ?? "Unknown"}</span>
                  </div>
                  {r.checked_in_at ? (
                    <span className="text-xs text-emerald-400 whitespace-nowrap shrink-0">✓ checked in</span>
                  ) : (
                    <OrganizerCheckInButton
                      cleanupId={event.id}
                      organizerUserId={userId!}
                      attendeeUserId={r.user_id}
                      onCheckedIn={async (pointsAwarded) => {
                        if (pointsAwarded > 0) {
                          setRecentCheckinPoints((prev) => ({ ...prev, [r.user_id]: pointsAwarded }));
                          if (r.user_id === userId) refreshUserPoints(userId);
                        }
                        await refresh();
                      }}
                      onError={(msg) => setError(extractErrorMessage(new Error(msg), "Failed to check in attendee"))}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        );

        const doCleanupSection = (
          <div className="border border-zinc-800 rounded-xl p-5 text-center space-y-1.5 shadow-elevation-1">
            <p className="text-2xl" aria-hidden="true">🧹</p>
            <p className="text-sm font-semibold text-zinc-200">Time to clean!</p>
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">
              {event.logging_mode === "organizer_total"
                ? "Nothing to do here. Get out there with your team and pick up trash, then come back to this page to log the team's totals when you're done."
                : "Nothing to do here. Get out there and pick up trash. Attendees log their own totals on the map as they go."}
            </p>
          </div>
        );

        const joinCodeSection = effectiveIsOrganizer && event.join_code && (
          <div className="border border-amber-700/40 bg-amber-900/10 rounded-xl p-4">
            <p className="text-xs text-amber-400/80 mb-1">Organizer join code</p>
            <p className="text-2xl font-black tracking-widest text-amber-300">{event.join_code}</p>
            <p className="mt-1 text-xs text-zinc-500">Share this with attendees who can&apos;t check in by location.</p>
          </div>
        );

        const logSection = effectiveIsOrganizer && !isCancelled && event.logging_mode === "organizer_total" && (
          <LogTeamTotalForm
            cleanupId={event.id}
            organizerUserId={userId!}
            rsvps={event.rsvps}
            eventLat={event.lat}
            eventLng={event.lng}
            eventRoute={event.route}
            persistedReportsClearedCount={event.reports_cleared_count}
            onLogged={refresh}
          />
        );

        const attendeesSection = (
          <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1">
            <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-zinc-300">
                Attendees <span className="text-zinc-500 font-normal">({event.rsvps.length})</span>
              </span>
              {effectiveIsOrganizer && !isCancelled && (
                <AddAttendeeControl
                  cleanupId={event.id}
                  existingUserIds={event.rsvps.map((r) => r.user_id)}
                  onAdded={refresh}
                />
              )}
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
                        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                          <Avatar
                            avatarUrl={r.avatar_url}
                            name={r.display_name ?? r.username ?? "?"}
                            username={r.username}
                            size="xs"
                          />
                          {r.username ? (
                            <Link href={`/users/${encodeURIComponent(r.username)}`} className="text-sm text-zinc-200 break-words hover:text-zinc-100 active:text-zinc-100 transition-colors duration-150">
                              {r.display_name ?? r.username}
                            </Link>
                          ) : (
                            <span className="text-sm text-zinc-200 break-words">{r.display_name ?? "Unknown"}</span>
                          )}
                          <span className="text-xs text-zinc-600 shrink-0">{r.status}</span>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {r.checked_in_at ? (
                            <span className="text-xs text-emerald-400 whitespace-nowrap">
                              ✓ checked in
                              {(r.checkin_points || recentCheckinPoints[r.user_id])
                                ? ` · +${r.checkin_points || recentCheckinPoints[r.user_id]} pts`
                                : ""}
                            </span>
                          ) : effectiveIsOrganizer ? (
                            <OrganizerCheckInButton
                              cleanupId={event.id}
                              organizerUserId={userId!}
                              attendeeUserId={r.user_id}
                              onCheckedIn={async (pointsAwarded) => {
                                if (pointsAwarded > 0) {
                                  setRecentCheckinPoints((prev) => ({ ...prev, [r.user_id]: pointsAwarded }));
                                  if (r.user_id === userId) refreshUserPoints(userId);
                                }
                                await refresh();
                              }}
                              onError={(msg) => setError(extractErrorMessage(new Error(msg), "Failed to check in attendee"))}
                            />
                          ) : null}
                          {effectiveIsOrganizer && (
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
                          {r.checkin_points > 0 && (
                            <span
                              className="text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded px-1.5 py-0.5 shrink-0"
                              title="Credited for checking in to the event"
                            >
                              +{r.checkin_points.toLocaleString()} pts · check-in
                            </span>
                          )}
                          {r.team_total_points > 0 && (
                            <span
                              className="text-xs text-sky-400 bg-sky-400/10 border border-sky-400/30 rounded px-1.5 py-0.5 shrink-0"
                              title={
                                r.small_bags + r.large_bags === 0 && r.pounds === 0
                                  ? "Credited as their share of an organizer's team-total log, not an individually logged amount"
                                  : undefined
                              }
                            >
                              +{r.team_total_points.toLocaleString()} pts
                              {r.small_bags + r.large_bags === 0 && r.pounds === 0 && " · team total"}
                            </span>
                          )}
                          {r.checkin_points > 0 && r.team_total_points > 0 && (
                            <span className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded px-1.5 py-0.5 shrink-0">
                              = {r.points.toLocaleString()} pts
                            </span>
                          )}
                        </div>
                      )}

                      {effectiveIsOrganizer && r.user_id !== userId && (
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
        );

        const photosSection = (event.photos.length > 0 || (userId && !isCancelled)) && (
          <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1">
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
                {event.photos.map((photo, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${photo.url}-${i}`}
                    src={photo.url}
                    alt=""
                    onClick={() => setLightboxIndex(i)}
                    className="w-full aspect-square object-cover rounded-lg cursor-pointer bg-zinc-800 border border-zinc-800 hover:border-zinc-600 active:border-zinc-600 active:scale-[0.97] transition-[border-color,transform] duration-150 touch-manipulation shadow-elevation-1"
                  />
                ))}
              </div>
            )}
          </div>
        );

        if (effectiveIsOrganizer && !isCancelled && viewMode === "guided") {
          const attendeesStepIndex = 2 + (logSection ? 1 : 0);
          const manageAttendeesNote = (
            <button
              type="button"
              onClick={() => setGuidedStep(attendeesStepIndex)}
              className="w-full text-left px-3 py-2 text-xs text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-lg hover:border-zinc-600 hover:text-zinc-300 active:border-zinc-600 active:text-zinc-300 transition-colors duration-150 touch-manipulation"
            >
              Need to add someone, see bag/point totals, or manage organizers? Go to <span className="text-sky-400 font-medium">Manage attendee data →</span>
            </button>
          );
          const steps: { key: string; label: string; content: React.ReactNode }[] = [
            { key: "checkin", label: "Check in attendees", content: <>{checkinSection}{joinCodeSection}{checkinSummarySection}{checkinRosterSection}</> },
            { key: "clean", label: "Do the cleanup", content: doCleanupSection },
            ...(logSection ? [{ key: "log", label: "Log the cleanup", content: logSection as React.ReactNode }] : []),
            { key: "attendees", label: "Manage attendee data", content: attendeesSection },
            ...(photosSection ? [{ key: "photos", label: "Photos", content: photosSection as React.ReactNode }] : []),
          ];
          const activeStepIndex = Math.min(guidedStep, steps.length - 1);
          const prevNextRow = (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={activeStepIndex === 0}
                onClick={() => setGuidedStep(activeStepIndex - 1)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none transition-[border-color,transform] duration-150 touch-manipulation"
              >
                ← Prev
              </button>
              <span className="text-xs text-zinc-500">
                Step {activeStepIndex + 1} of {steps.length}
              </span>
              <button
                type="button"
                disabled={activeStepIndex === steps.length - 1}
                onClick={() => setGuidedStep(activeStepIndex + 1)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.97] disabled:opacity-30 disabled:pointer-events-none transition-[border-color,transform] duration-150 touch-manipulation"
              >
                Next →
              </button>
            </div>
          );
          return (
            <div className="space-y-4">
              {prevNextRow}
              <div className="flex items-center gap-2 flex-wrap">
                {steps.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setGuidedStep(i)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors touch-manipulation ${
                      i === activeStepIndex
                        ? "border-sky-500 bg-sky-950/40 text-sky-300"
                        : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 active:text-zinc-200 active:border-zinc-500"
                    }`}
                  >
                    {i + 1}. {s.label}
                  </button>
                ))}
              </div>
              {activeStepIndex === 0 && manageAttendeesNote}
              <div className="space-y-4">{steps[activeStepIndex].content}</div>
              {prevNextRow}
            </div>
          );
        }

        return (
          <>
            {checkinSection}
            {checkinSummarySection}
            {joinCodeSection}
            {logSection}
            {attendeesSection}
            {photosSection}
          </>
        );
      })()}

      {lightboxIndex !== null && (
        <Lightbox
          images={event.photos.map((p) => p.url)}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          renderActions={(_url, i) => {
            const photo = event.photos[i];
            if (!photo || !userId) return null;
            return (
              <ReportPhotoButton
                contentType={photo.content_type}
                contentId={photo.content_id}
                photoUrl={photo.url}
                userId={userId}
                onHidden={() => {
                  setLightboxIndex(null);
                  refresh();
                }}
              />
            );
          }}
        />
      )}
      <ConfirmModal
        open={confirmingCancel}
        title="Cancel event?"
        message={`Cancel "${event.title}"? Attendees will see this event as cancelled.`}
        confirmLabel="Cancel event"
        cancelLabel="Keep event"
        onConfirm={handleCancelEvent}
        onCancel={() => setConfirmingCancel(false)}
      />
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
      <label className="text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-700 active:scale-[0.97] border border-zinc-700 rounded-lg px-3 py-1.5 cursor-pointer transition-[background-color,transform] duration-150 touch-manipulation">
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

function AddAttendeeControl({
  cleanupId,
  existingUserIds,
  onAdded,
}: {
  cleanupId: string;
  existingUserIds: string[];
  onAdded: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await searchUsers(query.trim());
        if (!cancelled) setResults(found.filter((u) => !existingUserIds.includes(u.id)));
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err, "Failed to search users"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, existingUserIds]);

  const visibleResults = query.trim().length < 2 ? [] : results;

  const select = async (u: UserSearchResult) => {
    setAdding(u.id);
    try {
      await rsvpToCleanupEvent({ cleanupId, userId: u.id, status: "going" });
      await onAdded();
      setOpen(false);
      setQuery("");
      setResults([]);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to add attendee"));
    } finally {
      setAdding(null);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline shrink-0"
      >
        + Add attendee
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search by username..."
        className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 w-40"
      />
      {(loading || visibleResults.length > 0 || error) && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-lg divide-y divide-zinc-800 max-h-48 overflow-y-auto z-10 shadow-lg">
          {loading && <p className="px-3 py-2 text-xs text-zinc-600">Searching…</p>}
          {error && <p className="px-3 py-2 text-xs text-red-400">{error}</p>}
          {!loading &&
            visibleResults.map((u) => (
              <button
                key={u.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(u)}
                disabled={adding === u.id}
                className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 active:bg-zinc-800 disabled:opacity-50 disabled:active:bg-transparent transition-colors duration-150"
              >
                {u.display_name ?? u.username ?? "Unknown"}
                {u.username && u.display_name && (
                  <span className="text-zinc-600 text-xs"> @{u.username}</span>
                )}
              </button>
            ))}
        </div>
      )}
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
  onCheckedIn: (pointsAwarded: number) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const result = await organizerCheckInAttendee({ cleanupId, organizerUserId, attendeeUserId });
      await onCheckedIn(result.points_awarded);
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
      className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline shrink-0 disabled:opacity-50 disabled:active:text-zinc-500"
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

  const { values: pointValues, loading: pointValuesLoading } = useGameSettings([
    "small_bag_value",
    "large_bag_value",
    "pound_value",
  ] as const);
  const bagValuesReady = pointValues.small_bag_value !== undefined && pointValues.large_bag_value !== undefined;
  const poundValueReady = pointValues.pound_value !== undefined;
  const bagPoints = bagValuesReady
    ? (Number(smallBags) || 0) * pointValues.small_bag_value! + (Number(largeBags) || 0) * pointValues.large_bag_value!
    : 0;
  const poundPoints = poundValueReady ? (Number(pounds) || 0) * pointValues.pound_value! : 0;
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
        className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline shrink-0"
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
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2 mb-3 shadow-elevation-1">
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
                  : "border-zinc-800 hover:border-zinc-600 active:border-zinc-600 active:scale-[0.97]"
              }`}
            >
              <p className="text-xs font-semibold text-zinc-200">By bags</p>
              <p className="text-[10px] text-zinc-500">
                {smallBags || 0}×<SettingValue value={pointValues.small_bag_value} loading={pointValuesLoading} /> + {largeBags || 0}×<SettingValue value={pointValues.large_bag_value} loading={pointValuesLoading} />
              </p>
              <p className="text-sm font-bold text-emerald-400 mt-0.5">
                {bagValuesReady ? `${bagPoints.toLocaleString()} pts` : "— pts"}
              </p>
            </button>
            <button
              onClick={() => setScoringMethod("pounds")}
              className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${
                scoringMethod === "pounds"
                  ? "border-emerald-600 bg-emerald-900/20"
                  : "border-zinc-800 hover:border-zinc-600 active:border-zinc-600 active:scale-[0.97]"
              }`}
            >
              <p className="text-xs font-semibold text-zinc-200">By pounds</p>
              <p className="text-[10px] text-zinc-500">
                {pounds || 0}×<SettingValue value={pointValues.pound_value} loading={pointValuesLoading} />
              </p>
              <p className="text-sm font-bold text-emerald-400 mt-0.5">
                {poundValueReady ? `${poundPoints.toLocaleString()} pts` : "— pts"}
              </p>
            </button>
          </div>
        </div>
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={loading || hasNegative}
            className="flex-1 px-3 py-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-600 active:scale-[0.97] disabled:active:scale-100 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
          >
            {loading ? "Logging…" : "Log contribution"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Mirrors backend/app/services/contribution_scoring.py — keep these in sync.

// Points are awarded in whole/half increments server-side — mirror that here so the
// preview matches what actually gets recorded.
function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function LogTeamTotalForm({
  cleanupId,
  organizerUserId,
  rsvps,
  eventLat,
  eventLng,
  eventRoute,
  persistedReportsClearedCount,
  onLogged,
}: {
  cleanupId: string;
  organizerUserId: string;
  rsvps: CleanupEventDetailData["rsvps"];
  eventLat: number;
  eventLng: number;
  eventRoute: RouteLineString | null;
  persistedReportsClearedCount: number;
  onLogged: () => Promise<void>;
}) {
  const [smallBags, setSmallBags] = useState("");
  const [largeBags, setLargeBags] = useState("");
  const [pounds, setPounds] = useState("");
  const [pool, setPool] = useState<"checked_in" | "going">("checked_in");
  const [alsoCheckIn, setAlsoCheckIn] = useState(false);
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
  const [nearbyReports, setNearbyReports] = useState<NearbyReport[]>([]);
  const [clearNearbyReports, setClearNearbyReports] = useState(false);

  const loadLogs = async () => {
    try {
      setLogs(await getTeamTotalLogs(cleanupId));
    } catch {
      // Non-critical — history is a nice-to-have, don't block the form on it.
    }
  };

  const loadNearbyReports = async () => {
    try {
      const { reports } = await getNearbyReports({ cleanupId, organizerUserId });
      setNearbyReports(reports);
    } catch {
      // Non-critical — preview only, don't block the form on it.
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no external system to subscribe to instead
    loadLogs();
    loadNearbyReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupId]);

  // Excludes only attendees credited via self-log or "log for them" — those are never
  // touched by log-team-total. Attendees currently credited via a prior team-total log stay
  // eligible here, since submitting again wipes and re-splits their credit from scratch.
  const candidates = rsvps.filter(
    (r) => r.status === "going" && (pool === "going" || r.checked_in_at) && !r.has_individual_contribution
  );

  const { values: pointValues, loading: pointValuesLoading } = useGameSettings([
    "small_bag_value",
    "large_bag_value",
    "pound_value",
    "cleanup_event_checkin_value",
    "cleanup_event_volume_bonus_tier_points",
    "cleanup_event_volume_bonus_per_tier",
    "cleanup_event_volume_bonus_max_multiplier",
    "cleanup_event_report_clear_bonus_points",
  ] as const);
  const bagValuesReady = pointValues.small_bag_value !== undefined && pointValues.large_bag_value !== undefined;
  const poundValueReady = pointValues.pound_value !== undefined;
  const bagPoints = bagValuesReady
    ? (Number(smallBags) || 0) * pointValues.small_bag_value! + (Number(largeBags) || 0) * pointValues.large_bag_value!
    : 0;
  const poundPoints = poundValueReady ? (Number(pounds) || 0) * pointValues.pound_value! : 0;
  const totalPoints = scoringMethod === "pounds" ? poundPoints : bagPoints;
  const reportClearBonusPerReport = pointValues.cleanup_event_report_clear_bonus_points ?? 0;
  // The backend recomputes the report-clear bonus from every report this event has ever
  // closed (resolved_by_cleanup_id), not just reports closed in this submission — so a
  // relog keeps counting reports cleared on a prior submission even if the checkbox isn't
  // checked again this time. Mirror that here: persisted count always counts, plus
  // whatever's newly about to be closed if the checkbox is checked.
  const reportsCountedThisSubmit = persistedReportsClearedCount + (clearNearbyReports ? nearbyReports.length : 0);
  const reportClearBonusTotal = reportsCountedThisSubmit * reportClearBonusPerReport;
  // Report-clear bonus is folded into the base before the volume-bonus multiplier below,
  // mirroring the backend's log_team_total ordering — a big report haul can itself help
  // unlock a tier, and the bonus gets multiplied along with the rest of the total.
  const baseWithReportBonus = totalPoints + reportClearBonusTotal;
  const tierPoints = pointValues.cleanup_event_volume_bonus_tier_points ?? 50;
  const perTierBonus = pointValues.cleanup_event_volume_bonus_per_tier ?? 0.1;
  const maxMultiplier = pointValues.cleanup_event_volume_bonus_max_multiplier ?? 2;
  const volumeBonusTiers = tierPoints > 0 ? Math.floor(baseWithReportBonus / tierPoints) : 0;
  const volumeBonusMultiplier = Math.min(1 + volumeBonusTiers * perTierBonus, maxMultiplier);
  const grandTotalPoints = baseWithReportBonus * volumeBonusMultiplier;
  const perAttendee = candidates.length > 0 ? roundHalf(grandTotalPoints / candidates.length) : 0;
  const tierUnits = [
    poundValueReady ? `${(tierPoints / pointValues.pound_value!).toLocaleString()} lbs` : null,
    bagValuesReady ? `${(tierPoints / pointValues.small_bag_value!).toLocaleString()} small bags` : null,
    bagValuesReady
      ? `${Math.round(tierPoints / pointValues.large_bag_value!).toLocaleString()} large bags`
      : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const volumeBonusTip = `Volume bonus: every ${tierPoints} points' worth logged as a team total${
    tierUnits ? ` (${tierUnits})` : ""
  } adds +${Math.round(perTierBonus * 100)}% more points to the total, up to ${maxMultiplier}x.`;
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
        alsoCheckIn: pool === "going" && alsoCheckIn,
        clearNearbyReports,
      });
      await onLogged();
      await loadLogs();
      await loadNearbyReports();
      refreshUserPoints(organizerUserId);
      setSmallBags("");
      setLargeBags("");
      setPounds("");
      setOverrides({});
      setClearNearbyReports(false);
      const checkinNote = res.newly_checked_in_count
        ? ` ${res.newly_checked_in_count} newly checked in and awarded check-in points.`
        : "";
      const bonusNote = res.volume_bonus_tiers
        ? ` Volume bonus: +${Math.round((res.volume_bonus_multiplier - 1) * 100)}% (${res.volume_bonus_tiers} tier${res.volume_bonus_tiers === 1 ? "" : "s"}) applied to the total!`
        : "";
      const reportsNote = res.reports_newly_cleared_count
        ? ` Cleared ${res.reports_newly_cleared_count} nearby trash report${res.reports_newly_cleared_count === 1 ? "" : "s"} (${res.reports_cleared_count} total for this event, +${res.report_clear_bonus_value} pts).`
        : res.reports_cleared_count
        ? ` ${res.reports_cleared_count} previously-cleared report${res.reports_cleared_count === 1 ? "" : "s"} still counted (+${res.report_clear_bonus_value} pts).`
        : "";
      setResult(
        `Credited ${res.credited_count} attendee${res.credited_count === 1 ? "" : "s"}.${checkinNote}${bonusNote}${reportsNote}`
      );
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to log team total"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-zinc-800 rounded-xl p-4 space-y-3 shadow-elevation-1">
      <div>
        <p className="text-sm font-semibold text-zinc-300">Log team total</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          Enter the whole event&apos;s haul and split credit equally across eligible attendees.
        </p>
      </div>
      <button
        onClick={() => setWarningOpen((v) => !v)}
        className="w-full text-left text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2 hover:bg-amber-500/15 active:bg-amber-500/15 active:scale-[0.98] transition-[background-color,transform] duration-150 touch-manipulation"
      >
        {warningOpen ? (
          <>
            Enter the event&apos;s <span className="font-semibold">full</span> total each time, not just
            what&apos;s new. Submitting wipes any credit from a previous team-total submission and
            re-splits the full new total across everyone currently eligible (see the log history below
            for a record of past totals). Attendees credited another way, whether their own self-logged
            contribution or an organizer&apos;s &quot;Log for them&quot;, are untouched and stay
            excluded from the split.{" "}
            <span className="underline">Show less</span>
          </>
        ) : (
          <>
            Re-running this wipes and re-splits the full total. Enter the whole event total, not just
            what&apos;s new.{" "}
            <span className="underline">Read more</span>
          </>
        )}
      </button>
      <p className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2">
        🎉 {volumeBonusTip}
      </p>
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
            onClick={() => {
              setPool(p);
              if (p !== "going") setAlsoCheckIn(false);
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              pool === p
                ? "bg-emerald-700 border-emerald-700 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 active:text-zinc-200 active:border-zinc-500 active:scale-[0.97]"
            }`}
          >
            {p === "checked_in" ? "Checked in" : "Everyone going"}
          </button>
        ))}
      </div>

      {pool === "going" && (
        <label className="flex items-start gap-2 text-[11px] text-zinc-500 pl-0.5">
          <input
            type="checkbox"
            checked={alsoCheckIn}
            onChange={(e) => setAlsoCheckIn(e.target.checked)}
            className="mt-0.5 accent-emerald-600"
          />
          <span>
            Also check in anyone in this pool who isn&apos;t already checked in, and award them{" "}
            <SettingValue value={pointValues.cleanup_event_checkin_value} loading={pointValuesLoading} />
            {" "}check-in points. Leave unchecked to only credit the team total. RSVPs aren&apos;t verified attendance.
          </span>
        </label>
      )}

      {(nearbyReports.length > 0 || persistedReportsClearedCount > 0) && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2 shadow-elevation-1">
          {persistedReportsClearedCount > 0 && (
            <p className="text-[11px] text-zinc-500">
              🧹 {persistedReportsClearedCount} report{persistedReportsClearedCount === 1 ? "" : "s"} already
              cleared for this event — that bonus is kept and re-counted on every relog, checkbox or not.
            </p>
          )}
          {nearbyReports.length > 0 && (
            <>
              <p className="text-xs font-semibold text-zinc-300">
                {nearbyReports.length} nearby trash report{nearbyReports.length === 1 ? "" : "s"}
              </p>
              <NearbyReportsMap
                eventLat={eventLat}
                eventLng={eventLng}
                eventRoute={eventRoute}
                reports={nearbyReports}
              />
              <button
                type="button"
                onClick={() => setClearNearbyReports((v) => !v)}
                aria-pressed={clearNearbyReports}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  clearNearbyReports
                    ? "border-orange-500 bg-orange-900/20"
                    : "border-zinc-700 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.99]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center text-sm font-bold transition-colors ${
                      clearNearbyReports
                        ? "bg-orange-500 border-orange-500 text-orange-950"
                        : "border-zinc-600 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">
                      🧹 Also clear all {nearbyReports.length} nearby trash report{nearbyReports.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Marks them cleaned up and awards{" "}
                      <SettingValue
                        value={pointValues.cleanup_event_report_clear_bonus_points}
                        loading={pointValuesLoading}
                      />
                      {" "}pts each on top of the team total
                      {!pointValuesLoading && (
                        <span className="font-semibold text-orange-400">
                          {" "}(+{(nearbyReports.length * reportClearBonusPerReport).toLocaleString()} pts total)
                        </span>
                      )}
                      .
                    </p>
                  </div>
                </div>
              </button>
            </>
          )}
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2 shadow-elevation-1">
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
                : "border-zinc-800 hover:border-zinc-600 active:border-zinc-600 active:scale-[0.97]"
            }`}
          >
            <p className="text-xs font-semibold text-zinc-200">By bags</p>
            <p className="text-[10px] text-zinc-500">
              {smallBags || 0}×<SettingValue value={pointValues.small_bag_value} loading={pointValuesLoading} /> + {largeBags || 0}×<SettingValue value={pointValues.large_bag_value} loading={pointValuesLoading} />
            </p>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">
              {bagValuesReady ? `${bagPoints.toLocaleString()} pts` : "— pts"}
            </p>
          </button>
          <button
            onClick={() => setScoringMethod("pounds")}
            className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${
              scoringMethod === "pounds"
                ? "border-emerald-600 bg-emerald-900/20"
                : "border-zinc-800 hover:border-zinc-600 active:border-zinc-600 active:scale-[0.97]"
            }`}
          >
            <p className="text-xs font-semibold text-zinc-200">By pounds</p>
            <p className="text-[10px] text-zinc-500">
              {pounds || 0}×<SettingValue value={pointValues.pound_value} loading={pointValuesLoading} />
            </p>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">
              {poundValueReady ? `${poundPoints.toLocaleString()} pts` : "— pts"}
            </p>
          </button>
        </div>
        <p className="text-xs text-zinc-400">
          Total:{" "}
          <span className="font-semibold text-zinc-100">
            {(scoringMethod === "pounds" ? poundValueReady : bagValuesReady)
              ? `${(volumeBonusTiers > 0 || reportClearBonusTotal > 0 ? grandTotalPoints : totalPoints).toLocaleString()} pts`
              : "— pts"}
          </span>
          {candidates.length > 0 && (scoringMethod === "pounds" ? poundValueReady : bagValuesReady) && (
            <>
              {" "}
              · ~<span className="font-semibold text-zinc-100">{perAttendee.toLocaleString(undefined, { maximumFractionDigits: 1 })} pts</span> each across {candidates.length} attendee{candidates.length === 1 ? "" : "s"}
            </>
          )}
        </p>
        {reportClearBonusTotal > 0 && (
          <p className="text-[11px] font-semibold text-amber-400">
            🧹 Report clear bonus: +{reportClearBonusTotal.toLocaleString()} pts ({reportsCountedThisSubmit} report
            {reportsCountedThisSubmit === 1 ? "" : "s"} × {reportClearBonusPerReport} pts, including{" "}
            {persistedReportsClearedCount} already cleared) — {totalPoints.toLocaleString()} pts base
            → {baseWithReportBonus.toLocaleString()} pts, before the volume bonus below
          </p>
        )}
        {baseWithReportBonus > 0 &&
          (scoringMethod === "pounds" ? poundValueReady : bagValuesReady) &&
          (volumeBonusTiers > 0 ? (
            <p className="text-[11px] font-semibold text-amber-400">
              🎉 Volume bonus: +{Math.round((volumeBonusMultiplier - 1) * 100)}% ({volumeBonusTiers} tier
              {volumeBonusTiers === 1 ? "" : "s"}) — {baseWithReportBonus.toLocaleString()} pts →{" "}
              {grandTotalPoints.toLocaleString()} pts
            </p>
          ) : (
            <p className="text-[11px] text-zinc-500">
              {Math.max(0, tierPoints - baseWithReportBonus).toLocaleString()} more points&apos; worth to unlock a
              volume bonus
            </p>
          ))}
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
          className="text-xs text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150"
        >
          {logsOpen ? "Hide" : "Show"} log history{logs.length > 0 ? ` (${logs.length})` : ""}
        </button>
        {logsOpen &&
          (logs.length === 0 ? (
            <p className="text-xs text-zinc-600 mt-1.5">No team totals logged yet.</p>
          ) : (
            <div className="mt-1.5 space-y-1.5">
              {logs.map((log, i) => {
                const isCurrent = i === 0;
                return (
                  <div
                    key={log.id}
                    className={`flex items-center justify-between gap-2 text-xs border rounded-lg px-2.5 py-1.5 ${
                      isCurrent ? "border-zinc-800" : "border-zinc-900 opacity-60"
                    }`}
                  >
                    <div>
                      <div className="mb-0.5">
                        {isCurrent ? (
                          <span className="text-emerald-400 font-medium">Current</span>
                        ) : (
                          <span className="text-zinc-600">Overridden — no longer credited</span>
                        )}
                      </div>
                      <span className={isCurrent ? "text-zinc-300" : "text-zinc-500 line-through"}>
                        {log.small_bags ?? 0} small, {log.large_bags ?? 0} large
                        {log.pounds ? `, ${log.pounds} lbs` : ""}
                      </span>
                      <span className="text-zinc-600"> · </span>
                      <span className="text-zinc-500">
                        by {log.scoring_method === "pounds" ? "pounds" : "bags"}
                      </span>
                      <span className="text-zinc-600"> · </span>
                      <span className={isCurrent ? "text-emerald-400" : "text-zinc-500"}>
                        {log.total_value.toLocaleString()} pts
                      </span>
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
                );
              })}
            </div>
          ))}
      </div>

      <button
        onClick={() => setAdvancedOpen((v) => !v)}
        className="text-[11px] text-zinc-600 hover:text-zinc-400 active:text-zinc-400 transition-colors duration-150"
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
              className="text-xs text-sky-400 hover:text-sky-300 active:text-sky-300 disabled:opacity-40 disabled:hover:text-sky-400 disabled:active:text-sky-400 transition-colors duration-150"
            >
              Apply to all
            </button>
            <button onClick={clearAll} className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150">
              Clear (use auto split)
            </button>
          </div>

          <button
            onClick={() => setOverrideListOpen((v) => !v)}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 active:text-zinc-400 transition-colors duration-150"
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
        disabled={loading || hasNegative || candidates.length === 0}
        className="w-full mt-3 px-3 py-2 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-600 active:scale-[0.97] disabled:active:scale-100 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
      >
        {loading ? "Logging…" : candidates.length === 0 ? "No eligible attendees" : "Log team total"}
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
      className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline shrink-0 disabled:opacity-40 disabled:active:text-zinc-500"
    >
      {loading ? "…" : isOrganizer ? "Remove organizer" : "Make organizer"}
    </button>
  );
}
