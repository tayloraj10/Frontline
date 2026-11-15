"use client";

import { useEffect, useState } from "react";
import { Field, Note, TextInput } from "@/components/ui/fields";
import { usd, type PlanKind } from "@/lib/sponsorshipPools";

export type PlanOption = "flat" | "bag" | "group" | "vote" | "jobs";

export interface PlanChoice {
  option: PlanOption;
  /** Dollars per cleanup (flat). */
  amount: string;
  /** Dollars per bag. */
  perBag: string;
  maxBags: string;
  /** Group the area is handed to (group option). */
  groupId: string;
  groupName: string;
  note: string;
  date: string;
}

const CLEANUPS = 10; // how many cleanups the suggested flat amount spreads the goal over
const BAGS = 50; // bags the suggested per-bag rate spreads the goal over

const dollars = (n: number) => String(Math.max(1, Math.round(n)));

/** Starting values for the Adjust fields, based on the goal. */
export function suggestChoice(goalCents: number, option: PlanOption = "flat"): PlanChoice {
  const goal = goalCents / 100;
  return {
    option,
    amount: dollars(goal / CLEANUPS),
    perBag: dollars(goal / BAGS),
    maxBags: "10",
    groupId: "",
    groupName: "",
    note: "",
    date: "",
  };
}

const toCents = (v: string) => Math.round(parseFloat(v || "0") * 100);

/** The request fields for a choice (what the create and plan endpoints take). */
export function choiceToPayload(c: PlanChoice): {
  plan_kind: PlanKind;
  payout_rule?: Record<string, unknown>;
  group_id?: string;
  handoff_note?: string | null;
  handoff_date?: string | null;
} {
  if (c.option === "vote") return { plan_kind: "vote" };
  if (c.option === "jobs") return { plan_kind: "jobs" };
  if (c.option === "group") {
    return { plan_kind: "group", group_id: c.groupId, handoff_note: c.note.trim() || null, handoff_date: c.date || null };
  }
  if (c.option === "bag") {
    return {
      plan_kind: "rule",
      payout_rule: { type: "per_bag", cents_per_bag: toCents(c.perBag), max_bags: Math.max(1, parseInt(c.maxBags || "10", 10)) },
    };
  }
  return { plan_kind: "rule", payout_rule: { type: "flat_per_cleanup", amount_cents: toCents(c.amount) } };
}

export function choiceProblem(c: PlanChoice, goalCents: number): string | null {
  if (c.option === "vote" || c.option === "jobs") return null;
  if (c.option === "group") return c.groupId ? null : "Pick the group to hand this to.";
  if (c.option === "bag") {
    if (toCents(c.perBag) <= 0) return "Enter a rate per bag.";
    if (toCents(c.perBag) > goalCents) return "A single payout cannot be more than the goal.";
    return null;
  }
  if (toCents(c.amount) <= 0) return "Enter a payout amount.";
  if (toCents(c.amount) > goalCents) return "A single payout cannot be more than the goal.";
  return null;
}

/** One plain-language line describing what a choice means for the goal. */
function summary(opt: PlanOption, c: PlanChoice, goalCents: number): string {
  if (opt === "flat") {
    const per = toCents(c.amount);
    return per > 0 ? `About ${Math.floor(goalCents / per)} cleanups at ${usd(per)} each` : "Set an amount per cleanup";
  }
  if (opt === "bag") {
    const per = toCents(c.perBag);
    return per > 0
      ? `${usd(per)} per bag, about ${Math.floor(goalCents / per)} bags in all (up to ${c.maxBags || 10} per cleanup)`
      : "Set a rate per bag";
  }
  if (opt === "group") return c.groupName ? `Offered to ${c.groupName}` : "Pick a group";
  if (opt === "jobs") return "You post jobs up to the balance, contributors approve the work";
  return "Everyone who chipped in votes for 7 days";
}

const CARDS: { opt: PlanOption; title: string; blurb: string; areaOnly?: boolean; siteOnly?: boolean }[] = [
  { opt: "flat", title: "Pay cleaners for each cleanup", blurb: "A flat amount for every verified cleanup." },
  { opt: "bag", title: "Pay cleaners per bag", blurb: "Paid by how much gets collected.", siteOnly: true },
  {
    opt: "group",
    title: "Hand it to a group",
    blurb: "A group in the app runs the cleanups. Their admin has to accept, and you can pick a date.",
    areaOnly: true,
  },
  {
    opt: "jobs",
    title: "Create a jobs budget",
    blurb:
      "You post cleaning jobs on the job board, paid from the pool. Contributors approve each finished job, and anything unspent after 90 days is refunded to them. Needs cleaners with payouts set up.",
  },
  { opt: "vote", title: "Let contributors vote", blurb: "Everyone who chips in picks how the money is paid. This choice cannot be changed later." },
];

interface GroupHit {
  id: string;
  name: string;
  member_count: number;
}

function GroupPicker({ value, onChange }: { value: PlanChoice; onChange: (patch: Partial<PlanChoice>) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GroupHit[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sponsorship-pools/groups?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (!res.ok) throw new Error();
        setHits(await res.json());
        setFailed(false);
      } catch {
        if (!ctl.signal.aborted) setFailed(true);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  return (
    <div className="mt-2 space-y-3">
      <Field label="Find a group">
        <TextInput placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
      </Field>
      {failed && <Note tone="warn">Could not load groups.</Note>}
      <ul className="max-h-48 space-y-1.5 overflow-y-auto">
        {hits.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => onChange({ groupId: g.id, groupName: g.name })}
              aria-pressed={value.groupId === g.id}
              className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm touch-manipulation ${
                value.groupId === g.id ? "bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-400" : "bg-zinc-950 text-zinc-200"
              }`}
            >
              <span className="font-semibold">{g.name}</span>
              <span className="text-xs text-zinc-500">{g.member_count} members</span>
            </button>
          </li>
        ))}
      </ul>
      <Field label="A note for the group (optional)">
        <TextInput maxLength={200} value={value.note} onChange={(e) => onChange({ note: e.target.value })} />
      </Field>
      <Field label="Preferred date (optional)" hint="The group still sets the real event.">
        <TextInput type="date" value={value.date} onChange={(e) => onChange({ date: e.target.value })} />
      </Field>
    </div>
  );
}

/**
 * Pick-one choices for what happens to the money once the goal is reached. Used by the new pool
 * form and again when the starter changes the plan later.
 */
export default function PayoutOptions({
  model,
  goalCents,
  value,
  onChange,
  lockVote = false,
}: {
  model: "site" | "group_area";
  goalCents: number;
  value: PlanChoice;
  onChange: (next: PlanChoice) => void;
  lockVote?: boolean;
}) {
  const [adjusting, setAdjusting] = useState<PlanOption | null>(null);
  const cards = CARDS.filter((c) => !(c.siteOnly && model !== "site") && !(c.areaOnly && model !== "group_area"));
  const set = (patch: Partial<PlanChoice>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3" role="radiogroup" aria-label="What happens to the money once the goal is reached">
      {cards.map((c) => {
        const on = value.option === c.opt;
        const adjustable = c.opt !== "vote" && c.opt !== "jobs";
        return (
          <div
            key={c.opt}
            className={`rounded-2xl border p-3 ${on ? "border-emerald-400 bg-emerald-400/5" : "border-zinc-800 bg-zinc-900"}`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={on}
              disabled={lockVote && c.opt === "vote"}
              onClick={() => {
                set({ option: c.opt });
                if (c.opt === "group") setAdjusting("group");
              }}
              className="block min-h-11 w-full text-left touch-manipulation"
            >
              <span className="block text-sm font-bold text-zinc-100">{c.title}</span>
              <span className="block text-xs text-zinc-400">{c.blurb}</span>
              <span className="mt-1 block text-xs font-semibold text-emerald-300">{summary(c.opt, value, goalCents)}</span>
            </button>
            {on && adjustable && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setAdjusting(adjusting === c.opt ? null : c.opt)}
                  aria-expanded={adjusting === c.opt}
                  className="min-h-11 text-xs font-bold text-zinc-300 underline touch-manipulation"
                >
                  {adjusting === c.opt ? "Done" : c.opt === "group" ? "Choose group" : "Adjust"}
                </button>
                {adjusting === c.opt && c.opt === "group" && <GroupPicker value={value} onChange={set} />}
                {adjusting === c.opt && c.opt === "bag" && (
                  <div className="mt-1 space-y-3">
                    <Field label="Dollars per bag">
                      <TextInput inputMode="decimal" value={value.perBag} onChange={(e) => set({ perBag: e.target.value.replace(/[^0-9.]/g, "") })} />
                    </Field>
                    <Field label="Most bags paid per cleanup">
                      <TextInput inputMode="numeric" value={value.maxBags} onChange={(e) => set({ maxBags: e.target.value.replace(/\D/g, "") })} />
                    </Field>
                  </div>
                )}
                {adjusting === c.opt && c.opt === "flat" && (
                  <div className="mt-1 space-y-3">
                    <Field label="Dollars per cleanup">
                      <TextInput inputMode="decimal" value={value.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^0-9.]/g, "") })} />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
