"use client";

import { checkoutReturnUrl } from "@/lib/billingReturn";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { ChoiceChips, Field, Note, TextArea, TextInput } from "@/components/ui/fields";

const PRESETS = ["5", "10", "25", "50", "custom"] as const;
type Preset = (typeof PRESETS)[number];

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
 * One-time gift to Frontline's general fund. Reuses the sponsorship checkout (a general
 * sponsorship with no payout rule), so it shows up in the donor's funding history and the
 * public Impact totals like any other contribution.
 */
export default function DonateCard({ userId, embedded = false }: { userId: string; embedded?: boolean }) {
  const [preset, setPreset] = useState<Preset>("10");
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dollars = preset === "custom" ? parseFloat(custom) : parseFloat(preset);
  const valid = Number.isFinite(dollars) && dollars >= 1 && dollars <= 10000;

  const donate = async () => {
    if (!valid) {
      setError("Enter an amount between $1 and $10,000.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sponsorships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor_type: "user",
          sponsor_user_id: userId,
          target_type: "general",
          model: "general",
          amount_cents: Math.round(dollars * 100),
          message: message.trim() || null,
          success_url: checkoutReturnUrl("success"),
          cancel_url: checkoutReturnUrl("cancelled"),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.location.assign(data.url);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not start checkout."));
      setLoading(false);
    }
  };

  return (
    <div className={embedded ? "space-y-3" : "space-y-3 border-t border-white/5 pt-4"}>
      <div>
        {!embedded && <h4 className="text-sm font-extrabold text-zinc-100">Or give once</h4>}
        <p className={embedded ? "text-sm text-zinc-400" : "mt-1 text-sm text-zinc-400"}>
          A one-time gift goes straight into Frontline&apos;s general fund and helps pay for cleanup rewards, maps and hosting. No
          subscription, no strings.
        </p>
      </div>
      <ChoiceChips
        value={preset}
        onChange={setPreset}
        options={PRESETS.map((p) => ({ value: p, label: p === "custom" ? "Other" : `$${p}` }))}
      />
      {preset === "custom" && (
        <Field label="Amount (USD)" error={custom && !valid ? "Enter an amount between $1 and $10,000." : null}>
          <TextInput
            type="number"
            inputMode="decimal"
            min="1"
            step="1"
            placeholder="15"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </Field>
      )}
      <Field label="Message" optional hint="Shown with your gift in the funding feed.">
        <TextArea rows={2} maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <Button variant="secondary" className="w-full sm:w-auto" loading={loading} onClick={donate}>
        {valid ? `Give $${dollars % 1 === 0 ? dollars : dollars.toFixed(2)}` : "Give"}
      </Button>
      {error && <Note tone="warn">{error}</Note>}
    </div>
  );
}
