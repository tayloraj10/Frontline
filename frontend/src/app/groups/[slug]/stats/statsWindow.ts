export type Interval = "today" | "week" | "month" | "all";

export const INTERVAL_LABELS: Record<Interval, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

/** `interval` + `anchor` together identify one day/week/month (or all time, where
 * `anchor` is unused) -- e.g. { interval: "week", anchor: <any date in that week> }. */
export interface StatsWindow {
  interval: Interval;
  anchor: Date;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday of the week containing `date`, matching the backend's date_trunc('week', ...) boundary. */
export function mondayOf(date: Date): Date {
  const dayOfWeek = (date.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const monday = new Date(date);
  monday.setDate(date.getDate() - dayOfWeek);
  return monday;
}

/** Moves `anchor` by one interval step (±1 day / ±7 days / ±1 month). No-op for "all". */
export function shiftAnchor(interval: Interval, anchor: Date, dir: 1 | -1): Date {
  const next = new Date(anchor);
  if (interval === "today") next.setDate(next.getDate() + dir);
  else if (interval === "week") next.setDate(next.getDate() + dir * 7);
  else if (interval === "month") next.setMonth(next.getMonth() + dir);
  return next;
}

/** Whether `window` covers the current day/week/month (i.e. its period contains "now"). Always
 * true for "all". Used to hide/disable the "next" nav arrow past the current period. */
export function isCurrentPeriod(window: StatsWindow, now = new Date()): boolean {
  if (window.interval === "all") return true;
  if (window.interval === "today") return ymd(window.anchor) === ymd(now);
  if (window.interval === "week") return ymd(mondayOf(window.anchor)) === ymd(mondayOf(now));
  return window.anchor.getFullYear() === now.getFullYear() && window.anchor.getMonth() === now.getMonth();
}

/** Inclusive YYYY-MM-DD start/end for the window's single day/week/month; null for "all". */
export function rangeFor(window: StatsWindow): { start: string; end: string } | null {
  if (window.interval === "today") {
    const s = ymd(window.anchor);
    return { start: s, end: s };
  }
  if (window.interval === "week") {
    const monday = mondayOf(window.anchor);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: ymd(monday), end: ymd(sunday) };
  }
  if (window.interval === "month") {
    const first = new Date(window.anchor.getFullYear(), window.anchor.getMonth(), 1);
    const last = new Date(window.anchor.getFullYear(), window.anchor.getMonth() + 1, 0);
    return { start: ymd(first), end: ymd(last) };
  }
  return null;
}

/**
 * Query params for a stats fetch. The current period is sent as bare `interval` (matching
 * legacy/default backend behavior exactly), so only a navigated-away period adds explicit
 * start_date/end_date.
 */
export function statsWindowParams(window: StatsWindow): Record<string, string> {
  if (window.interval === "all" || isCurrentPeriod(window)) return { interval: window.interval };
  const range = rangeFor(window);
  if (!range) return { interval: window.interval };
  return { interval: window.interval, start_date: range.start, end_date: range.end };
}

/**
 * Richer timeframe label for the share card / map snapshot / deep-dive header, e.g.
 * "This Week — Aug 4–10" for the current week, or "Jul 14–20" for a navigated-away one.
 */
export function detailedIntervalLabel(window: StatsWindow): string {
  const current = isCurrentPeriod(window);
  if (window.interval === "week") {
    const monday = mondayOf(window.anchor);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sameMonth = monday.getMonth() === sunday.getMonth();
    const startStr = monday.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const endStr = sunday.toLocaleDateString(
      undefined,
      sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" }
    );
    const range = `${startStr}–${endStr}`;
    return current ? `${INTERVAL_LABELS.week} — ${range}` : range;
  }
  if (window.interval === "month") {
    const monthStr = window.anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    return current ? `${INTERVAL_LABELS.month} — ${monthStr}` : monthStr;
  }
  if (window.interval === "today") {
    if (current) return INTERVAL_LABELS.today;
    return window.anchor.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  return INTERVAL_LABELS.all;
}
