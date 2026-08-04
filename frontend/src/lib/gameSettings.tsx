"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SettingsMap = Record<string, number>;
type Status = "idle" | "loading" | "ready" | "error";

// game_settings is admin-tuned and rarely changes, so every component that needs a value
// from it shares one in-memory cache instead of each hitting Supabase on its own mount.
// Cached values are served immediately (never re-shown as a skeleton once loaded) and
// silently revalidated in the background once TTL_MS has elapsed, so admin edits still
// show up for anyone with the page open without polling constantly.
const TTL_MS = 10 * 60 * 1000;

let cache: SettingsMap | null = null;
let cachedAt = 0;
let status: Status = "idle";
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function refresh(): Promise<void> {
  if (inFlight) return inFlight;
  if (!cache) status = "loading";
  inFlight = (async () => {
    const supabase = createClient();
    const { data, error } = await supabase.schema("public").from("game_settings").select("key, value");
    inFlight = null;
    if (error || !data) {
      console.error("Failed to load game_settings", error);
      // A background revalidation failure with existing cached values just keeps serving
      // those (still better than blanking out a working UI); only a from-nothing failure
      // surfaces as an error to callers.
      status = cache ? "ready" : "error";
      notify();
      return;
    }
    const map: SettingsMap = {};
    for (const row of data as { key: string; value: number }[]) map[row.key] = row.value;
    cache = map;
    cachedAt = Date.now();
    status = "ready";
    notify();
  })();
  return inFlight;
}

export function useGameSettings<K extends string>(
  keys: readonly K[],
): { values: Partial<Record<K, number>>; loading: boolean; error: boolean } {
  const [, rerender] = useState(0);

  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    if (status === "idle" || (cache && Date.now() - cachedAt > TTL_MS)) refresh();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const values: Partial<Record<K, number>> = {};
  if (cache) {
    for (const key of keys) {
      if (key in cache) values[key] = cache[key];
    }
  }
  return { values, loading: status === "loading" && !cache, error: status === "error" };
}

// Inline placeholder for a number sourced from game_settings while it's still loading (or
// failed to load) — a pulsing blank instead of ever rendering a guessed/stale figure.
export function SettingValue({ value, loading }: { value: number | undefined; loading: boolean }) {
  if (value === undefined) {
    return (
      <span
        className="inline-block h-[0.9em] w-5 animate-pulse rounded bg-zinc-600/60 align-middle"
        title={loading ? "Loading…" : "Unavailable"}
      />
    );
  }
  return <>{value}</>;
}
