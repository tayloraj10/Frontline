"use client";

import { useState } from "react";
import FlowSheet, { FlowFooter, type FlowStep as GuidedStep } from "@/components/ui/FlowSheet";
import { Select } from "@/components/ui/fields";

const inputCls = "w-full min-h-12 rounded-2xl bg-zinc-800 px-4 py-3 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 ring-1 ring-inset ring-white/5 focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-shadow";

export type OfferFormInitial = {
  title: string;
  description: string | null;
  redemption_mode: "spend" | "threshold" | "event_only";
  points_cost: number | null;
  points_threshold: number | null;
  max_redemptions_per_user: number | null;
  max_total_redemptions: number | null;
  event_redemption_limit: number | null;
  code: string | null;
  ends_at: string | null;
  location_id: string | null;
  event_eligible: boolean;
};

export type OfferFormPayload = {
  title: string;
  description: string | null;
  redemption_mode: "spend" | "threshold" | "event_only";
  points_cost: number | null;
  points_threshold: number | null;
  max_redemptions_per_user: number | null;
  max_total_redemptions: number | null;
  event_redemption_limit: number | null;
  code: string | null;
  ends_at: string | null;
  location_id: string | null;
  event_eligible: boolean;
};

export type OfferFormLocation = {
  id: string;
  label: string | null;
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  // Convert to the browser's local calendar date, not the UTC date -- an ends_at of
  // 03:59:59.999 UTC on Sep 1 is still Aug 31 for a US-Eastern admin, so slicing the raw
  // UTC string would show the wrong day back in the date input.
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// "YYYY-MM-DD" from a date input is local-calendar, not UTC -- push to end of that
// local day before converting to UTC so the offer stays live through the whole day
// regardless of the admin's timezone.
function endOfLocalDayIso(dateInputValue: string): string {
  const [year, month, day] = dateInputValue.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

function isPositiveInteger(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value) > 0;
}

function isNonNegativeInteger(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

const offerSteps: GuidedStep[] = [
  { key: "basics", label: "Basics" },
  { key: "redemption", label: "Redemption" },
  { key: "limits", label: "Limits" },
  { key: "details", label: "Details" },
];

export default function OfferForm({ initial, locations, onSubmit, onCancel, submitLabel }: {
  initial?: OfferFormInitial;
  locations?: OfferFormLocation[];
  onSubmit: (payload: OfferFormPayload) => Promise<string | null>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [redemptionMode, setRedemptionMode] = useState<"spend" | "threshold" | "event_only">(initial?.redemption_mode ?? "spend");
  const [pointsCost, setPointsCost] = useState<string>(initial?.points_cost != null ? String(initial.points_cost) : "");
  const [pointsThreshold, setPointsThreshold] = useState<string>(initial?.points_threshold != null ? String(initial.points_threshold) : "");
  const [maxPerUser, setMaxPerUser] = useState<string>(initial?.max_redemptions_per_user != null ? String(initial.max_redemptions_per_user) : "");
  const [maxTotal, setMaxTotal] = useState<string>(initial?.max_total_redemptions != null ? String(initial.max_total_redemptions) : "");
  const [eventRedemptionLimit, setEventRedemptionLimit] = useState<string>(initial?.event_redemption_limit != null ? String(initial.event_redemption_limit) : "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [endsAt, setEndsAt] = useState(toDateInputValue(initial?.ends_at ?? null));
  const [locationId, setLocationId] = useState<string>(initial?.location_id ?? "");
  const [eventEligible, setEventEligible] = useState(initial?.event_eligible ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [guidedStep, setGuidedStep] = useState(0);

  const showLocationPicker = !!locations && locations.length > 1;
  const isEditing = !!initial;

  const validate = (): string | null => {
    if (!title.trim()) return "Add a title";
    if (redemptionMode === "spend" && !isPositiveInteger(pointsCost)) return "Points cost must be a whole number greater than 0";
    if (redemptionMode === "threshold" && !isNonNegativeInteger(pointsThreshold)) return "Points threshold must be a whole number";
    if (redemptionMode === "event_only" && !eventEligible) return "An event-only offer must be eligible for event redemption";
    if (maxPerUser.trim() && !isPositiveInteger(maxPerUser)) return "Max redemptions / user must be a whole number greater than 0";
    if (maxTotal.trim() && !isPositiveInteger(maxTotal)) return "Max total redemptions must be a whole number greater than 0";
    if (eventRedemptionLimit.trim() && !isPositiveInteger(eventRedemptionLimit)) return "Redemptions per event must be a whole number greater than 0";
    return null;
  };

  const stepDisabledReason = (stepKey: string): string | null => {
    if (stepKey === "basics") return !title.trim() ? "Add a title to continue" : null;
    if (stepKey === "redemption") {
      if (redemptionMode === "spend" && !isPositiveInteger(pointsCost)) return "Enter a points cost to continue";
      if (redemptionMode === "threshold" && !isNonNegativeInteger(pointsThreshold)) return "Enter a points threshold to continue";
      return null;
    }
    if (stepKey === "limits") {
      if (maxPerUser.trim() && !isPositiveInteger(maxPerUser)) return "Fix max redemptions / user to continue";
      if (maxTotal.trim() && !isPositiveInteger(maxTotal)) return "Fix max total redemptions to continue";
      if (eventRedemptionLimit.trim() && !isPositiveInteger(eventRedemptionLimit)) return "Fix redemptions per event to continue";
      return null;
    }
    return null;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError(null);

    const err = await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      redemption_mode: redemptionMode,
      points_cost: redemptionMode === "spend" ? Number(pointsCost) : null,
      points_threshold: redemptionMode === "threshold" ? Number(pointsThreshold) : null,
      // event_only leaves both null -- enforced by the redemption_mode CHECK constraint
      max_redemptions_per_user: maxPerUser.trim() ? Number(maxPerUser) : null,
      max_total_redemptions: maxTotal.trim() ? Number(maxTotal) : null,
      event_redemption_limit: eventRedemptionLimit.trim() ? Number(eventRedemptionLimit) : null,
      code: code.trim() || null,
      ends_at: endsAt ? endOfLocalDayIso(endsAt) : null,
      location_id: locationId || null,
      event_eligible: eventEligible,
    });

    setLoading(false);
    if (err) setError(err);
  };

  const basicsSection = (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">Title</label>
        <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. 20% off any order" autoFocus />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">Description</label>
        <textarea className={`${inputCls} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
      </div>
    </div>
  );

  const redemptionSection = (
    <div className="space-y-3">
      <label
        htmlFor="event-eligible"
        className={`flex items-start gap-3 rounded-2xl p-4 cursor-pointer transition-colors duration-150 border-2 ${
          eventEligible
            ? "border-amber-500 bg-amber-950/30"
            : "border-dashed border-zinc-700 bg-zinc-900/40 hover:border-zinc-500"
        }`}
      >
        <input
          id="event-eligible"
          type="checkbox"
          checked={eventEligible}
          onChange={e => {
            const checked = e.target.checked;
            setEventEligible(checked);
            if (!checked && redemptionMode === "event_only") setRedemptionMode("spend");
          }}
          className="mt-0.5 h-5 w-5 rounded border-zinc-700 bg-zinc-900 accent-amber-500 shrink-0"
        />
        <span>
          <span className={`flex items-center gap-1.5 text-sm font-semibold ${eventEligible ? "text-amber-400" : "text-zinc-300"}`}>
            Eligible for event redemption
          </span>
          <span className="block text-xs text-zinc-500 mt-0.5">
            Organizers can attach this offer to a nearby cleanup event. Attendees who check in can redeem it for free, no points required, within 4 hours after the event ends.
          </span>
          {eventEligible && redemptionMode !== "event_only" && (
            <span className="block text-xs font-semibold text-amber-400 mt-1.5 bg-amber-950/40 border border-amber-800/50 rounded-md px-2 py-1.5">
              This offer still costs points by default. Want it to ONLY be redeemable at events, never for points? Select &ldquo;event only&rdquo; in the redemption mode dropdown below.
            </span>
          )}
        </span>
      </label>
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">Redemption mode</label>
        <Select value={redemptionMode} onChange={e => setRedemptionMode(e.target.value as "spend" | "threshold" | "event_only")}>
          <option value="spend">spend (deducts points)</option>
          <option value="threshold">threshold (unlocks at balance)</option>
          {eventEligible && <option value="event_only">event only, never costs points</option>}
        </Select>
        {redemptionMode === "event_only" && (
          <p className="text-xs text-amber-500/80 mt-1">
            This offer will never cost points; it&apos;s redeemable only by checking into an attached cleanup event.
          </p>
        )}
      </div>
      {redemptionMode === "spend" ? (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-zinc-200">Points cost</label>
          <input type="number" min={1} step={1} className={inputCls} value={pointsCost} onChange={e => setPointsCost(e.target.value)} placeholder="Required" />
        </div>
      ) : redemptionMode === "threshold" ? (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-zinc-200">Points threshold</label>
          <input type="number" min={0} step={1} className={inputCls} value={pointsThreshold} onChange={e => setPointsThreshold(e.target.value)} placeholder="Required" />
        </div>
      ) : null}
      {redemptionMode !== "event_only" && (
        <details className="group rounded-2xl bg-zinc-800/60 ring-1 ring-inset ring-white/5">
          <summary className="flex items-center justify-between gap-3 min-h-12 px-4 text-sm font-semibold text-zinc-200 cursor-pointer list-none touch-manipulation">
            How to price your offer
            <span className="text-xs font-normal text-zinc-400 group-open:hidden">Show</span>
            <span className="text-xs font-normal text-zinc-400 hidden group-open:inline">Hide</span>
          </summary>
          <div className="px-4 pb-4 space-y-4 text-xs leading-relaxed text-zinc-400">
            <div>
              <p className="font-semibold text-zinc-200 mb-1">How people earn points</p>
              <ul className="space-y-0.5">
                <li>Small bag: 1 point</li>
                <li>Large bag: 3 points (contractor bag: 4)</li>
                <li>Weighed trash: 0.5 points per pound</li>
                <li>Cigarette butts: 1 point per 20</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-zinc-200 mb-1">Picking a cost</p>
              <p>
                Think in bags. A cost of 10 is about 3 large bags, which is a solid session of cleaning. Keep small
                treats low so they feel easy to reach, and save higher costs for bigger rewards.
              </p>
            </div>
            <div>
              <p className="font-semibold text-zinc-200 mb-1">Sample offers</p>
              <ul className="space-y-0.5">
                <li>Free drip coffee: 10 points</li>
                <li>Free pastry or cookie: 15 points</li>
                <li>$5 off any purchase: 30 points</li>
                <li>Free pint or side: 40 points</li>
                <li>Free entree: 75 points</li>
                <li>10% off for regular cleaners (threshold mode, unlocks at 25 points)</li>
              </ul>
              <p className="mt-1.5 text-zinc-500">
                Spend mode takes the points off their balance. Threshold mode just checks they have enough, and keeps
                their points.
              </p>
            </div>
          </div>
        </details>
      )}
    </div>
  );

  const limitsSection = (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        <p className="text-xs font-medium text-zinc-400">Overall limits (across every redemption, points or event, combined)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:items-end gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-zinc-200">Max redemptions per user</label>
            <input type="number" min={1} step={1} className={inputCls} value={maxPerUser} onChange={e => setMaxPerUser(e.target.value)} placeholder="Blank = unlimited" />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-zinc-200">Max total redemptions</label>
            <input type="number" min={1} step={1} className={inputCls} value={maxTotal} onChange={e => setMaxTotal(e.target.value)} placeholder="Blank = unlimited" />
          </div>
        </div>
      </div>
      {eventEligible ? (
        <div className="space-y-1 rounded-lg border border-amber-800/40 bg-amber-950/10 p-3">
          <label className="block text-xs font-medium text-amber-400">Cap per event (separate from the overall limits above)</label>
          <input type="number" min={1} step={1} className={inputCls} value={eventRedemptionLimit} onChange={e => setEventRedemptionLimit(e.target.value)} placeholder="Blank = honor everyone who checks in" />
          <p className="text-xs text-zinc-600">
            Resets for each cleanup event this offer is attached to, it doesn&apos;t count against the overall limits above. If you only want to cover the first N people at any single event, set a number here. Most businesses leave this blank and honor whoever shows up. Organizers see this value when attaching the offer, they can&apos;t change it.
          </p>
        </div>
      ) : (
        <p className="text-xs text-zinc-600">Turn on event redemption in the previous step to also set a per-event cap.</p>
      )}
    </div>
  );

  const detailsSection = (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">Code</label>
        <input className={`${inputCls} font-mono`} value={code} onChange={e => setCode(e.target.value)} placeholder="Optional" />
        <p className="text-xs text-zinc-500">Shown to everyone who redeems.</p>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-200">Ends (optional)</label>
        <input type="date" className={inputCls} value={endsAt} onChange={e => setEndsAt(e.target.value)} />
        <p className="text-xs text-zinc-500">Leave blank and the offer stays up until you remove it.</p>
      </div>
      {showLocationPicker && (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-zinc-200">Location</label>
          <Select value={locationId} onChange={e => setLocationId(e.target.value)}>
            <option value="">All locations</option>
            {locations!.map((l, i) => (
              <option key={l.id} value={l.id}>{l.label ?? `Location ${i + 1}`}</option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );

  const stepSections: Record<string, React.ReactNode> = {
    basics: basicsSection,
    redemption: redemptionSection,
    limits: limitsSection,
    details: detailsSection,
  };

  const activeGuidedStep = Math.min(guidedStep, offerSteps.length - 1);
  const isLastGuidedStep = activeGuidedStep === offerSteps.length - 1;
  const blocked = stepDisabledReason(offerSteps[activeGuidedStep].key);
  const goBack = activeGuidedStep > 0 ? () => setGuidedStep(activeGuidedStep - 1) : onCancel;

  const footer = isLastGuidedStep ? (
    <FlowFooter
      onBack={goBack}
      backLabel={activeGuidedStep > 0 ? "Back" : "Cancel"}
      primaryLabel={loading ? "Saving..." : submitLabel}
      onPrimary={() => handleSubmit()}
      primaryDisabled={loading || !!validate()}
    />
  ) : (
    <FlowFooter
      onBack={goBack}
      backLabel={activeGuidedStep > 0 ? "Back" : "Cancel"}
      primaryLabel="Next"
      onPrimary={() => setGuidedStep(activeGuidedStep + 1)}
      primaryDisabled={!!blocked}
      hint={blocked}
    />
  );

  return (
    <FlowSheet
      title={isEditing ? "Edit offer" : "New offer"}
      onClose={onCancel ?? (() => {})}
      steps={offerSteps}
      stepIndex={activeGuidedStep}
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {stepSections[offerSteps[activeGuidedStep].key]}
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </form>
    </FlowSheet>
  );
}
