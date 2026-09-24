"use client";

import { useState } from "react";

type TargetType = "cleanup_event" | "geo_unit";

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
 * Fund-a-sponsorship widget for a fixed target (a cleanup event or a geo area). Only
 * ever rendered for site admins right now -- see callers -- since sponsorships are
 * still a Stripe test-mode, funding-only harness (no payout/Connect yet, see
 * dev-docs/payments-scoping-2026-08-20.md).
 */
export default function SponsorshipWidget({
  targetType,
  targetId,
  targetLabel,
  sponsorUserId,
  businesses = [],
}: {
  targetType: TargetType;
  targetId: string;
  targetLabel: string;
  sponsorUserId: string;
  businesses?: { id: string; name: string }[];
}) {
  const [sponsorMode, setSponsorMode] = useState<"user" | "business">("user");
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? "");
  const [amountDollars, setAmountDollars] = useState("25");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    const amountCents = Math.round(parseFloat(amountDollars) * 100);
    if (!amountCents || amountCents <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (sponsorMode === "business" && !businessId) {
      setError("Select a business to sponsor as.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sponsorships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor_type: sponsorMode,
          sponsor_user_id: sponsorMode === "user" ? sponsorUserId : null,
          sponsor_business_id: sponsorMode === "business" ? businessId : null,
          target_type: targetType,
          target_cleanup_id: targetType === "cleanup_event" ? targetId : null,
          target_geo_unit_id: targetType === "geo_unit" ? targetId : null,
          amount_cents: amountCents,
          message: message || null,
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

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-2 bg-zinc-950">
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-300">Sponsor this {targetType === "cleanup_event" ? "cleanup" : "area"}</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">Admin-only · Stripe test mode</span>
      </div>
      <div className="px-5 py-4 space-y-3">
        <p className="text-xs text-zinc-500">
          Not visible to regular users yet -- funding only, no payout yet. &quot;{targetLabel}&quot;
        </p>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            className={`min-h-9 px-3 rounded-lg text-xs font-semibold transition-colors duration-150 ${
              sponsorMode === "user" ? "bg-emerald-700 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
            onClick={() => setSponsorMode("user")}
          >
            As myself
          </button>
          <button
            className={`min-h-9 px-3 rounded-lg text-xs font-semibold transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
              sponsorMode === "business" ? "bg-emerald-700 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
            onClick={() => setSponsorMode("business")}
            disabled={businesses.length === 0}
          >
            As a business
          </button>
        </div>

        {sponsorMode === "business" && (
          <select
            className="w-full min-h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-2">
          <span className="text-zinc-500 text-sm">$</span>
          <input
            type="number"
            min="1"
            step="1"
            className="w-24 min-h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm"
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
          />
        </div>

        <input
          type="text"
          placeholder="Optional message"
          className="w-full min-h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <button
          className="min-h-9 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
          onClick={handleCheckout}
        >
          Start test checkout
        </button>
      </div>
    </div>
  );
}
