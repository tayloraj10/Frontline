"use client";

import { checkoutReturnUrl } from "@/lib/billingReturn";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChoiceChips, Field, Note, Select, TextInput } from "@/components/ui/fields";

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
          success_url: checkoutReturnUrl("success"),
          cancel_url: checkoutReturnUrl("cancelled"),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.location.assign(data.url);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to start checkout"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-extrabold tracking-tight text-zinc-100">
          Sponsor this {targetType === "cleanup_event" ? "cleanup" : "area"}
        </h3>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Admin preview</span>
      </div>
      <p className="text-sm text-zinc-400">
        Funds a cleanup program for &quot;{targetLabel}&quot;. Test mode, funding only, no payouts yet.
      </p>

      {error && <Note tone="warn">{error}</Note>}

      <ChoiceChips
        value={sponsorMode}
        onChange={(v) => {
          if (v === "business" && businesses.length === 0) return;
          setSponsorMode(v);
        }}
        options={[
          { value: "user", label: "As myself" },
          {
            value: "business",
            label: "As a business",
            idleClass: businesses.length === 0 ? "bg-zinc-800 text-zinc-600" : undefined,
          },
        ]}
      />

      {sponsorMode === "business" && (
        <Field label="Business">
          <Select value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Amount (USD)">
        <TextInput
          type="number"
          inputMode="decimal"
          min="1"
          step="1"
          value={amountDollars}
          onChange={(e) => setAmountDollars(e.target.value)}
        />
      </Field>

      <Field label="Message" optional>
        <TextInput
          type="text"
          placeholder="Say why you are sponsoring"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>

      <Button className="w-full" loading={loading} onClick={handleCheckout}>
        Start test checkout
      </Button>
    </Card>
  );
}
