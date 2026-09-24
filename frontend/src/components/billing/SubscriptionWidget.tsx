"use client";

import { useCallback, useEffect, useState } from "react";

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

/**
 * Subscribe/manage-billing widget for a single owner (a user's own profile, or a group they
 * admin). Only ever rendered for site admins right now -- see callers -- since there's no
 * premium feature decided to gate yet and this is still a Stripe test-mode harness.
 */
export default function SubscriptionWidget({ ownerType, ownerId }: { ownerType: OwnerType; ownerId: string }) {
  const [hasPremium, setHasPremium] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshEntitlement = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/payments/entitlement?owner_type=${ownerType}&owner_id=${ownerId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setHasPremium(data.has_premium);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load entitlement"));
      setHasPremium(null);
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    refreshEntitlement();
  }, [refreshEntitlement]);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_type: ownerType,
          owner_id: ownerId,
          success_url: `${window.location.origin}/billing/success`,
          cancel_url: `${window.location.origin}/billing/cancel`,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to start checkout"));
    } finally {
      setLoading(false);
    }
  };

  const handlePortal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments/portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_type: ownerType, owner_id: ownerId, return_url: window.location.href }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to open billing portal"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-2 bg-zinc-950 mb-6">
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-300">Subscription</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">Admin-only · Stripe test mode</span>
      </div>
      <div className="px-5 py-4 space-y-3">
        <p className="text-xs text-zinc-500">
          Not visible to regular users yet -- this is a test harness until premium is ready to launch.
        </p>

        <div className="text-sm text-zinc-300">
          {hasPremium === null ? (
            <span className="text-zinc-600">Loading entitlement...</span>
          ) : hasPremium ? (
            <span className="text-emerald-400 font-semibold">Premium active</span>
          ) : (
            <span className="text-zinc-500">No active subscription</span>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-9 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
            onClick={handleCheckout}
          >
            Start test checkout
          </button>
          <button
            className="min-h-9 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
            onClick={handlePortal}
          >
            Open billing portal
          </button>
          <button
            className="min-h-9 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
            onClick={refreshEntitlement}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
