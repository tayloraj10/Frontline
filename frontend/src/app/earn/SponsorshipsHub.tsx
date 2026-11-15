"use client";

import { LARGE_BAG_DEFINITION, MAX_MIN_LARGE_BAGS } from "@/lib/sponsoredBags";
import { useLimits } from "@/lib/useLimits";
import { SPONSORED_CHANGED_EVENT } from "@/components/map/useSponsoredMapLayer";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ChoiceChips,
  Field,
  Note,
  Select,
  TextInput,
} from "@/components/ui/fields";
import { EmptyState, Section } from "@/components/ui/PageShell";
import AreaBuilder, {
  EMPTY_AREA,
  areaProblem,
  areaToPayload,
  type AreaDraft,
} from "./AreaBuilder";
import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import AllocationReview from "./AllocationReview";
import DonateCard from "@/components/billing/DonateCard";
import SitePlacePicker, {
  EMPTY_SITE,
  sitePlaceProblem,
  type SitePlace,
} from "./SitePlacePicker";

const STATUS_HELP: [string, string][] = [
  [
    "Pending funding",
    "Created, but the payment has not gone through yet. Nothing is live and nobody can earn from it.",
  ],
  [
    "Funded",
    "Paid and live. A site or area pool shows on the map and workers can earn from it until the money runs out.",
  ],
  [
    "Exhausted",
    "Every dollar in the pool has been approved for payouts. It closes itself and leaves the map.",
  ],
  [
    "Released",
    "Closed by an admin with Mark released. It only records that decision, it does not send money.",
  ],
  [
    "Refunded",
    "The payment was refunded through Stripe, so the sponsorship is void. This is set automatically.",
  ],
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
    title: "Same pay for multiple cleanups",
    sub: "Funds several cleanups. Each approved cleanup earns the same amount, from any cleaner, until your total runs out.",
    areaTitle: "Same pay for one or multiple events",
    areaSub:
      "Funds one or several events. Each verified event earns the same amount, from any group, until your total runs out.",
  },
  {
    value: "per_bag",
    modes: ["site", "group_area"],
    title: "Pay per bag collected",
    sub: "A set amount for each bag the cleaner reports, up to a maximum number of bags per cleanup.",
    areaTitle: "Pay per bag collected",
    areaSub:
      "A set amount for each bag an event logs, up to a maximum number of bags per event.",
  },
  {
    value: "equal_split",
    modes: ["group_area"],
    title: "Pay per person who joins",
    sub: "Each person who shows up and checks in at a group's event earns the amount you set, up to the number of people your total funds. If fewer show up, the next event picks up the rest.",
  },
];

const usdText = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);

/** Amber highlight for the parts of a payout preview that people should not skim past (caps, shortfalls, leftovers). */
const flag = (text: string) => (
  <span className="font-semibold text-amber-300">{text}</span>
);
const leftover = (cents: number) => flag(usdText(cents));

/** Plain-language outcome of the chosen rule, including what happens when it does not divide evenly. */
function payoutPreview(
  rule: RuleType,
  mode: TargetMode,
  total: number,
  unit: number,
  maxBags: number,
  people = 10
): ReactNode {
  const job = mode === "site" ? "cleanup" : "hosted event";
  if (rule === "single")
    return `One cleaner earns the full ${usdText(
      total
    )}. After that the site is finished.`;
  if (unit <= 0) return "Enter a payout amount to see how far your money goes.";
  const tail = "The pool closes itself when the money is used up.";
  if (rule === "flat_per_cleanup") {
    const n = Math.floor(total / unit);
    const rest = total - n * unit;
    if (n === 0)
      return `Each payout is ${usdText(unit)}, which is more than the ${usdText(
        total
      )} you are putting in.`;
    if (rest === 0)
      return `${usdText(total)} pays for exactly ${n} ${job}${
        n === 1 ? "" : "s"
      } at ${usdText(unit)} each. ${tail}`;
    return (
      <>
        {`${usdText(total)} pays for ${n} ${job}${
          n === 1 ? "" : "s"
        } at ${usdText(unit)}, then one last ${job} gets the `}
        {leftover(rest)}
        {` that is left. ${tail}`}
      </>
    );
  }
  if (rule === "per_bag") {
    const cap = Math.max(1, maxBags);
    const most = unit * cap;
    const mid = Math.min(3, cap);
    const examples = (
      <>
        {`1 bag pays ${usdText(unit)}${
          mid > 1 ? `, ${mid} bags pay ${usdText(unit * mid)}` : ""
        }, and ${cap} or more bags pay ${usdText(most)} `}
        {`(bags past ${cap} are not paid).`}
      </>
    );
    const full = Math.floor(total / most);
    const rest = total - full * most;
    const coverage =
      full === 0 ? (
        <>
          {"Your "}
          {flag(usdText(total))}
          {" only funds "}
          {flag(`${Math.floor(total / unit)} bags in total`)}
          {` (not ${cap}), shared by everyone who cleans here until it runs out.`}
        </>
      ) : (
        <>
          {`${usdText(total)} covers ${full} full ${job}${
            full === 1 ? "" : "s"
          } of ${cap} bags`}
          {rest > 0 && (
            <>
              {", plus "}
              {leftover(rest)}
              {" for a last partial one"}
            </>
          )}
          {`. Smaller ${job}s stretch it further.`}
        </>
      );
    return (
      <>
        {examples}{" "}
        {coverage}
        {` ${
          mode === "site"
            ? "The cleaner reports the bag count with their after photo and an admin checks it."
            : "Bags come from the event's logged bag totals."
        } Whoever finishes after the money gets low is paid only what is left. ${tail}`}
      </>
    );
  }
  return (
    <>
      {`Each person who checks in at the event earns ${usdText(
        unit
      )}, up to ${Math.floor(
        total / unit
      )} people. If fewer show up, the rest stays in the pool and the next event picks up where this one left off. ${tail}`}
    </>
  );
}

/** Plain-language preview of what the form above will do, built from the numbers entered. */
function PayoutSummary({
  mode,
  rule,
  total,
  unit,
  maxBags,
  minBags,
  people,
}: {
  mode: "site" | "group_area";
  rule: RuleType;
  total: number;
  unit: number;
  maxBags: number;
  minBags: number;
  people: number;
}) {
  // Per-bag pays by the bag, so a minimum only applies to the other styles.
  const minNote =
    rule === "per_bag"
      ? ""
      : ` The cleanup needs at least ${minBags} large bag${
          minBags === 1 ? "" : "s"
        } to be paid.`;
  const lines: ReactNode[] = [
    `You put in ${usdText(total)}. Nothing more than that is ever paid out.`,
    payoutPreview(rule, mode, total, unit, maxBags, people),
  ];

  if (mode === "site") {
    if (rule === "single") {
      lines.push(
        `Only one cleaner gets it: the first approved cleanup is paid in full, and the site closes.${minNote}`
      );
    } else {
      lines.push(
        `Each person can earn from this site once a day, paid in full whatever the size, until the money runs out.${minNote}`
      );
    }
  } else {
    lines.push(
      rule === "equal_split"
        ? `Each group can host one event on this area per day. Only people who show up and check in at the event count.${minNote}`
        : `Each group can host one event on this area per day, paid in full whatever the size, until the money runs out.${minNote}`
    );
  }
  lines.push(
    "You can't be paid from your own sponsorship, and every payout is reviewed before it is released."
  );

  return (
    <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-sm font-semibold text-zinc-100">
        What this will look like
      </p>
      <ul className="space-y-1.5 text-sm text-zinc-300">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type SponsorshipStatus =
  | "pending_funding"
  | "funded"
  | "released"
  | "refunded"
  | "exhausted";
type TargetMode = "site" | "group_area" | "donate";
/** "single" is a UI-only shortcut: one flat payout equal to the whole amount. */
type RuleType = "single" | "flat_per_cleanup" | "per_bag" | "equal_split";

interface Sponsorship {
  id: string;
  sponsor_type: "user" | "business";
  target_type:
    | "cleanup_event"
    | "geo_unit"
    | "general"
    | "site"
    | "area"
    | "group";
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

const STATUS_VARIANT: Record<SponsorshipStatus, BadgeVariant> = {
  pending_funding: "pending",
  funded: "success",
  released: "violet",
  refunded: "error",
  exhausted: "info",
};

const SPONSOR_STEPS = ["Where", "Payout type", "Amount", "Review"] as const;

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
  const lim = useLimits();
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SponsorshipStatus | "">("");

  const [targetMode, setTargetMode] = useState<TargetMode>("site");
  const [site, setSite] = useState<SitePlace>(EMPTY_SITE);
  const [area, setArea] = useState<AreaDraft>(EMPTY_AREA);
  const [ruleType, setRuleType] = useState<RuleType>("single");
  const [ruleDollars, setRuleDollars] = useState("10");
  const [ruleDollarsTouched, setRuleDollarsTouched] = useState(false);
  const [maxBags, setMaxBags] = useState("10");
  // Starting USD per unit for each pay style, so the default $50 total lands on a clean count
  // (5 cleanups or 2 events, 10 bags, 10 people). Only applied until the sponsor edits the amount.
  const pickRule = (next: RuleType, mode: TargetMode = targetMode) => {
    setRuleType(next);
    if (!ruleDollarsTouched)
      setRuleDollars(
        next === "flat_per_cleanup" ? (mode === "group_area" ? "50" : "10") : "5"
      );
  };
  // Group areas start at a $100 total (2 events at $50, 20 bags at $5, or 20 people at $5), sites at
  // $50. Swapped only while the field still holds the other mode's default.
  const swapDefaults = (mode: TargetMode) => {
    const group = mode === "group_area";
    const swap = (
      cur: string,
      set: (v: string) => void,
      site: string,
      grp: string
    ) => {
      if (cur === (group ? site : grp)) set(group ? grp : site);
    };
    swap(amountDollars, setAmountDollars, "50", "100");
    swap(maxBags, setMaxBags, "10", "20");
    swap(peopleEach, setPeopleEach, "10", "20");
    if (!ruleDollarsTouched && ruleType === "flat_per_cleanup")
      setRuleDollars(group ? "50" : "10");
  };
  const [minBagsInput, setMinBagsInput] = useState("1");
  // Planning input only (sizes the per-event estimate). Never sent to the server.
  const [peopleEach, setPeopleEach] = useState("10");
  const [sponsorMode, setSponsorMode] = useState<"user" | "business">("user");
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? "");
  const [amountDollars, setAmountDollars] = useState("50");
  const [message, setMessage] = useState("");
  const [openToAdditions, setOpenToAdditions] = useState(true);
  // datetime-local value, empty means go live as soon as it is funded
  const [startsAt, setStartsAt] = useState("");
  const [step, setStep] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (createError)
      createErrorRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
  }, [createError]);

  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    if (!isAdmin) return;
    setListLoading(true);
    setListError(null);
    try {
      const url = statusFilter
        ? `/api/admin/sponsorships?status=${statusFilter}`
        : "/api/admin/sponsorships";
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setSponsorships((await res.json()).sponsorships ?? []);
    } catch (err) {
      setListError(extractErrorMessage(err, "Failed to load sponsorships"));
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, isAdmin]);

  const totalCents = Math.round(parseFloat(amountDollars) * 100) || 0;
  const debouncedAmount = useDebouncedValue(amountDollars);
  const amountTooLow =
    debouncedAmount !== "" &&
    Math.round(parseFloat(debouncedAmount) * 100 || 0) < minCents;
  const unitCentsNow = Math.round(parseFloat(ruleDollars) * 100) || 0;
  const bagsNow = Math.min(100, Math.max(1, parseInt(maxBags, 10) || 1));
  const peoplePlanned = Math.min(
    500,
    Math.max(1, parseInt(peopleEach, 10) || 1)
  );
  const countBased = ruleType === "per_bag" || ruleType === "equal_split";
  const countNow = ruleType === "per_bag" ? bagsNow : peoplePlanned;
  // The most one cleanup or event can be paid, and the total that covers the number planned.
  const perJobCents =
    ruleType === "single"
      ? totalCents
      : ruleType === "per_bag"
      ? unitCentsNow * bagsNow
      : ruleType === "equal_split"
      ? unitCentsNow * peoplePlanned
      : unitCentsNow;
  const noun = targetMode === "group_area" ? "event" : "cleanup";

  const minBagsNow = Math.min(
    MAX_MIN_LARGE_BAGS,
    Math.max(1, parseInt(minBagsInput, 10) || 1)
  );

  const buildRule = (): Record<string, unknown> | null => {
    if (ruleType === "single")
      return totalCents > 0
        ? {
            type: "flat_per_cleanup",
            amount_cents: totalCents,
            one_winner: true,
            min_large_bags: minBagsNow,
          }
        : null;
    const cents = Math.round(parseFloat(ruleDollars) * 100);
    if (!cents || cents <= 0) return null;
    if (ruleType === "per_bag") {
      const bags = parseInt(maxBags, 10);
      if (!bags || bags <= 0 || bags > 100) return null;
      return {
        type: "per_bag",
        cents_per_bag: cents,
        max_bags: bags,
        min_large_bags: 1,
      };
    }
    return { type: ruleType, amount_cents: cents, min_large_bags: minBagsNow };
  };

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const goStep = (n: number) => {
    setCreateError(null);
    setStep(n);
    setTimeout(
      () =>
        topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
      0
    );
  };

  const nextStep = () => {
    let problem: string | null = null;
    if (step === 0)
      problem =
        targetMode === "group_area"
          ? areaProblem(area, lim)
          : sitePlaceProblem(site, lim);
    if (step === 2) {
      if (ruleType !== "single" && !buildRule())
        problem = "Enter a valid payout amount.";
      else if (!(totalCents > 0)) problem = "Enter a valid amount.";
      else if (totalCents < minCents)
        problem = `The minimum sponsorship is ${usdText(minCents)}.`;
    }
    if (problem) return setCreateError(problem);
    goStep(step + 1);
  };

  const handleCreate = async () => {
    if (targetMode === "donate") return;
    if (targetMode === "group_area") {
      const problem = areaProblem(area, lim);
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
    if (targetMode === "site") {
      const problem = sitePlaceProblem(site, lim);
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

    const scheduled =
      (targetMode === "site" || targetMode === "group_area") && startsAt
        ? new Date(startsAt)
        : null;
    if (scheduled && scheduled.getTime() <= Date.now()) {
      setCreateError("Pick a start date in the future, or clear it to go live right away.");
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
          area_name:
            targetMode === "group_area" ? area.name.trim() || null : null,
          model: targetMode,
          payout_rule: rule,
          site_label: targetMode === "site" ? site.label.trim() : null,
          site_latitude:
            targetMode === "site" && site.point ? site.point[1] : null,
          site_longitude:
            targetMode === "site" && site.point ? site.point[0] : null,
          site_radius_meters: targetMode === "site" ? site.radius : null,
          amount_cents: amountCents,
          open_to_additions: openToAdditions,
          starts_at: scheduled ? scheduled.toISOString() : null,
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
      const res = await fetch(`/api/admin/sponsorships/${id}/release`, {
        method: "POST",
      });
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
      <div
        id="fund-cleanups"
        className={open === "fund" ? "scroll-mt-20" : "hidden"}
      >
        <Section>
          <Card padding="lg" className="space-y-4">
            <div ref={topRef} className="scroll-mt-20" />
            {targetMode !== "donate" && (
              <div className="space-y-2">
                <div className="flex gap-1.5" aria-hidden="true">
                  {SPONSOR_STEPS.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${
                        i <= step ? "bg-emerald-400" : "bg-zinc-800"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Step {step + 1} of {SPONSOR_STEPS.length} ·{" "}
                  {SPONSOR_STEPS[step]}
                </p>
              </div>
            )}
            {step === 0 && (
              <>
                <div className="-mx-3 grid grid-cols-2 grid-rows-[repeat(4,auto)] gap-x-2 gap-y-0 sm:mx-0">
                  {(
                    [
                      {
                        value: "site",
                        Icon: MapPin,
                        name: "Cleanup site",
                        tone: "rose",
                        rows: [
                          ["Who earns", "any neighbor."],
                          ["On the map", "a pin with a claim radius."],
                          ["Best for", "one litter spot or street."],
                        ],
                      },
                      {
                        value: "group_area",
                        Icon: Users,
                        name: "Group area",
                        tone: "orange",
                        rows: [
                          ["Who earns", "groups, via events."],
                          ["On the map", "a shaded region you pick or draw."],
                          ["Best for", "a neighborhood or park."],
                        ],
                      },
                    ] as const
                  ).map(({ value, Icon, name, tone, rows }) => {
                    const on = targetMode === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setTargetMode(value);
                          if (value === "group_area" && ruleType === "single")
                            pickRule("flat_per_cleanup", value);
                          if (value === "site" && ruleType === "equal_split")
                            pickRule("flat_per_cleanup", value);
                          swapDefaults(value);
                        }}
                        className={`row-span-4 grid grid-rows-subgrid gap-y-1.5 rounded-2xl p-3 text-left touch-manipulation transition active:scale-[0.99] ${
                          on
                            ? tone === "rose"
                              ? "bg-rose-400/10 ring-2 ring-inset ring-rose-400/70"
                              : "bg-orange-400/10 ring-2 ring-inset ring-orange-400/70"
                            : "bg-zinc-900 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-1.5">
                          <span
                            className={`flex items-center gap-1.5 text-sm font-bold ${
                              tone === "rose"
                                ? "text-rose-300"
                                : "text-orange-300"
                            }`}
                          >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {name}
                          </span>
                          <span
                            aria-hidden="true"
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                              on
                                ? tone === "rose"
                                  ? "border-rose-400"
                                  : "border-orange-400"
                                : "border-zinc-500"
                            }`}
                          >
                            {on && (
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${
                                  tone === "rose"
                                    ? "bg-rose-400"
                                    : "bg-orange-400"
                                }`}
                              />
                            )}
                          </span>
                        </span>
                        {rows.map(([k, v]) => (
                          <p
                            key={k}
                            className="border-t border-zinc-700/60 pt-1.5 text-xs leading-snug text-zinc-400"
                          >
                            <span className="font-semibold text-zinc-300">
                              {k}:{" "}
                            </span>
                            {v}
                          </p>
                        ))}
                      </button>
                    );
                  })}
                </div>
                {targetMode === "donate" ? (
                  <p className="text-xs text-zinc-400">
                    A gift to Frontline overall, not tied to a place. It helps
                    keep the app running, fund cleanups and pay people.
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setTargetMode("donate")}
                      className="flex min-h-11 w-full flex-col items-center justify-center rounded-xl bg-sky-500/10 px-4 py-2 text-center ring-1 ring-inset ring-sky-400/40 touch-manipulation hover:bg-sky-500/15 active:scale-[0.99]"
                    >
                      <span className="text-sm font-semibold text-sky-300">
                        Just want to donate to Frontline?
                      </span>
                      <span className="text-xs text-zinc-400">
                        It helps keep us running, fund cleanups and pay people.
                      </span>
                    </button>
                  </>
                )}

                {targetMode === "donate" && (
                  <DonateCard userId={currentUserId} embedded />
                )}
                {targetMode === "group_area" && (
                  <AreaBuilder value={area} onChange={setArea} />
                )}
                {targetMode === "site" && (
                  <SitePlacePicker value={site} onChange={setSite} />
                )}
              </>
            )}
            {targetMode !== "donate" && step === 1 && (
              <div className="space-y-4">
                <div
                  role="radiogroup"
                  aria-label="How should cleaners be paid?"
                  className="space-y-2"
                >
                  <p className="text-sm font-semibold text-zinc-200">
                    How should cleaners be paid?
                  </p>
                  {RULE_OPTIONS.filter((o) =>
                    o.modes.includes(targetMode as "site" | "group_area")
                  ).map((o) => {
                    const on = ruleType === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => pickRule(o.value)}
                        className={`flex w-full flex-col rounded-2xl px-4 py-3 text-left touch-manipulation transition active:scale-[0.99] ${
                          on
                            ? "bg-emerald-400/15 ring-2 ring-inset ring-emerald-400/60"
                            : "bg-zinc-900 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800"
                        }`}
                      >
                        <span
                          className={`text-sm font-bold ${
                            on ? "text-emerald-200" : "text-zinc-100"
                          }`}
                        >
                          {targetMode === "group_area" && o.areaTitle
                            ? o.areaTitle
                            : o.title}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {targetMode === "group_area" && o.areaSub
                            ? o.areaSub
                            : o.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-sm text-sky-300">
                  You'll set dollar amounts on the next page.
                </p>
              </div>
            )}
            {targetMode !== "donate" && step === 2 && (
              <div className="space-y-4">
                <p className="rounded-2xl bg-zinc-900 px-3 py-2 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-800">
                  Paying:{" "}
                  <span className="font-bold text-zinc-100">
                    {(() => {
                      const o = RULE_OPTIONS.find((r) => r.value === ruleType);
                      return targetMode === "group_area" && o?.areaTitle
                        ? o.areaTitle
                        : o?.title;
                    })()}
                  </span>
                </p>

                <div className="grid grid-cols-2 gap-3 [&>*:last-child:nth-child(odd)]:col-span-2">
                  {ruleType !== "single" && (
                    <Field
                      label={
                        ruleType === "per_bag"
                          ? "USD per bag"
                          : ruleType === "equal_split"
                          ? "USD per person"
                          : targetMode === "group_area"
                          ? "USD per event"
                          : "USD per cleanup"
                      }
                    >
                      <TextInput
                        type="number"
                        inputMode="decimal"
                        min={ruleType === "per_bag" ? "0.01" : "0.5"}
                        step="0.01"
                        value={ruleDollars}
                        onChange={(e) => {
                          setRuleDollarsTouched(true);
                          setRuleDollars(e.target.value);
                        }}
                      />
                    </Field>
                  )}
                  {ruleType === "per_bag" && (
                    <Field
                      label="Max bags funded"
                      hint="The most bags this will pay for. Bags past this are not paid."
                      info={LARGE_BAG_DEFINITION}
                    >
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
                  {ruleType === "equal_split" && (
                    <Field
                      label="People funded"
                      hint="Only people who check in at the event count. Pay stops when your total runs out."
                    >
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={peopleEach}
                        onChange={(e) => setPeopleEach(e.target.value)}
                      />
                    </Field>
                  )}
                  {ruleType !== "per_bag" && (
                    <Field
                      label="Min large bags"
                      info={LARGE_BAG_DEFINITION}
                      hint={targetMode === "group_area" ? "Per event. Nothing is paid for less." : "Per cleanup. Nothing is paid for less."}
                    >
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max={String(MAX_MIN_LARGE_BAGS)}
                        value={minBagsInput}
                        onChange={(e) => setMinBagsInput(e.target.value)}
                      />
                    </Field>
                  )}
                </div>

                {targetMode === "group_area" && (
                  <p className="text-xs text-zinc-500">
                    A group can host one event on an area per day, and each
                    group has a weekly earning limit (higher for Plus groups),
                    so one crew cannot drain it.
                  </p>
                )}

                <Field
                  label="Total to put in (USD)"
                  hint={`The whole pool. Nothing is paid out beyond this. Minimum ${usdText(
                    minCents
                  )}.`}
                >
                  <TextInput
                    type="number"
                    inputMode="decimal"
                    min={String(minCents / 100)}
                    step="1"
                    className={amountTooLow ? "!text-amber-400" : undefined}
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                  />
                  {amountTooLow && (
                    <p
                      role="alert"
                      className="mt-1.5 text-xs font-medium text-amber-400"
                    >
                      Under the {usdText(minCents)} minimum. Raise the amount to
                      continue.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[25, 50, 100, 250].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setAmountDollars(String(d))}
                        aria-pressed={amountDollars === String(d)}
                        className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold touch-manipulation active:scale-[0.96] ${
                          amountDollars === String(d)
                            ? "bg-emerald-400 text-emerald-950"
                            : "bg-zinc-800 text-zinc-200"
                        }`}
                      >
                        ${d}
                      </button>
                    ))}
                  </div>
                </Field>

                {perJobCents > 0 && ruleType !== "single" && (
                  <div className="space-y-2 rounded-2xl bg-zinc-900 p-3 text-sm ring-1 ring-inset ring-zinc-800">
                    <p className="text-zinc-300">
                      {ruleType === "per_bag" || ruleType === "equal_split" ? (
                        <>
                          {`${countNow} ${
                            ruleType === "per_bag"
                              ? countNow === 1
                                ? "bag"
                                : "bags"
                              : countNow === 1
                              ? "person"
                              : "people"
                          } at ${usdText(
                            unitCentsNow
                          )} each takes `}
                          <span className="font-bold text-zinc-100">
                            {usdText(perJobCents)}
                          </span>
                          {" to fund in full."}
                        </>
                      ) : totalCents >= perJobCents ? (
                        <>
                          {usdText(totalCents)} at{" "}
                          {ruleType === "flat_per_cleanup" ? "" : "up to "}
                          {usdText(perJobCents)} each funds{" "}
                          <span className="font-bold text-zinc-100">
                            {ruleType === "flat_per_cleanup" ? "" : "about "}
                            {Math.floor(totalCents / perJobCents)} {noun}
                            {Math.floor(totalCents / perJobCents) === 1
                              ? ""
                              : "s"}
                          </span>
                          .
                        </>
                      ) : (
                        <>
                          One full {noun} can earn{" "}
                          {ruleType === "flat_per_cleanup" ? "" : "up to "}
                          {usdText(perJobCents)}
                          .
                        </>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(countBased
                        ? Array.from(new Set([10, 20, 50, countNow]))
                            .sort((a, b) => a - b)
                            .map((n) => ({ n, cents: unitCentsNow * n }))
                        : [3, 5, 10].map((n) => ({
                            n,
                            cents: Math.ceil((perJobCents * n) / 100) * 100,
                          }))
                      )
                        .filter((o) => o.cents >= minCents)
                        .map((o) => (
                          <button
                            key={o.n}
                            type="button"
                            onClick={() => {
                              setAmountDollars(String(o.cents / 100));
                              if (ruleType === "per_bag") setMaxBags(String(o.n));
                              if (ruleType === "equal_split")
                                setPeopleEach(String(o.n));
                            }}
                            aria-pressed={totalCents === o.cents}
                            className={`inline-flex min-h-9 items-center rounded-full px-3.5 text-[13px] font-semibold touch-manipulation active:scale-[0.96] ${
                              totalCents === o.cents
                                ? "bg-emerald-400 text-emerald-950"
                                : "bg-zinc-800 text-zinc-200"
                            }`}
                          >
                            {usdText(o.cents)} for {o.n}{" "}
                            {ruleType === "per_bag"
                              ? "bags"
                              : ruleType === "equal_split"
                              ? "people"
                              : `${noun}s`}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {perJobCents > 0 &&
                  totalCents > 0 &&
                  totalCents < perJobCents &&
                  ruleType !== "single" && (
                    <Note tone="warn">
                      {countBased
                        ? `${usdText(totalCents)} only covers ${Math.floor(
                            totalCents / unitCentsNow
                          )} ${
                            ruleType === "per_bag" ? "bags" : "people"
                          }, not the ${countNow} you set. Raise the total to fund more. You can still continue with less.`
                        : `${usdText(
                            totalCents
                          )} is less than one full ${noun} can earn, so the first one to finish is paid only what is there. Raise the total to cover more. You can still continue with less.`}
                    </Note>
                  )}
                {ruleType === "equal_split" && (
                  <Note tone="info">
                    Groups have a reason to bring more people, since everyone
                    who shows up and checks in earns. If an event has fewer
                    people than you funded, the next event picks up the rest.
                    Pay stops when your total runs out, and groups are told
                    this before they sign up.
                  </Note>
                )}

                {totalCents > 0 && (
                  <PayoutSummary
                    mode={targetMode === "group_area" ? "group_area" : "site"}
                    rule={ruleType}
                    total={totalCents}
                    unit={unitCentsNow}
                    maxBags={parseInt(maxBags, 10) || 0}
                    minBags={minBagsNow}
                    people={peoplePlanned}
                  />
                )}
              </div>
            )}
            {targetMode !== "donate" && step === 3 && (
              <>
                <p className="rounded-2xl bg-zinc-900 p-3 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-800">
                  Putting in{" "}
                  <span className="font-bold text-zinc-100">
                    {usdText(totalCents)}
                  </span>{" "}
                  for{" "}
                  <span className="font-bold text-zinc-100">
                    {targetMode === "group_area"
                      ? area.name.trim() || "a group area"
                      : site.label.trim() || "a cleanup site"}
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
                      idleClass:
                        businesses.length === 0
                          ? "bg-zinc-800 text-zinc-600"
                          : undefined,
                    },
                  ]}
                />
                {businesses.length === 0 && (
                  <p className="text-xs text-zinc-500">
                    Sponsoring as a business needs a business you run on
                    Frontline.{" "}
                    <Link
                      href="/partners"
                      className="text-zinc-300 underline underline-offset-2"
                    >
                      Register one on Partners
                    </Link>
                    .
                  </p>
                )}

                {sponsorMode === "business" && (
                  <Field
                    label="Business"
                    hint="Only businesses you created or manage. Your name is replaced by theirs on the sponsorship."
                  >
                    <Select
                      value={businessId}
                      onChange={(e) => setBusinessId(e.target.value)}
                    >
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
                  <Field
                    label="Start date"
                    optional
                    hint="Leave empty to go live as soon as it is funded. Frontline Plus members see it one day before it opens to everyone."
                  >
                    <TextInput
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                  </Field>
                )}

                {(targetMode === "site" || targetMode === "group_area") && (
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-zinc-900 p-3 ring-1 ring-inset ring-zinc-800 touch-manipulation">
                    <input
                      type="checkbox"
                      checked={openToAdditions}
                      onChange={(e) => setOpenToAdditions(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-sky-500"
                    />
                    <span className="text-sm">
                      <span className="block font-bold text-zinc-100">
                        Let neighbors add to this
                      </span>
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

            {targetMode !== "donate" && step === SPONSOR_STEPS.length - 1 && (
              <Note tone="warn">
                Hazardous sites are against Frontline policy. Do not sponsor
                places with needles, chemicals, bulk or heavy items, flooded or
                steep ground, or anywhere you do not have permission for people
                to be. Cleaners are told to skip them.
              </Note>
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
                  <Button
                    className="flex-1"
                    loading={createLoading}
                    onClick={handleCreate}
                  >
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
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Live pools
            </p>
            <p className="text-2xl font-extrabold text-zinc-50">
              {sponsorships.filter((s) => s.status === "funded").length}
            </p>
          </Card>
          <Card padding="sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Left in pools
            </p>
            <p className="text-2xl font-extrabold text-emerald-300">
              {usdText(
                sponsorships
                  .filter((s) => s.status === "funded")
                  .reduce((n, s) => n + (s.remaining_cents ?? 0), 0)
              )}
            </p>
          </Card>
        </div>
      )}

      {isAdmin && (
        <div
          id="allocation-review"
          className={
            open === "review" || open === "admin" ? "scroll-mt-20" : "hidden"
          }
        >
          {(open === "review" || open === "admin") && <AllocationReview />}
        </div>
      )}

      {isAdmin && (
        <div
          id="all-sponsorships"
          className={
            open === "all" || open === "admin" ? "scroll-mt-20" : "hidden"
          }
        >
          <Section
            title="Every sponsorship, all statuses"
            description="Admin only. Mark released closes a funded sponsorship once its money has gone out. It stays in this list, but leaves the map."
            action={
              <div className="w-44">
                <Select
                  className="min-h-11"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as SponsorshipStatus | "")
                  }
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
              <summary className="cursor-pointer font-semibold text-zinc-200">
                What the statuses mean
              </summary>
              <dl className="mt-3 space-y-2.5">
                {STATUS_HELP.map(([name, text]) => (
                  <div key={name}>
                    <dt>
                      <Badge
                        variant={
                          STATUS_VARIANT[
                            name
                              .toLowerCase()
                              .replace(" ", "_") as SponsorshipStatus
                          ]
                        }
                      >
                        {name}
                      </Badge>
                    </dt>
                    <dd className="mt-1 text-zinc-400">{text}</dd>
                  </div>
                ))}
              </dl>
            </details>
            {listError && <Note tone="warn">{listError}</Note>}
            {listLoading && sponsorships.length === 0 && (
              <p className="text-sm text-zinc-500">Loading...</p>
            )}
            {!listLoading && sponsorships.length === 0 && (
              <EmptyState title="No sponsorships yet" />
            )}

            <div className="space-y-3">
              {sponsorships.map((s) => {
                const sponsorLabel =
                  s.sponsor_type === "user"
                    ? s.sponsor_user_name ?? "A user"
                    : s.sponsor_business_name ?? "A business";
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
                  <Card
                    key={s.id}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200">
                        <span className="font-semibold">{sponsorLabel}</span>{" "}
                        sponsored{" "}
                        <span className="font-semibold">{targetLabel}</span> for{" "}
                        <span className="font-semibold">
                          {formatAmount(s.amount_cents, s.currency)}
                        </span>
                      </p>
                      {s.message && (
                        <p className="mt-0.5 text-xs text-zinc-500">
                          &quot;{s.message}&quot;
                        </p>
                      )}
                      {s.model &&
                        s.model !== "general" &&
                        s.model !== "group_support" &&
                        s.remaining_cents != null && (
                          <p className="mt-0.5 text-xs text-zinc-400">
                            {formatAmount(s.remaining_cents, s.currency)} left
                            in pool
                          </p>
                        )}
                      <p className="mt-0.5 text-[11px] text-zinc-600">
                        {new Date(s.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge variant={STATUS_VARIANT[s.status]}>
                        {s.status.replace("_", " ")}
                      </Badge>
                      {s.status === "funded" &&
                        (confirmingId === s.id ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <p className="max-w-[14rem] text-right text-xs text-zinc-400">
                              Close this sponsorship? It cannot be undone here.
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
                                onClick={() => setConfirmingId(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                loading={releasingId === s.id}
                                onClick={() => handleRelease(s.id)}
                              >
                                Confirm release
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() => setConfirmingId(s.id)}
                          >
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
