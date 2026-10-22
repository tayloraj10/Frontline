"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note } from "@/components/ui/fields";
import DonateCard from "./DonateCard";
import { PLUS_PRICE_LABEL, plusPerks, type PlusEntitlement } from "@/lib/plus";

type OwnerType = "user" | "group";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // not JSON
  }
  return err.message || fallback;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Frontline Plus card for one owner (a user's own profile, or a group they admin).
 * Not subscribed: a pitch, the perks and one subscribe button. Subscribed: a status line
 * with the member-since and renewal dates, the perks they have, and one manage button.
 * `adminPreview` adds the test-mode labelling that only site admins should see.
 */
export default function SubscriptionWidget({
  ownerType,
  ownerId,
  adminPreview = false,
}: {
  ownerType: OwnerType;
  ownerId: string;
  adminPreview?: boolean;
}) {
  const [ent, setEnt] = useState<PlusEntitlement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const hideKey = `plus-card-hidden-${ownerType}-${ownerId}`;
  // Only read after the entitlement loads (client side), so the lazy read never affects the server render.
  const [hidden, setHidden] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(hideKey) === "1";
    } catch {
      return false;
    }
  });

  const setHiddenPersisted = (value: boolean) => {
    setHidden(value);
    try {
      if (value) localStorage.setItem(hideKey, "1");
      else localStorage.removeItem(hideKey);
    } catch {
      // ignore
    }
  };

  const loadEntitlement = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/payments/entitlement?owner_type=${ownerType}&owner_id=${ownerId}`);
      if (!res.ok) throw new Error(await res.text());
      setEnt(await res.json());
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load your subscription."));
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    loadEntitlement();
  }, [loadEntitlement]);

  // Returning from Stripe in the same tab (or a restored tab) should show the new state.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadEntitlement();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadEntitlement]);

  const redirectTo = async (path: string, body: Record<string, unknown>, failure: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_type: ownerType, owner_id: ownerId, ...body }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.location.assign(data.url);
    } catch (err) {
      setError(extractErrorMessage(err, failure));
      setLoading(false);
    }
  };

  const subscribe = () =>
    redirectTo(
      "/api/admin/payments/checkout-session",
      {
        success_url: window.location.href,
        cancel_url: window.location.href,
      },
      "Could not start checkout.",
    );

  const manage = () =>
    redirectTo("/api/admin/payments/portal-session", { return_url: window.location.href }, "Could not open billing.");

  const perks = plusPerks(ownerType, ent?.earning_cap_multiplier, ent?.early_access_hours);
  const since = formatDate(ent?.since);
  const renews = formatDate(ent?.current_period_end);
  const active = ent?.has_premium === true;

  const multiplier = ent?.earning_cap_multiplier ?? 2;
  const earlyHours = ent?.early_access_hours ?? 48;
  const mult = `${Number.isInteger(multiplier) ? multiplier : multiplier.toFixed(1)}x`;
  const blurb =
    ownerType === "group"
      ? `${mult} earning caps on sponsored pools, a ${earlyHours}h head start on new sponsored areas, and a Support button so sponsors can fund you directly.`
      : `${mult} earning caps on sponsored cleanups, a ${earlyHours}h head start on new sponsored sites, and a shareable monthly recap.`;

  const perkList = (
    <ul className="space-y-2">
      {perks.map((p) => (
        <li key={p} className="flex gap-2 text-sm text-zinc-300">
          <span aria-hidden className="mt-0.5 text-amber-300">
            ✦
          </span>
          {p}
        </li>
      ))}
    </ul>
  );

  // Members always see their card; non-members can tuck the pitch away down to a small pill.
  if (hidden && ent !== null && !active) {
    return (
      <Button
        variant="ghost"
        className="mb-4 !min-h-9 !rounded-full !bg-amber-300/10 !px-3 !text-xs !text-amber-200 hover:!bg-amber-300/20"
        onClick={() => setHiddenPersisted(false)}
      >
        <span aria-hidden className="text-amber-300">✦</span> Frontline Plus
      </Button>
    );
  }

  return (
    <Card
      padding="md"
      className="mb-6 space-y-3 !bg-gradient-to-br from-amber-400/15 via-amber-500/5 to-zinc-900 !ring-amber-300/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-extrabold tracking-tight text-amber-200">
            <span aria-hidden className="mr-1 text-amber-300">✦</span>Frontline Plus
            {adminPreview && (
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Admin preview</span>
            )}
          </h3>
          {ent === null && !error && <p className="text-sm text-zinc-500">Loading...</p>}
          {active && (
            <p className="text-sm text-zinc-400">
              <span className="font-semibold text-amber-300">Plus member{since ? ` since ${since}` : ""}.</span>{" "}
              {ent?.cancel_at_period_end
                ? `Ends ${renews ?? "at the end of this period"}.`
                : renews
                  ? `Renews ${renews}.`
                  : "Active."}
            </p>
          )}
        </div>
        {ent !== null && !active && (
          <Button
            className="shrink-0 !bg-amber-300 !text-amber-950 hover:!bg-amber-200"
            loading={loading}
            onClick={subscribe}
          >
            Get Plus, {PLUS_PRICE_LABEL}
          </Button>
        )}
        {ent !== null && !active && (
          <button
            type="button"
            aria-label="Hide Frontline Plus"
            onClick={() => setHiddenPersisted(true)}
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-amber-200/70 touch-manipulation hover:bg-amber-300/10 hover:text-amber-100"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        )}
        {active && !ent?.is_mock && (
          <Button variant="secondary" className="shrink-0" loading={loading} onClick={manage}>
            Manage
          </Button>
        )}
      </div>

      {ent !== null && !active && <p className="text-sm text-zinc-400">{blurb}</p>}

      {ent !== null && (
        <>
          <Button
            variant="ghost"
            className="w-full !justify-between !bg-amber-300/10 !text-amber-100 hover:!bg-amber-300/20"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show less" : active ? "What you get" : "What you get with Plus"}
            <ChevronDown aria-hidden className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </Button>
          {expanded && (
            <div className="space-y-3">
              {perkList}
              {!active && <p className="text-xs text-zinc-500">Cancel any time from the billing page.</p>}
              {active && ent?.is_mock && adminPreview && (
                <Note tone="info">Test subscription from the mock seeder. Billing management is not available for it.</Note>
              )}
              {ownerType === "user" && <DonateCard userId={ownerId} />}
            </div>
          )}
        </>
      )}

      {error && <Note tone="warn">{error}</Note>}
    </Card>
  );
}
