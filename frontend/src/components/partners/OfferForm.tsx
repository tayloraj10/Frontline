"use client";

import { useEffect, useState } from "react";
import { GuidedStepper, StepperNav, ViewModeToggle, type GuidedStep } from "@/components/ui/GuidedStepper";

const inputCls = "w-full min-h-11 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500";

const VIEW_MODE_KEY = "frontline:offer-view-mode";

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
  return iso.slice(0, 10);
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

  const [viewMode, setViewMode] = useState<"guided" | "full">("guided");
  const [guidedStep, setGuidedStep] = useState(0);

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_MODE_KEY);
    if (stored === "guided" || stored === "full") setViewMode(stored);
  }, []);

  const changeViewMode = (mode: "guided" | "full") => {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  };

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
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      location_id: locationId || null,
      event_eligible: eventEligible,
    });

    setLoading(false);
    if (err) setError(err);
  };

  const basicsSection = (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs text-zinc-500">Title</label>
        <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. 20% off any order" autoFocus />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-zinc-500">Description</label>
        <textarea className={`${inputCls} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
      </div>
    </div>
  );

  const redemptionSection = (
    <div className="space-y-3">
      <label
        htmlFor="event-eligible"
        className={`flex items-start gap-3 rounded-xl p-3 cursor-pointer transition-colors duration-150 border-2 ${
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
      <div className="space-y-1">
        <label className="text-xs text-zinc-500">Redemption mode</label>
        <select className={inputCls} value={redemptionMode} onChange={e => setRedemptionMode(e.target.value as "spend" | "threshold" | "event_only")}>
          <option value="spend">spend (deducts points)</option>
          <option value="threshold">threshold (unlocks at balance)</option>
          {eventEligible && <option value="event_only">event only, never costs points</option>}
        </select>
        {redemptionMode === "event_only" && (
          <p className="text-xs text-amber-500/80 mt-1">
            This offer will never cost points; it&apos;s redeemable only by checking into an attached cleanup event.
          </p>
        )}
      </div>
      {redemptionMode === "spend" ? (
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Points cost</label>
          <input type="number" min={1} step={1} className={inputCls} value={pointsCost} onChange={e => setPointsCost(e.target.value)} placeholder="Required" />
        </div>
      ) : redemptionMode === "threshold" ? (
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Points threshold</label>
          <input type="number" min={0} step={1} className={inputCls} value={pointsThreshold} onChange={e => setPointsThreshold(e.target.value)} placeholder="Required" />
        </div>
      ) : null}
    </div>
  );

  const limitsSection = (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        <p className="text-xs font-medium text-zinc-400">Overall limits (across every redemption, points or event, combined)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Max redemptions per user</label>
            <input type="number" min={1} step={1} className={inputCls} value={maxPerUser} onChange={e => setMaxPerUser(e.target.value)} placeholder="Blank = unlimited" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Max total redemptions</label>
            <input type="number" min={1} step={1} className={inputCls} value={maxTotal} onChange={e => setMaxTotal(e.target.value)} placeholder="Blank = unlimited" />
          </div>
        </div>
      </div>
      {eventEligible ? (
        <div className="space-y-1 rounded-lg border border-amber-800/40 bg-amber-950/10 p-3">
          <label className="text-xs font-medium text-amber-400">Cap per event (separate from the overall limits above)</label>
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
      <div className="space-y-1">
        <label className="text-xs text-zinc-500">Code</label>
        <input className={`${inputCls} font-mono`} value={code} onChange={e => setCode(e.target.value)} placeholder="Optional, shown to everyone who redeems" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-zinc-500">Ends</label>
        <input type="date" className={inputCls} value={endsAt} onChange={e => setEndsAt(e.target.value)} />
      </div>
      {showLocationPicker && (
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Location</label>
          <select className={inputCls} value={locationId} onChange={e => setLocationId(e.target.value)}>
            <option value="">All locations</option>
            {locations!.map((l, i) => (
              <option key={l.id} value={l.id}>{l.label ?? `Location ${i + 1}`}</option>
            ))}
          </select>
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
  const showSubmit = viewMode === "full" || isLastGuidedStep;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => onCancel && e.target === e.currentTarget && onCancel()}
    >
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-zinc-100 font-semibold text-base">{isEditing ? "Edit offer" : "New offer"}</h2>
            {!isEditing && <p className="text-xs text-zinc-500 mt-0.5">Walk through your options step by step, or switch to the full form.</p>}
          </div>
          {onCancel && (
            <button type="button" onClick={onCancel} className="-mr-1.5 -mt-1 text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 text-lg leading-none px-1.5 py-1" aria-label="Close">
              ×
            </button>
          )}
        </div>
        <div className="px-5 pb-3 shrink-0">
          <ViewModeToggle viewMode={viewMode} onChange={changeViewMode} />
        </div>
        <div className="px-5 pb-4 overflow-y-auto space-y-4 flex-1">
          {viewMode === "guided" ? (
            <>
              <GuidedStepper steps={offerSteps} activeIndex={activeGuidedStep} onJump={setGuidedStep} />
              {stepSections[offerSteps[activeGuidedStep].key]}
            </>
          ) : (
            <>
              {basicsSection}
              {redemptionSection}
              {limitsSection}
              {detailsSection}
            </>
          )}
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
        <div className="px-5 pb-5 pt-3 border-t border-zinc-800 space-y-3 shrink-0">
          {viewMode === "guided" && (
            <StepperNav
              activeIndex={activeGuidedStep}
              count={offerSteps.length}
              onPrev={() => setGuidedStep(Math.max(0, activeGuidedStep - 1))}
              onNext={() => setGuidedStep(Math.min(offerSteps.length - 1, activeGuidedStep + 1))}
              accent="emerald"
              nextDisabledReason={stepDisabledReason(offerSteps[activeGuidedStep].key)}
            />
          )}
          {showSubmit && (
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={loading || !!validate()}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-600 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-[background-color,transform] duration-150 touch-manipulation"
              >
                {loading ? "Saving…" : submitLabel}
              </button>
              {onCancel && (
                <button type="button" onClick={onCancel} className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150">
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
