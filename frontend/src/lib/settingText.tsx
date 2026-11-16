"use client";

import { Chip } from "@/components/walkthrough/parts";
import { useGameSettings } from "@/lib/gameSettings";

/** Game settings that explanatory copy quotes. Admin edits show up in the copy with no code change. */
export const COPY_KEYS = [
  "marketplace_arrive_minutes",
  "sponsored_claim_work_window_minutes",
  "retake_wait_hours",
] as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function minutesText(min: number): string {
  return min % 60 === 0 ? plural(min / 60, "hour") : plural(min, "minute");
}

export function minutesShort(min: number): string {
  return min % 60 === 0 ? `${min / 60} ${min / 60 === 1 ? "hr" : "hrs"}` : `${min} min`;
}

export const hoursText = (h: number) => plural(h, "hour");

type Values = Partial<Record<(typeof COPY_KEYS)[number], number>>;

/** Words used while a value is still loading, so copy never shows a guessed number. */
const FALLBACK = { arrive: "a set time", work: "a set time", wait: "a day" };

/** Replaces {arrive}, {work} and {wait} in static copy with the live setting values. */
export function fillCopy(text: string, v: Values): string {
  const a = v.marketplace_arrive_minutes;
  const w = v.sponsored_claim_work_window_minutes;
  const r = v.retake_wait_hours;
  return text
    .replaceAll("{arrive}", a != null ? minutesText(a) : FALLBACK.arrive)
    .replaceAll("{work}", w != null ? minutesText(w) : FALLBACK.work)
    .replaceAll("{wait}", r != null ? hoursText(r) : FALLBACK.wait);
}

/** Copy text with live setting values filled in. */
export function useCopy() {
  const { values } = useGameSettings(COPY_KEYS);
  return (text: string) => fillCopy(text, values);
}

/** Walkthrough chip showing a minutes setting, like "1 hr". */
export function MinutesChip({ setting }: { setting: "marketplace_arrive_minutes" | "sponsored_claim_work_window_minutes" }) {
  const { values } = useGameSettings([setting] as const);
  const v = values[setting];
  return <Chip on>{v != null ? minutesShort(v) : "..."}</Chip>;
}
