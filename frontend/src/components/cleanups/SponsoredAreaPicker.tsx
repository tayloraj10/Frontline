"use client";

import { useEffect, useState } from "react";
import { describeRule, type PayoutRule } from "@/app/sponsorships/SponsoredSites";
import { cn } from "@/lib/cn";

export interface SponsoredArea {
  id: string;
  area_name: string | null;
  message: string | null;
  payout_rule: PayoutRule;
  remaining_cents: number;
  available_cents?: number;
  early_access?: boolean;
  early_access_until?: string | null;
  early_access_locked?: boolean;
}

const untilText = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(
    cents / 100,
  );

/**
 * Funded areas that cover the event's pin, for the event forms (payments v2, group sponsored
 * areas). Lives at the form level so the form can add or drop the "Sponsored area" step. Empty when
 * payments are not visible to this viewer, no funded area covers the spot, or `enabled` is false.
 * A choice made for another location, or for a pool that locked or ran out, is dropped.
 */
export function useSponsoredAreas({
  value,
  onChange,
  groupId,
  lat,
  lng,
  enabled = true,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  groupId?: string | null;
  lat: number | null;
  lng: number | null;
  enabled?: boolean;
}): SponsoredArea[] {
  const [areas, setAreas] = useState<SponsoredArea[]>([]);

  useEffect(() => {
    if (!enabled || lat === null || lng === null) {
      setAreas([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (groupId) params.set("group_id", groupId);
    // Wait out the pin being dragged so a drag does not fire a request per frame.
    const timer = setTimeout(() => {
      fetch(`/api/sponsored/group-areas?${params}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : { areas: [] }))
        .then((data) => {
          if (!cancelled) setAreas(data.areas ?? []);
        })
        .catch(() => {});
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, lat, lng, groupId]);

  useEffect(() => {
    if (!value) return;
    const a = areas.find((x) => x.id === value);
    if (!a || a.early_access_locked || (a.available_cents ?? a.remaining_cents) <= 0) onChange(null);
  }, [areas, value, onChange]);

  return areas;
}

/** The step body: one card per funded area covering the pin. Pair with `useSponsoredAreas`. */
export default function SponsoredAreaPicker({
  areas,
  value,
  onChange,
  groupId,
}: {
  areas: SponsoredArea[];
  value: string | null;
  onChange: (id: string | null) => void;
  groupId?: string | null;
}) {
  if (areas.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-zinc-200">Sponsored area</p>
      {!groupId && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          A sponsor has funded cleanups at this spot, but only events hosted by a group can earn from it.
        </p>
      )}
      {areas.map((a) => {
        const available = a.available_cents ?? a.remaining_cents;
        const chosen = value === a.id;
        const reserved = available <= 0;
        const blocked = !groupId || a.early_access_locked || reserved;
        return (
          <div
            key={a.id}
            className={cn(
              "rounded-2xl border p-3 transition-colors",
              chosen ? "border-emerald-400/60 bg-emerald-500/10" : "border-zinc-700 bg-zinc-900/60",
            )}
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">Funded area at this location</p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-100">{a.area_name ?? "Sponsored area"}</p>
            <p className="mt-1 text-sm text-zinc-300">
              Your group can earn {describeRule(a.payout_rule)} once the event is logged and an admin approves.{" "}
              <span className="text-zinc-500">{usd(Math.max(0, available))} unreserved.</span>
            </p>
            {a.message && <p className="mt-1 text-xs italic text-zinc-400">{a.message}</p>}
            {a.early_access_locked && (
              <p className="mt-1 text-xs text-zinc-500">
                Open to Frontline Plus groups until {untilText(a.early_access_until)}, then to everyone.
              </p>
            )}
            {!a.early_access_locked && a.early_access && (
              <p className="mt-1 text-xs text-amber-300">
                ✦ Plus early access until {untilText(a.early_access_until)}. Your group got in first.
              </p>
            )}
            {reserved && !a.early_access_locked && (
              <p className="mt-1 text-xs text-amber-300">
                Other groups&apos; upcoming events have reserved all of the money. Check back if one is cancelled.
              </p>
            )}
            <button
              type="button"
              disabled={blocked}
              aria-pressed={chosen}
              onClick={() => onChange(chosen ? null : a.id)}
              className={cn(
                "mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-semibold touch-manipulation transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
                chosen ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700" : "bg-emerald-500 text-white hover:bg-emerald-400",
              )}
            >
              {chosen ? "Remove from this event" : "Earn for my group at this event"}
            </button>
            {chosen && (
              <p className="mt-2 text-xs text-zinc-400">
                Reserved for your group while the event is upcoming. If it is cancelled or never logged, the money
                goes back to the pool.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
