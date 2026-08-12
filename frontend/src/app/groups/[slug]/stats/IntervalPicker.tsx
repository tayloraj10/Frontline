"use client";

import { type Interval, INTERVAL_LABELS, type StatsWindow, isCurrentPeriod, shiftAnchor } from "./statsWindow";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function monthValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthValue(s: string): Date {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/** ISO-8601 week ("YYYY-Www") for the week containing `d` — matches `<input type="week">`'s format. */
function isoWeekValue(d: Date): string {
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3); // nearest Thursday of this Mon-Sun week
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Inverse of isoWeekValue — returns the Monday of the given ISO week. */
function parseIsoWeekValue(s: string): Date {
  const [yearStr, weekStr] = s.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(year, 0, 4);
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (week - 1) * 7);
  return monday;
}

export default function IntervalPicker({
  window,
  onChange,
}: {
  window: StatsWindow;
  onChange: (w: StatsWindow) => void;
}) {
  const atCurrent = isCurrentPeriod(window);

  function selectInterval(interval: Interval) {
    onChange({ interval, anchor: new Date() });
  }

  function nav(dir: 1 | -1) {
    onChange({ ...window, anchor: shiftAnchor(window.interval, window.anchor, dir) });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 border border-zinc-800 rounded-lg p-1 w-fit">
        {(Object.keys(INTERVAL_LABELS) as Interval[]).map((key) => (
          <button
            key={key}
            onClick={() => selectInterval(key)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors touch-manipulation ${
              window.interval === key ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {INTERVAL_LABELS[key]}
          </button>
        ))}
      </div>

      {window.interval !== "all" && (
        <div className="flex items-center gap-1 border border-zinc-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => nav(-1)}
            aria-label="Previous period"
            className="px-2 py-1 text-xs font-medium rounded-md text-zinc-500 hover:text-zinc-300 transition-colors touch-manipulation"
          >
            ‹
          </button>
          <input
            type={window.interval === "week" ? "week" : window.interval === "month" ? "month" : "date"}
            value={
              window.interval === "week"
                ? isoWeekValue(window.anchor)
                : window.interval === "month"
                  ? monthValue(window.anchor)
                  : ymd(window.anchor)
            }
            onChange={(e) => {
              if (!e.target.value) return;
              const anchor =
                window.interval === "week"
                  ? parseIsoWeekValue(e.target.value)
                  : window.interval === "month"
                    ? parseMonthValue(e.target.value)
                    : parseYmd(e.target.value);
              onChange({ ...window, anchor });
            }}
            style={{ colorScheme: "dark" }}
            className="bg-transparent text-xs text-zinc-400 pl-1.5 pr-0.5 py-1 rounded-md focus:outline-none focus:text-zinc-200 touch-manipulation [&::-webkit-calendar-picker-indicator]:ml-0.5 [&::-webkit-calendar-picker-indicator]:p-1 [&::-webkit-calendar-picker-indicator]:scale-125 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-90 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
          />
          <button
            onClick={() => nav(1)}
            disabled={atCurrent}
            aria-label="Next period"
            className="px-2 py-1 text-xs font-medium rounded-md text-zinc-500 hover:text-zinc-300 transition-colors touch-manipulation disabled:opacity-30 disabled:hover:text-zinc-500"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
