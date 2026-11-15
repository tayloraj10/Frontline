"use client";

import { useGameSettings } from "@/lib/gameSettings";
import { LIMITS, limitsFromSettings, LIMIT_SETTING_KEYS, type Limits } from "@/lib/areaShape";

/** Size limits for drawn areas, pins and geo-unit picks, from the admin game settings (defaults until loaded). */
export function useLimits(): Limits {
  const { values } = useGameSettings(LIMIT_SETTING_KEYS);
  return Object.keys(values).length ? limitsFromSettings(values) : LIMITS;
}
