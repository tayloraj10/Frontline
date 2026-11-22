import type { CleanupEventDetailData } from "@/lib/cleanupEvents";

export type EventPhase = "before" | "during" | "after";
export type FlagSeverity = "action" | "info";

export type OrganizerFlag = {
  id: string;
  phase: EventPhase;
  severity: FlagSeverity;
  message: string;
  /** DOM id of the section the flag's button scrolls to. */
  targetId: string;
  actionLabel: string;
};

/** Events with a start but no end are treated as over this long after they start. */
const DEFAULT_DURATION_MS = 4 * 60 * 60 * 1000;

type PhaseInput = Pick<CleanupEventDetailData, "scheduled_start" | "scheduled_end" | "check_in_window_start" | "check_in_window_end">;

function ms(v: string | null): number | null {
  return v ? new Date(v).getTime() : null;
}

export function getEventPhase(event: PhaseInput, now: number): EventPhase {
  const starts = [ms(event.scheduled_start), ms(event.check_in_window_start)].filter((v): v is number => v !== null);
  if (starts.length === 0) return "during";
  const start = Math.min(...starts);
  if (now < start) return "before";
  const end = ms(event.scheduled_end) ?? ms(event.check_in_window_end) ?? start + DEFAULT_DURATION_MS;
  return now > end ? "after" : "during";
}

type FlagInput = Pick<
  CleanupEventDetailData,
  "rsvps" | "going_count" | "is_full" | "logging_mode" | "total_small_bags" | "total_large_bags" | "total_pounds" | "photos" | "attendee_route_count"
>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Everything an organizer should look at, tagged with the lifecycle phase it belongs to.
 * `eligibleReports` is null until the nearby-report fetch resolves (no flag in that case).
 */
export function getOrganizerFlags(
  event: FlagInput,
  extras: { eligibleReports: number | null; canTrackRoutes: boolean },
): OrganizerFlag[] {
  const flags: OrganizerFlag[] = [];
  const going = event.rsvps.filter((r) => r.status === "going");
  const notCheckedIn = going.filter((r) => !r.checked_in_at);

  // Before
  if (event.going_count === 0) {
    flags.push({ id: "no-rsvps", phase: "before", severity: "info", message: "No one has RSVP'd yet.", targetId: "organizer-share", actionLabel: "Share" });
  }
  if (event.is_full) {
    flags.push({ id: "full", phase: "before", severity: "info", message: "This event is full.", targetId: "organizer-rsvps", actionLabel: "See RSVPs" });
  }

  // During
  if (notCheckedIn.length > 0) {
    flags.push({
      id: "not-checked-in",
      phase: "during",
      severity: "action",
      message: `${notCheckedIn.length} of ${going.length} going ${notCheckedIn.length === 1 ? "person is" : "people are"} not checked in.`,
      targetId: "organizer-roster",
      actionLabel: "Check in",
    });
  }

  // Photos and routes have to be captured while people are out cleaning.
  if (event.photos.length === 0) {
    flags.push({ id: "photos-during", phase: "during", severity: "info", message: "Take photos as you clean. Before and after shots work best.", targetId: "organizer-photos", actionLabel: "Add photos" });
  }
  // Route tracking only exists in the native app, so only prompt where it can be done.
  if (extras.canTrackRoutes && event.attendee_route_count === 0) {
    flags.push({ id: "routes-during", phase: "during", severity: "info", message: "Record your own route while you clean, and remind attendees to do the same.", targetId: "organizer-checkin", actionLabel: "Track route" });
  }

  // After
  if (event.logging_mode === "organizer_total") {
    const nothingLogged =
      event.total_small_bags + event.total_large_bags + event.total_pounds === 0 &&
      !event.rsvps.some((r) => r.points > 0 && r.team_total_points > 0);
    if (nothingLogged) {
      flags.push({ id: "totals", phase: "after", severity: "action", message: "Cleanup totals have not been logged.", targetId: "organizer-log", actionLabel: "Log totals" });
    }
  }
  if (extras.eligibleReports !== null && extras.eligibleReports > 0) {
    flags.push({
      id: "reports",
      phase: "after",
      severity: "action",
      message: `${plural(extras.eligibleReports, "trash report")} can be cleared for this cleanup.`,
      targetId: "organizer-log",
      actionLabel: "Review",
    });
  }
  if (event.photos.length === 0) {
    flags.push({ id: "photos", phase: "after", severity: "info", message: "No photos added yet.", targetId: "organizer-photos", actionLabel: "Add photos" });
  }
  // Routes can only be recorded while people are out cleaning, so after the event the
  // useful prompt is to review what came in, not to complain that nothing did.
  if (event.attendee_route_count > 0) {
    flags.push({
      id: "routes-review",
      phase: "after",
      severity: "info",
      message: `${plural(event.attendee_route_count, "route")} recorded. Review them.`,
      targetId: "organizer-routes",
      actionLabel: "Review routes",
    });
  }
  if (notCheckedIn.length > 0) {
    flags.push({
      id: "never-checked-in",
      phase: "after",
      severity: "info",
      message: `${plural(notCheckedIn.length, "going RSVP")} never checked in.`,
      targetId: "organizer-attendees",
      actionLabel: "Review",
    });
  }

  return flags;
}
