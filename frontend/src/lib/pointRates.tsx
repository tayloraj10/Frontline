"use client";

import { useEffect, useState } from "react";
import { useGameSettings } from "@/lib/gameSettings";
import { formatPoints } from "@/lib/formatPoints";

// Single source for the Trash War earn rates shown in static copy (How points work, campaign
// cards, offer pricing help). Base values come from game_settings; the contractor bag and
// countable-item (cigarette) rates live in the bag_types / countable_item_types tables and are
// served by /contributions/points-basis-options. Nothing here may be hardcoded.

type BasisOptions = {
  bag_types: { key: string; size_class: "small" | "large"; point_value: number }[];
  countable_item_types: { key: string; label: string; unit_count: number; points_per_unit: number }[];
};

let basisCache: BasisOptions | null = null;
let basisInFlight: Promise<void> | null = null;

function useBasisOptions(): BasisOptions | null {
  const [options, setOptions] = useState<BasisOptions | null>(basisCache);
  useEffect(() => {
    if (basisCache) return;
    basisInFlight ??= fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/points-basis-options`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) basisCache = data;
      })
      .catch(() => {})
      .finally(() => {
        basisInFlight = null;
      });
    let alive = true;
    basisInFlight.then(() => {
      if (alive) setOptions(basisCache);
    });
    return () => {
      alive = false;
    };
  }, []);
  return options;
}

const KEYS = ["small_bag_value", "large_bag_value", "pound_value", "trash_report_value"] as const;

export function usePointRates() {
  const { values, loading } = useGameSettings(KEYS);
  const basis = useBasisOptions();
  const contractor = basis?.bag_types.find((b) => b.key === "contractor_40_80gal")?.point_value;
  const cigarette = basis?.countable_item_types.find((i) => i.key === "cigarette_butt");
  return {
    loading,
    small: values.small_bag_value,
    large: values.large_bag_value,
    pound: values.pound_value,
    report: values.trash_report_value,
    contractor,
    cigarette,
  };
}

/** Formatted points, or "…" while the value is still loading. Never a guessed figure. */
export function fmt(value: number | undefined): string {
  return value === undefined ? "…" : formatPoints(value);
}

export function pointsLabel(value: number | undefined): string {
  return value === undefined ? "…" : `${formatPoints(value)} ${value === 1 ? "point" : "points"}`;
}
