"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Note } from "@/components/ui/fields";
import { Card } from "@/components/ui/Card";
import { daysLeft, usd, type SponsorshipPool } from "@/lib/sponsorshipPools";
import PayoutOptions, { choiceProblem, choiceToPayload, suggestChoice, type PlanChoice } from "../PayoutOptions";

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return typeof data?.detail === "string" ? data.detail : fallback;
}

/** The pool's current plan as the form's choice, so the editor opens on what is saved. */
function currentChoice(pool: SponsorshipPool): PlanChoice {
  const rule = pool.payout_rule;
  const dollars = (c?: number) => String(Math.round((c ?? 0) / 100));
  if (pool.plan_kind === "vote") return suggestChoice(pool.goal_cents, "vote");
  if (pool.plan_kind === "jobs") return suggestChoice(pool.goal_cents, "jobs");
  if (pool.plan_kind === "group") {
    return {
      ...suggestChoice(pool.goal_cents, "group"),
      groupId: pool.handoff_group_id ?? "",
      groupName: pool.handoff_group_name ?? "",
      note: pool.handoff_note ?? "",
      date: pool.handoff_date ?? "",
    };
  }
  if (rule?.type === "per_bag") {
    return { ...suggestChoice(pool.goal_cents, "bag"), perBag: dollars(rule.cents_per_bag), maxBags: String(rule.max_bags ?? 10) };
  }
  const base = suggestChoice(pool.goal_cents, "flat");
  return rule?.amount_cents ? { ...base, amount: dollars(rule.amount_cents) } : base;
}

const MANAGED = ["open", "goal_missed", "handoff", "choosing", "active"];

/**
 * Starter-only controls: decide what to do when the goal was missed or a hand-off fell through,
 * and change the plan while nothing has been paid out yet.
 */
export default function PoolManage({ pool }: { pool: SponsorshipPool }) {
  const router = useRouter();
  const [choice, setChoice] = useState<PlanChoice>(() => currentChoice(pool));
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!pool.is_creator || !MANAGED.includes(pool.status)) return null;
  if (pool.status === "active" && pool.plan_kind !== "rule") return null;  // nothing to change; PoolJobs handles jobs pools
  const base = `/api/sponsorship-pools/${pool.id}`;
  // A chosen vote is final, and a funded pool that is not a plain payout rule cannot be swapped.
  const planLocked = pool.status === "handoff" || (pool.plan_kind !== "rule" && pool.status === "active");

  const post = async (action: string, path: string, body?: unknown) => {
    setBusy(action);
    setError(null);
    const res = await fetch(`${base}/${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      setError(await readError(res, "Something went wrong."));
      setBusy(null);
      return;
    }
    setBusy(null);
    setEditing(false);
    setConfirmCancel(false);
    router.refresh();
  };

  const savePlan = () => {
    const problem = choiceProblem(choice, pool.goal_cents);
    if (problem) return setError(problem);
    const p = choiceToPayload(choice);
    void post("plan", "plan", {
      kind: p.plan_kind,
      payout_rule: p.payout_rule,
      group_id: p.group_id,
      note: p.handoff_note,
      date: p.handoff_date,
    });
  };

  const missedLeft = pool.missed_deadline ? daysLeft(pool.missed_deadline) : 14;
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

  const cancelButton = confirmCancel ? (
    <div className="space-y-2">
      <Button variant="destructive" className="w-full" loading={busy === "cancel"} onClick={() => post("cancel", "cancel")}>
        Yes, cancel and refund everyone
      </Button>
      <Button variant="ghost" className="w-full" disabled={busy === "cancel"} onClick={() => setConfirmCancel(false)}>
        Keep the pool
      </Button>
    </div>
  ) : (
    <Button variant="secondary" className="w-full" onClick={() => setConfirmCancel(true)}>
      Cancel and refund
    </Button>
  );

  return (
    <Card className="mb-4 space-y-3 p-4">
      {pool.status === "goal_missed" && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-zinc-100">The goal was not met. What now?</h2>
          <Note tone="info">
            {usd(pool.raised_cents)} of {usd(pool.goal_cents)} was raised. Nothing is refunded unless you choose to, or you do
            nothing for {days(missedLeft)}.
          </Note>
          <Button className="w-full" loading={busy === "run"} onClick={() => post("run", "run")}>
            Go ahead with {usd(pool.raised_cents)}
          </Button>
          <Button variant="secondary" className="w-full" loading={busy === "extend"} onClick={() => post("extend", "extend", { days: 30 })}>
            Extend 30 more days
          </Button>
          {cancelButton}
        </div>
      )}
      {pool.status === "choosing" && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-zinc-100">Pick how the money is used</h2>
          <Note tone="info">
            The group did not take it on. Choose another plan below, or everyone is refunded in {days(missedLeft)}.
          </Note>
          {!editing && (
            <Button className="w-full" onClick={() => setEditing(true)}>
              Choose a plan
            </Button>
          )}
          {cancelButton}
        </div>
      )}
      {pool.status === "handoff" && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-zinc-100">Waiting on {pool.handoff_group_name ?? "the group"}</h2>
          <Note tone="info">
            Their admin has until {pool.handoff_deadline ? new Date(pool.handoff_deadline).toLocaleDateString() : "the deadline"} to
            accept. If they decline or do not answer, you pick a new plan.
          </Note>
          {cancelButton}
        </div>
      )}
      {!planLocked && (
        <div>
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            aria-expanded={editing}
            className="min-h-11 text-sm font-bold text-zinc-200 underline touch-manipulation"
          >
            {editing ? "Close" : "Change how the money is used"}
          </button>
          {editing && (
            <div className="mt-2 space-y-3">
              {pool.status === "active" && <Note tone="info">You can change this until the first payout is made.</Note>}
              <PayoutOptions model={pool.model} goalCents={pool.goal_cents} value={choice} onChange={setChoice} />
              <Button className="w-full" loading={busy === "plan"} onClick={savePlan}>
                Save plan
              </Button>
            </div>
          )}
        </div>
      )}
      {error && <Note tone="warn">{error}</Note>}
    </Card>
  );
}
