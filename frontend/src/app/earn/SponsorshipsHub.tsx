"use client";

import { SPONSORED_CHANGED_EVENT } from "@/components/map/useSponsoredMapLayer";
import { useCallback, useEffect, useRef, useState } from "react";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChoiceChips, Field, Note, Select, TextInput } from "@/components/ui/fields";
import { EmptyState, Section } from "@/components/ui/PageShell";
import AreaBuilder, { EMPTY_AREA, areaProblem, areaToPayload, type AreaDraft } from "./AreaBuilder";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useGameSettings } from "@/lib/gameSettings";
import AllocationReview from "./AllocationReview";
import DonateCard from "@/components/billing/DonateCard";
import SitePlacePicker, { EMPTY_SITE, sitePlaceProblem, type SitePlace } from "./SitePlacePicker";

const STATUS_HELP: [string, string][] = [
  ["Pending funding", "Created, but the payment has not gone through yet. Nothing is live and nobody can earn from it."],
  ["Funded", "Paid and live. A site or area pool shows on the map and workers can earn from it until the money runs out."],
  ["Exhausted", "Every dollar in the pool has been approved for payouts. It closes itself and leaves the map."],
  ["Released", "Closed by an admin with Mark released. It only records that decision, it does not send money."],
  ["Refunded", "The payment was refunded through Stripe, so the sponsorship is void. This is set automatically."],
];

const RULE_OPTIONS: {
  value: RuleType;
  modes: ("site" | "group_area")[];
  title: string;
  sub: string;
  areaTitle?: string;
  areaSub?: string;
}[] = [
  {
    value: "single",
    modes: ["site"],
    title: "One cleaner gets it all",
    sub: "The first cleanup an admin approves is paid the whole amount, then the site closes.",
  },
  {
    value: "flat_per_cleanup",
    modes: ["site", "group_area"],
    title: "Same pay for every cleanup",
    sub: "Built for multiple people to get paid. Every approved cleanup earns the amount you set, from a cleaner or a group, until the money runs out.",
    areaTitle: "Same pay for every event",
    areaSub: "Built for multiple groups to get paid. Every verified event earns the amount you set, from any group, until the money runs out.",
  },
  {
    value: "per_bag",
    modes: ["site", "group_area"],
    title: "Pay for each bag",
    sub: "Cleaners earn a set amount per bag they collect, up to a maximum number of bags.",
  },
  {
    value: "equal_split",
    modes: ["group_area"],
    title: "Pay for each person who shows up",
    sub: "Each attendee at a group's event earns the amount you set, so bigger events earn more.",
  },
];

const usdText = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

/** Plain-language outcome of the chosen rule, including what happens when it does not divide evenly. */
function payoutPreview(rule: RuleType, mode: TargetMode, total: number, unit: number, maxBags: number): string {
  const job = mode === "site" ? "cleanup" : "hosted event";
  if (rule === "single") return `One cleaner earns the full ${usdText(total)}. After that the site is finished.`;
  if (unit <= 0) return "Enter a payout amount to see how far your money goes.";
  const tail = "The pool closes itself when the money is used up.";
  if (rule === "flat_per_cleanup") {
    const n = Math.floor(total / unit);
    const rest = total - n * unit;
    if (n === 0) return `Each payout is ${usdText(unit)}, which is more than the ${usdText(total)} you are putting in.`;
    if (rest === 0) return `${usdText(total)} pays for exactly ${n} ${job}${n === 1 ? "" : "s"} at ${usdText(unit)} each. ${tail}`;
    return `${usdText(total)} pays for ${n} ${job}${n === 1 ? "" : "s"} at ${usdText(unit)}, then one last ${job} gets the ${usdText(rest)} that is left. ${tail}`;
  }
  if (rule === "per_bag") {
    const cap = Math.max(1, maxBags);
    const most = unit * cap;
    const mid = Math.min(3, cap);
    const examples = `1 bag pays ${usdText(unit)}${mid > 1 ? `, ${mid} bags pay ${usdText(unit * mid)}` : ""}, and ${cap} or more bags pay ${usdText(most)} (bags past ${cap} are not paid).`;
    const full = Math.floor(total / most);
    const rest = total - full * most;
    const coverage =
      full === 0
        ? `Your ${usdText(total)} is less than one full ${job}, so the first one takes it all.`
        : `${usdText(total)} covers ${full} full ${job}${full === 1 ? "" : "s"} of ${cap} bags${rest > 0 ? `, plus ${usdText(rest)} for a last partial one` : ""}. Smaller ${job}s stretch it further.`;
    return `${examples} ${coverage} ${mode === "site" ? "The cleaner reports the bag count with their after photo and an admin checks it." : "Bags come from the event's logged bag totals."} Whoever finishes after the money gets low is paid only what is left. ${tail}`;
  }
  return `Each attendee earns ${usdText(unit)}, so an event of 6 earns ${usdText(unit * 6)}. The last event is paid only what is left. ${tail}`;
}

/** Plain-language preview of what the form above will do, built from the numbers entered. */
function PayoutSummary({
  mode,
  rule,
  total,
  unit,
  maxBags,
  sponsorCap,
}: {
  mode: "site" | "group_area";
  rule: RuleType;
  total: number;
  unit: number;
  maxBags: number;
  sponsorCap: number;
}) {
  const { values } = useGameSettings([
    "sponsored_default_cap_per_user_usd",
    "sponsored_default_cap_per_group_usd",
    "sponsored_daily_cap_per_user_usd",
    "plus_earning_cap_multiplier",
  ] as const);
  const boost = Math.max(1, values.plus_earning_cap_multiplier ?? 2);
  const userDefault = Math.round((values.sponsored_default_cap_per_user_usd ?? 25) * 100);
  const groupDefault = Math.round((values.sponsored_default_cap_per_group_usd ?? 100) * 100);
  const daily = Math.round((values.sponsored_daily_cap_per_user_usd ?? 50) * 100);

  const lines: string[] = [`You put in ${usdText(total)}. Nothing more than that is ever paid out.`, payoutPreview(rule, mode, total, unit, maxBags)];

  if (mode === "site") {
    const biggest = rule === "single" ? total : rule === "per_bag" ? unit * Math.max(1, maxBags) : unit;
    if (rule === "single") {
      lines.push("Only one person can claim it, so no per-person limit applies.");
    } else if (sponsorCap > 0) {
      lines.push(`One person can earn at most ${usdText(sponsorCap)} here. A limit you set applies to everyone, Plus members included.`);
      if (biggest > sponsorCap) lines.push(`A payout above ${usdText(sponsorCap)} is trimmed down to it.`);
      if (sponsorCap < total) lines.push(`It takes at least ${Math.ceil(total / sponsorCap)} different cleaners to use all of the money.`);
    } else {
      lines.push(
        `With no limit set, one person can earn at most ${usdText(userDefault)} here (${usdText(Math.round(userDefault * boost))} for Plus members).`,
      );
      if (biggest > userDefault) lines.push(`A payout above that is trimmed down, so a larger payout mostly helps Plus members. Set your own limit to change it.`);
      if (userDefault < total) lines.push(`That means at least ${Math.ceil(total / userDefault)} different cleaners to use all of the money.`);
    }
  } else {
    lines.push(
      `One group can earn at most ${usdText(groupDefault)} from this area (${usdText(Math.round(groupDefault * boost))} for Plus groups), so at least ${Math.ceil(total / groupDefault)} group${Math.ceil(total / groupDefault) === 1 ? "" : "s"} are needed to use all of the money.`,
    );
  }
  lines.push(
    `Separately, nobody can earn more than ${usdText(daily)} a day across all sponsorships (${usdText(Math.round(daily * boost))} with Plus).`,
  );

  return (
    <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-sm font-semibold text-zinc-100">What this will look like</p>
      <ul className="space-y-1.5 text-sm text-zinc-300">
        {lines.map((l) => (
          <li key={l} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type SponsorshipStatus = "pending_funding" | "funded" | "released" | "refunded" | "exhausted";
type TargetMode = "site" | "group_area" | "donate";
/** "single" is a UI-only shortcut: one flat payout equal to the whole amount. */
type RuleType = "single" | "flat_per_cleanup" | "per_bag" | "equal_split";

interface Sponsorship {
  id: string;
  sponsor_type: "user" | "business";
  target_type: "cleanup_event" | "geo_unit" | "general" | "site" | "area" | "group";
  model?: "general" | "site" | "group_area" | "group_support";
  target_group_name?: string | null;
  remaining_cents?: number | null;
  site_label?: string | null;
  area_name?: string | null;
  amount_cents: number;
  currency: string;
  message: string | null;
  status: SponsorshipStatus;
  released_at: string | null;
  created_at: string;
  sponsor_user_name: string | null;
  sponsor_business_name: string | null;
  target_cleanup_title: string | null;
  target_geo_unit_name: string | null;
}

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

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

const STATUS_VARIANT: Record<SponsorshipStatus, BadgeVariant> = {
  pending_funding: "neutral",
  funded: "pending",
  released: "success",
  refunded: "error",
  exhausted: "neutral",
};

const SPONSOR_STEPS = ["Where", "Payout", "Amount", "Review"] as const;

export type PanelId = "claim" | "fund" | "review" | "all" | "admin";

export default function SponsorshipsHub({
  businesses,
  currentUserId,
  isAdmin,
  open,
  minCents = 1500,
}: {
  businesses: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
  open: PanelId | null;
  /** Global minimum sponsorship in cents (game_settings.min_payment_cents). The backend enforces it too. */
  minCents?: number;
}) {
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SponsorshipStatus | "">("");

  const [targetMode, setTargetMode] = useState<TargetMode>("site");
  const [site, setSite] = useState<SitePlace>(EMPTY_SITE);
  const [area, setArea] = useState<AreaDraft>(EMPTY_AREA);
  const [ruleType, setRuleType] = useState<RuleType>("single");
  const [ruleDollars, setRuleDollars] = useState("10");
  const [maxBags, setMaxBags] = useState("5");
  const [capDollars, setCapDollars] = useState("");
  const [sponsorMode, setSponsorMode] = useState<"user" | "business">("user");
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? "");
  const [amountDollars, setAmountDollars] = useState("25");
  const [message, setMessage] = useState("");
  const [openToAdditions, setOpenToAdditions] = useState(true);
  const [step, setStep] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (createError) createErrorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [createError]);

  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    if (!isAdmin) return;
    setListLoading(true);
    setListError(null);
    try {
      const url = statusFilter ? `/api/admin/sponsorships?status=${statusFilter}` : "/api/admin/sponsorships";
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setSponsorships((await res.json()).sponsorships ?? []);
    } catch (err) {
      setListError(extractErrorMessage(err, "Failed to load sponsorships"));
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, isAdmin]);

  const { values: capSettings } = useGameSettings(["sponsored_default_cap_per_user_usd", "plus_earning_cap_multiplier"] as const);
  const defaultCapUsd = capSettings.sponsored_default_cap_per_user_usd ?? 25;
  const plusCapMultiplier = Math.max(1, capSettings.plus_earning_cap_multiplier ?? 2);

  const totalCents = Math.round(parseFloat(amountDollars) * 100) || 0;

  const buildRule = (): Record<string, unknown> | null => {
    if (ruleType === "single") return totalCents > 0 ? { type: "flat_per_cleanup", amount_cents: totalCents } : null;
    const cents = Math.round(parseFloat(ruleDollars) * 100);
    if (!cents || cents <= 0) return null;
    if (ruleType === "per_bag") {
      const bags = parseInt(maxBags, 10);
      if (!bags || bags <= 0 || bags > 100) return null;
      return { type: "per_bag", cents_per_bag: cents, max_bags: bags };
    }
    return { type: ruleType, amount_cents: cents };
  };

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const goStep = (n: number) => {
    setCreateError(null);
    setStep(n);
    setTimeout(() => topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
  };

  const nextStep = () => {
    let problem: string | null = null;
    if (step === 0) problem = targetMode === "group_area" ? areaProblem(area) : sitePlaceProblem(site);
    if (step === 1 && ruleType !== "single" && !buildRule()) problem = "Enter a valid payout amount.";
    if (step === 2 && !(totalCents > 0)) problem = "Enter a valid amount.";
    else if (step === 2 && totalCents < minCents) problem = `The minimum sponsorship is ${usdText(minCents)}.`;
    if (step === 2 && !problem) {
      const rule = buildRule();
      if (rule && rule.type === "flat_per_cleanup" && (rule.amount_cents as number) > totalCents) {
        problem = "A single payout cannot be more than the total amount you are putting in.";
      }
    }
    if (problem) return setCreateError(problem);
    goStep(step + 1);
  };

  const handleCreate = async () => {
    if (targetMode === "donate") return;
    if (targetMode === "group_area") {
      const problem = areaProblem(area);
      if (problem) {
        setCreateError(problem);
        return;
      }
    }
    const isPooled = targetMode === "site" || targetMode === "group_area";
    const rule = isPooled ? buildRule() : null;
    if (isPooled && !rule) {
      setCreateError("Enter a valid payout amount.");
      return;
    }
    if (rule && rule.type === "flat_per_cleanup" && (rule.amount_cents as number) > totalCents) {
      setCreateError("A single payout cannot be more than the total amount you are putting in.");
      return;
    }
    if (targetMode === "site") {
      const problem = sitePlaceProblem(site);
      if (problem) {
        setCreateError(problem);
        return;
      }
    }
    const amountCents = Math.round(parseFloat(amountDollars) * 100);
    if (!amountCents || amountCents <= 0) {
      setCreateError("Enter a valid amount.");
      return;
    }
    if (amountCents < minCents) {
      setCreateError(`The minimum sponsorship is ${usdText(minCents)}.`);
      return;
    }
    if (sponsorMode === "business" && !businessId) {
      setCreateError("Select a business to sponsor as.");
      return;
    }

    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/sponsorships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor_type: sponsorMode,
          sponsor_user_id: sponsorMode === "user" ? currentUserId : null,
          sponsor_business_id: sponsorMode === "business" ? businessId : null,
          target_type: targetMode === "group_area" ? "area" : targetMode,
          target_geo_unit_id: null,
          area: targetMode === "group_area" ? areaToPayload(area) : null,
          area_name: targetMode === "group_area" ? area.name.trim() || null : null,
          model: targetMode,
          payout_rule: rule,
          cap_per_user_cents:
            targetMode === "site" && ruleType === "single"
              ? totalCents
              : targetMode === "site" && capDollars
                ? Math.round(parseFloat(capDollars) * 100)
                : null,
          site_label: targetMode === "site" ? site.label.trim() : null,
          site_latitude: targetMode === "site" && site.point ? site.point[1] : null,
          site_longitude: targetMode === "site" && site.point ? site.point[0] : null,
          site_radius_meters: targetMode === "site" ? site.radius : null,
          amount_cents: amountCents,
          open_to_additions: openToAdditions,
          message: message || null,
          success_url: `${window.location.origin}/earn?checkout=success`,
          cancel_url: `${window.location.origin}/earn`,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.location.assign(data.url);
    } catch (err) {
      setCreateError(extractErrorMessage(err, "Failed to start checkout"));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRelease = async (id: string) => {
    setReleasingId(id);
    setConfirmingId(null);
    try {
      const res = await fetch(`/api/admin/sponsorships/${id}/release`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      await refreshList();
      // The map and sites list above read the same pools, so tell them this one just closed.
      window.dispatchEvent(new Event(SPONSORED_CHANGED_EVENT));
    } catch (err) {
      setListError(extractErrorMessage(err, "Failed to release sponsorship"));
    } finally {
      setReleasingId(null);
    }
  };

  return (
    <div>
      <div id="fund-cleanups" className={open === "fund" ? "scroll-mt-20" : "hidden"}>
      <Section
        title="Fund cleanups"
        description="Pick where your money goes, then set how it pays out. Your money is only paid out after the work is verified."
      >
        <Card padding="lg" className="space-y-4">
          <div ref={topRef} className="scroll-mt-20" />
          {targetMode !== "donate" && (
            <div className="space-y-2">
              <div className="flex gap-1.5" aria-hidden="true">
                {SPONSOR_STEPS.map((_, i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-emerald-400" : "bg-zinc-800"}`} />
                ))}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Step {step + 1} of {SPONSOR_STEPS.length} · {SPONSOR_STEPS[step]}
              </p>
            </div>
          )}
          {step === 0 && (
          <>
          <ChoiceChips
            value={targetMode}
            onChange={(m) => {
              setTargetMode(m);
              if (m === "group_area" && ruleType === "single") setRuleType("flat_per_cleanup");
              if (m === "site" && ruleType === "equal_split") setRuleType("flat_per_cleanup");
            }}
            options={[
              { value: "site", label: "Cleanup site" },
              { value: "group_area", label: "Group area" },
              { value: "donate", label: "Donate to Frontline" },
            ]}
          />
          {targetMode === "donate" ? (
            <p className="text-sm text-zinc-400">Not tied to a place. A gift to Frontline overall, no payout rules.</p>
          ) : (
            <details className="group rounded-xl bg-zinc-900/60 p-3 ring-1 ring-inset ring-zinc-800">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
                <span>{targetMode === "site" ? "Cleanup site: a spot for individuals" : "Group area: a region for groups"}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <dl className="mt-2 space-y-1.5 text-sm text-zinc-400">
                <div>
                  <dt className="inline font-semibold text-zinc-300">Who earns: </dt>
                  <dd className="inline">
                    {targetMode === "site"
                      ? "any signed-in neighbor. They claim it, clean it and upload before and after photos."
                      : "groups only. A group hosts a cleanup event inside the area. Individuals cannot claim it."}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-zinc-300">On the map: </dt>
                  <dd className="inline">
                    {targetMode === "site"
                      ? "a pin. Claimers must be within the claim radius you set, so place it on the spot that needs cleaning."
                      : "a dashed, shaded region. Pick it from neighborhoods or draw your own shape."}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-zinc-300">Best for: </dt>
                  <dd className="inline">
                    {targetMode === "site"
                      ? "one litter spot, a lot or a stretch of street."
                      : "an ongoing push across a neighborhood or park."}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-zinc-300">Paid: </dt>
                  <dd className="inline">from your money once an admin approves the photos or the event is verified.</dd>
                </div>
              </dl>
            </details>
          )}

          {targetMode === "donate" && <DonateCard userId={currentUserId} embedded />}
          {targetMode === "group_area" && <AreaBuilder value={area} onChange={setArea} />}
          {targetMode === "site" && <SitePlacePicker value={site} onChange={setSite} />}
          </>
          )}
          {targetMode !== "donate" && step === 1 && (
            <div className="space-y-3">
              <div role="radiogroup" aria-label="How should cleaners be paid?" className="space-y-2">
                <p className="text-sm font-semibold text-zinc-200">How should cleaners be paid?</p>
                {RULE_OPTIONS.filter((o) => o.modes.includes(targetMode as "site" | "group_area")).map((o) => {
                  const on = ruleType === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setRuleType(o.value)}
                      className={`flex w-full flex-col rounded-2xl px-4 py-3 text-left touch-manipulation transition active:scale-[0.99] ${
                        on
                          ? "bg-emerald-400/15 ring-2 ring-inset ring-emerald-400/60"
                          : "bg-zinc-900 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800"
                      }`}
                    >
                      <span className={`text-sm font-bold ${on ? "text-emerald-200" : "text-zinc-100"}`}>
                        {targetMode === "group_area" && o.areaTitle ? o.areaTitle : o.title}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {targetMode === "group_area" && o.areaSub ? o.areaSub : o.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
              {ruleType !== "single" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={ruleType === "per_bag" ? "USD per bag" : ruleType === "equal_split" ? "USD per attendee" : "USD per payout"}>
                    <TextInput
                      type="number"
                      inputMode="decimal"
                      min={ruleType === "per_bag" ? "0.01" : "0.5"}
                      step="0.01"
                      value={ruleDollars}
                      onChange={(e) => setRuleDollars(e.target.value)}
                    />
                  </Field>
                  {ruleType === "per_bag" && (
                    <Field label="Max bags paid" hint="Bags past this are not paid.">
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="100"
                        value={maxBags}
                        onChange={(e) => setMaxBags(e.target.value)}
                      />
                    </Field>
                  )}
                </div>
              )}
              {targetMode === "site" && ruleType !== "single" && (
                <Field
                  label="Most one person can earn (USD)"
                  hint={`Stops one cleaner from taking the whole pool. Leave blank and each person can earn up to $${defaultCapUsd} (Plus members up to $${Math.round(defaultCapUsd * plusCapMultiplier)}).`}
                  optional
                >
                  <TextInput
                    type="number"
                    inputMode="decimal"
                    min="1"
                    placeholder={String(defaultCapUsd)}
                    value={capDollars}
                    onChange={(e) => setCapDollars(e.target.value)}
                  />
                </Field>
              )}
              {targetMode === "group_area" && (
                <p className="text-xs text-zinc-500">
                  Each group can earn at most a set amount from one area (Frontline default $100, higher for Plus
                  groups), so one crew cannot drain it.
                </p>
              )}

            </div>
          )}
          {targetMode !== "donate" && step === 2 && (
            <div className="space-y-3">
              <Field label="Total to put in (USD)" hint={`The whole pool. Nothing is paid out beyond this. Minimum ${usdText(minCents)}.`}>
                <TextInput
                  type="number"
                  inputMode="decimal"
                  min={String(minCents / 100)}
                  step="1"
                  value={amountDollars}
                  onChange={(e) => setAmountDollars(e.target.value)}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {[25, 50, 100, 250].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setAmountDollars(String(d))}
                      aria-pressed={amountDollars === String(d)}
                      className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold touch-manipulation active:scale-[0.96] ${
                        amountDollars === String(d) ? "bg-emerald-400 text-emerald-950" : "bg-zinc-800 text-zinc-200"
                      }`}
                    >
                      ${d}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {targetMode !== "donate" && step === 2 && (
          <>
          {targetMode === "site" && ruleType !== "single" && (() => {
            const unitCents = Math.round(parseFloat(ruleDollars) * 100) || 0;
            const bags = parseInt(maxBags, 10) || 1;
            const biggest = ruleType === "per_bag" ? unitCents * Math.max(1, bags) : ruleType === "flat_per_cleanup" ? unitCents : 0;
            if (totalCents <= 0 || biggest <= totalCents) return null;
            return (
              <Note tone="warn">
                <span className="block">
                  One cleanup can earn up to {usdText(biggest)}, but the total is only {usdText(totalCents)}. It should be at least{" "}
                  {usdText(biggest)} so a single cleanup is paid in full.
                </span>
                <button
                  type="button"
                  onClick={() => setAmountDollars(String(Math.ceil(biggest / 100)))}
                  className="mt-2 inline-flex min-h-9 items-center rounded-full bg-amber-400 px-3.5 text-[13px] font-semibold text-amber-950 touch-manipulation active:scale-[0.96]"
                >
                  Raise total to {usdText(Math.ceil(biggest / 100) * 100)}
                </button>
              </Note>
            );
          })()}

          {totalCents > 0 && (
            <PayoutSummary
              mode={targetMode === "group_area" ? "group_area" : "site"}
              rule={ruleType}
              total={totalCents}
              unit={Math.round(parseFloat(ruleDollars) * 100) || 0}
              maxBags={parseInt(maxBags, 10) || 0}
              sponsorCap={capDollars ? Math.round(parseFloat(capDollars) * 100) || 0 : 0}
            />
          )}

          </>
          )}
          {targetMode !== "donate" && step === 3 && (
          <>
          <p className="rounded-2xl bg-zinc-900 p-3 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-800">
            Putting in <span className="font-bold text-zinc-100">{usdText(totalCents)}</span> for{" "}
            <span className="font-bold text-zinc-100">
              {targetMode === "group_area" ? area.name.trim() || "a group area" : site.label.trim() || "a cleanup site"}
            </span>
            . It is only paid out after the work is verified.
          </p>
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
          {businesses.length === 0 && (
            <p className="text-xs text-zinc-500">
              Sponsoring as a business needs a business you run on Frontline.{" "}
              <Link href="/partners" className="text-zinc-300 underline underline-offset-2">
                Register one on Partners
              </Link>
              .
            </p>
          )}

          {sponsorMode === "business" && (
            <Field label="Business" hint="Only businesses you created or manage. Your name is replaced by theirs on the sponsorship.">
              <Select value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Message" optional>
            <TextInput
              type="text"
              placeholder="Say why you are sponsoring"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>

          {(targetMode === "site" || targetMode === "group_area") && (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-zinc-900 p-3 ring-1 ring-inset ring-zinc-800 touch-manipulation">
              <input
                type="checkbox"
                checked={openToAdditions}
                onChange={(e) => setOpenToAdditions(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-sky-500"
              />
              <span className="text-sm">
                <span className="block font-bold text-zinc-100">Let neighbors add to this</span>
                <span className="block text-zinc-400">
                  {openToAdditions
                    ? "Others can chip in more money, so the cleanup grows. Their names show next to yours."
                    : "Sole credit. Only you fund this one and nobody else can add to it."}
                </span>
              </span>
            </label>
          )}

          </>
          )}

          {createError && (
            <div ref={createErrorRef} className="scroll-mt-24">
              <Note tone="warn">{createError}</Note>
            </div>
          )}

          {targetMode !== "donate" && (
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="secondary" onClick={() => goStep(step - 1)}>
                  Back
                </Button>
              )}
              {step < SPONSOR_STEPS.length - 1 ? (
                <Button className="flex-1" onClick={nextStep}>
                  Next
                </Button>
              ) : (
                <Button className="flex-1" loading={createLoading} onClick={handleCreate}>
                  Continue to checkout
                </Button>
              )}
            </div>
          )}
        </Card>
      </Section>
      </div>

      {isAdmin && open === "admin" && !statusFilter && (
        <div className="mb-8 grid grid-cols-2 gap-3">
          <Card padding="sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Live pools</p>
            <p className="text-2xl font-extrabold text-zinc-50">{sponsorships.filter((s) => s.status === "funded").length}</p>
          </Card>
          <Card padding="sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Left in pools</p>
            <p className="text-2xl font-extrabold text-emerald-300">
              {usdText(sponsorships.filter((s) => s.status === "funded").reduce((n, s) => n + (s.remaining_cents ?? 0), 0))}
            </p>
          </Card>
        </div>
      )}

      {isAdmin && (
        <div id="allocation-review" className={open === "review" || open === "admin" ? "scroll-mt-20" : "hidden"}>
          {(open === "review" || open === "admin") && <AllocationReview />}
        </div>
      )}

      {isAdmin && (
      <div id="all-sponsorships" className={open === "all" || open === "admin" ? "scroll-mt-20" : "hidden"}>
      <Section
        title="Every sponsorship, all statuses"
        description="Admin only. Mark released closes a funded sponsorship once its money has gone out. It stays in this list, but leaves the map."
        action={
          <div className="w-44">
            <Select
              className="min-h-11"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SponsorshipStatus | "")}
            >
              <option value="">All statuses</option>
              <option value="pending_funding">Pending funding</option>
              <option value="funded">Funded</option>
              <option value="released">Released</option>
              <option value="refunded">Refunded</option>
              <option value="exhausted">Exhausted</option>
            </Select>
          </div>
        }
      >
        <details className="mb-3 rounded-xl bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400 ring-1 ring-inset ring-white/5">
          <summary className="cursor-pointer font-semibold text-zinc-200">What the statuses mean</summary>
          <dl className="mt-3 space-y-2.5">
            {STATUS_HELP.map(([name, text]) => (
              <div key={name}>
                <dt className="font-semibold text-zinc-300">{name}</dt>
                <dd className="text-zinc-400">{text}</dd>
              </div>
            ))}
          </dl>
        </details>
        {listError && <Note tone="warn">{listError}</Note>}
        {listLoading && sponsorships.length === 0 && <p className="text-sm text-zinc-500">Loading...</p>}
        {!listLoading && sponsorships.length === 0 && <EmptyState title="No sponsorships yet" />}

        <div className="space-y-3">
          {sponsorships.map((s) => {
            const sponsorLabel = s.sponsor_type === "user" ? s.sponsor_user_name ?? "A user" : s.sponsor_business_name ?? "A business";
            const targetLabel =
              s.target_type === "cleanup_event"
                ? s.target_cleanup_title ?? "a cleanup"
                : s.target_type === "general"
                  ? "Frontline's general fund"
                  : s.target_type === "site"
                    ? s.site_label ?? "a site"
                    : s.target_type === "area"
                      ? s.area_name ?? "an area"
                      : s.target_type === "group"
                        ? s.target_group_name ?? "a group"
                        : s.target_geo_unit_name ?? "an area";
            return (
              <Card key={s.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200">
                    <span className="font-semibold">{sponsorLabel}</span> sponsored <span className="font-semibold">{targetLabel}</span> for{" "}
                    <span className="font-semibold">{formatAmount(s.amount_cents, s.currency)}</span>
                  </p>
                  {s.message && <p className="mt-0.5 text-xs text-zinc-500">&quot;{s.message}&quot;</p>}
                  {s.model && s.model !== "general" && s.model !== "group_support" && s.remaining_cents != null && (
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {formatAmount(s.remaining_cents, s.currency)} left in pool
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-zinc-600">{new Date(s.created_at).toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Badge variant={STATUS_VARIANT[s.status]}>{s.status.replace("_", " ")}</Badge>
                  {s.status === "funded" &&
                    (confirmingId === s.id ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <p className="max-w-[14rem] text-right text-xs text-zinc-400">
                          Close this sponsorship? It cannot be undone here.
                        </p>
                        <div className="flex gap-2">
                          <Button variant="secondary" onClick={() => setConfirmingId(null)}>
                            Cancel
                          </Button>
                          <Button loading={releasingId === s.id} onClick={() => handleRelease(s.id)}>
                            Confirm release
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="secondary" onClick={() => setConfirmingId(s.id)}>
                        Mark released
                      </Button>
                    ))}
                </div>
              </Card>
            );
          })}
        </div>
      </Section>
      </div>
      )}
    </div>
  );
}
