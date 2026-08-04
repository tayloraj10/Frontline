"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PointsState = { points: number; spendablePoints: number };

// Module-level singleton (mirrors the gameSettings.tsx cache pattern) so UserNav's header
// badge and any award-granting flow elsewhere in the tree share one source of truth without
// a Context provider wrapping the root layout's Server/Client Component boundary.
let state: PointsState | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

// Hydrates the store from AppHeader's server-fetched props — called on mount and whenever
// those props change (e.g. after a navigation re-runs the server component).
export function syncUserPoints(points: number, spendablePoints: number) {
  state = { points, spendablePoints };
  notify();
}

// Re-reads the authoritative balances from profiles after an award-granting submission
// succeeds, so the header updates instantly without a page refresh. A fresh DB read (rather
// than computing the delta client-side) avoids duplicating the trigger's scoring logic
// (multipliers, hotspot bonuses, event mode, campaign spendable-points gating, etc.).
export async function refreshUserPoints(userId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("points, spendable_points")
    .eq("id", userId)
    .single();
  if (data) syncUserPoints(data.points, data.spendable_points);
}

export function useUserPoints(): PointsState | null {
  const [, rerender] = useState(0);

  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return state;
}
