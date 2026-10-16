"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChoiceChips, Field, Note, TextArea, TextInput } from "@/components/ui/fields";

const PRESETS = ["10", "25", "50", "100", "custom"] as const;
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
 * Public "Support this group" card, shown on the page of a Plus group that opted in to
 * direct sponsors. Checkout creates a group_support sponsorship; once paid, the full
 * amount is queued as an allocation to the group for admin review and manual payout.
 */
export default function GroupSponsorCard({
  groupId,
  groupName,
  groupSlug,
  pitch,
  userId,
}: {
  groupId: string;
  groupName: string;
  groupSlug: string;
  pitch: string | null;
  userId: string | null;
}) {
  const [preset, setPreset] = useState<Preset>("25");
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dollars = preset === "custom" ? parseFloat(custom) : parseFloat(preset);
  const valid = Number.isFinite(dollars) && dollars >= 5 && dollars <= 10000;

  const support = async () => {
    if (!userId) return;
    if (!valid) {
      setError("Enter an amount between $5 and $10,000.");
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
          target_type: "group",
          model: "group_support",
          target_group_id: groupId,
          amount_cents: Math.round(dollars * 100),
          message: message.trim() || null,
          success_url: `${window.location.origin}/billing/success`,
          cancel_url: `${window.location.origin}/billing/cancel`,
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
    <Card padding="lg" className="mb-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-extrabold tracking-tight text-zinc-100">Support {groupName}</h3>
        <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-widest text-amber-300">✦ Plus group</span>
      </div>
      <p className="text-sm text-zinc-300">
        {pitch?.trim() ||
          `${groupName} is open to sponsors. Your gift goes to the group to fund its cleanups, supplies and events.`}
      </p>
      {!userId ? (
        <Link
          href={`/login?next=/groups/${groupSlug}`}
          className="inline-flex rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-bold text-emerald-950 hover:bg-emerald-300"
        >
          Sign in to support this group
        </Link>
      ) : (
        <>
          <ChoiceChips
            value={preset}
            onChange={setPreset}
            options={PRESETS.map((p) => ({ value: p, label: p === "custom" ? "Other" : `$${p}` }))}
          />
          {preset === "custom" && (
            <Field label="Amount (USD)" error={custom && !valid ? "Enter an amount between $5 and $10,000." : null}>
              <TextInput
                type="number"
                inputMode="decimal"
                min="5"
                step="1"
                placeholder="40"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
            </Field>
          )}
          <Field label="Message" optional hint="Shown to the group's admins with your gift.">
            <TextArea rows={2} maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <Button className="w-full sm:w-auto" loading={loading} onClick={support}>
            {valid ? `Support with $${dollars % 1 === 0 ? dollars : dollars.toFixed(2)}` : "Support this group"}
          </Button>
          <p className="text-xs text-zinc-500">
            The full amount is earmarked for {groupName}. Frontline reviews each gift and pays it out to the group by hand.
          </p>
        </>
      )}
      {error && <Note tone="warn">{error}</Note>}
    </Card>
  );
}
