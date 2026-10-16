"use client";

import { useCallback, useEffect, useState } from "react";
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
        success_url: `${window.location.origin}/billing/success`,
        cancel_url: `${window.location.origin}/billing/cancel`,
      },
      "Could not start checkout.",
    );

  const manage = () =>
    redirectTo("/api/admin/payments/portal-session", { return_url: window.location.href }, "Could not open billing.");

  const perks = plusPerks(ownerType, ent?.earning_cap_multiplier, ent?.early_access_hours);
  const since = formatDate(ent?.since);
  const renews = formatDate(ent?.current_period_end);
  const active = ent?.has_premium === true;

  return (
    <Card padding="lg" className="mb-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-extrabold tracking-tight text-zinc-100">Frontline Plus</h3>
        {adminPreview && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
            Admin preview
          </span>
        )}
      </div>

      {ent === null && !error && <p className="text-sm text-zinc-500">Loading...</p>}

      {ent !== null && !active && (
        <>
          <p className="text-sm text-zinc-300">
            {ownerType === "group"
              ? "Plus keeps your group's tools running and funds new cleanup features for everyone."
              : "Plus is how members keep Frontline running and free for every cleanup crew. You get a few extras for it."}
          </p>
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
          <Button className="w-full sm:w-auto" loading={loading} onClick={subscribe}>
            Get Plus, {PLUS_PRICE_LABEL}
          </Button>
          <p className="text-xs text-zinc-500">Cancel any time from the billing page.</p>
        </>
      )}

      {active && (
        <>
          <div>
            <p className="text-sm font-semibold text-amber-300">
              Plus member{since ? ` since ${since}` : ""}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {ent?.cancel_at_period_end
                ? `Ends ${renews ?? "at the end of this period"}. You keep Plus until then.`
                : renews
                  ? `Renews ${renews}.`
                  : "Active."}{" "}
              Thank you for backing the mission.
            </p>
          </div>
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
          {ent?.is_mock ? (
            adminPreview && <Note tone="info">Test subscription from the mock seeder. Billing management is not available for it.</Note>
          ) : (
            <Button variant="secondary" className="w-full sm:w-auto" loading={loading} onClick={manage}>
              Manage subscription
            </Button>
          )}
        </>
      )}

      {error && <Note tone="warn">{error}</Note>}
      {ownerType === "user" && ent !== null && <DonateCard userId={ownerId} />}
      {adminPreview && !active && ent !== null && (
        <p className="text-xs text-zinc-600">Test mode: visible to site admins only until payments are enabled.</p>
      )}
    </Card>
  );
}
