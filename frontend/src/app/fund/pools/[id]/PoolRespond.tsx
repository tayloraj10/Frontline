"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Note } from "@/components/ui/fields";
import { Card } from "@/components/ui/Card";
import { describeRule, daysLeft, type SponsorshipPool } from "@/lib/sponsorshipPools";

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return typeof data?.detail === "string" ? data.detail : fallback;
}

const CHOICE_TITLE: Record<string, string> = {
  flat: "Pay cleaners for each cleanup",
  bag: "Pay cleaners per bag",
  split: "Split among whoever shows up",
};

/** Group admin accept or decline, and the contributor vote. Shown only when the viewer can act. */
export default function PoolRespond({ pool }: { pool: SponsorshipPool }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/sponsorship-pools/${pool.id}`;

  const send = async (key: string, path: string, body: unknown) => {
    setBusy(key);
    setError(null);
    const res = await fetch(`${base}/${path}`, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) {
      setError(await readError(res, "Something went wrong."));
      setBusy(null);
      return;
    }
    setBusy(null);
    router.refresh();
  };

  if (pool.can_respond_handoff) {
    const left = pool.handoff_deadline ? daysLeft(pool.handoff_deadline) : 7;
    return (
      <Card className="mb-4 space-y-3 p-4">
        <h2 className="text-base font-bold text-zinc-100">This funded area was offered to your group</h2>
        <p className="text-sm text-zinc-300">
          {pool.creator_name} raised the money and wants {pool.handoff_group_name ?? "your group"} to run the cleanups.
          {pool.handoff_note ? ` Their note: ${pool.handoff_note}` : ""}
          {pool.handoff_date ? ` Preferred date: ${new Date(pool.handoff_date + "T00:00:00").toLocaleDateString()}.` : ""}
        </p>
        <Note tone="info">
          Accepting lets only your group host events here, paid through your group payout account. You have {left}{" "}
          {left === 1 ? "day" : "days"} to answer.
        </Note>
        <Button className="w-full" loading={busy === "accept"} onClick={() => send("accept", "handoff", { accept: true })}>
          Accept for our group
        </Button>
        <Button variant="secondary" className="w-full" loading={busy === "decline"} onClick={() => send("decline", "handoff", { accept: false })}>
          Decline
        </Button>
        {error && <Note tone="warn">{error}</Note>}
      </Card>
    );
  }

  if (pool.plan_kind === "vote" && pool.vote_options && (pool.status === "voting" || pool.status === "active")) {
    const total = pool.vote_options.reduce((n, o) => n + o.votes, 0);
    const left = pool.vote_deadline ? daysLeft(pool.vote_deadline) : 0;
    const open = pool.status === "voting";
    return (
      <Card className="mb-4 space-y-3 p-4">
        <h2 className="text-base font-bold text-zinc-100">{open ? "How should the money be used?" : "Contributors voted"}</h2>
        {open && (
          <p className="text-xs text-zinc-400">
            Only people who chipped in can vote, one vote each. Voting closes in {left} {left === 1 ? "day" : "days"}. If nobody
            votes, everyone is refunded.
          </p>
        )}
        <ul className="space-y-2">
          {pool.vote_options.map((o) => {
            const pct = total ? Math.round((o.votes / total) * 100) : 0;
            const mine = pool.my_vote === o.choice;
            return (
              <li key={o.choice} className={`rounded-xl p-3 ${mine ? "bg-emerald-400/10 ring-1 ring-emerald-400" : "bg-zinc-900"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-zinc-100">{CHOICE_TITLE[o.choice] ?? o.choice}</span>
                  <span className="text-xs text-zinc-400">
                    {o.votes} {o.votes === 1 ? "vote" : "votes"} · {pct}%
                  </span>
                </div>
                <p className="text-xs text-zinc-400">{describeRule(o.rule)}</p>
                {pool.can_vote && (
                  <Button
                    variant={mine ? "secondary" : "primary"}
                    className="mt-2 w-full"
                    loading={busy === o.choice}
                    disabled={mine}
                    onClick={() => send(o.choice, "vote", { choice: o.choice })}
                  >
                    {mine ? "Your vote" : pool.my_vote ? "Change my vote" : "Vote for this"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {open && !pool.can_vote && <Note tone="info">Chip in to the pool to get a vote.</Note>}
        {error && <Note tone="warn">{error}</Note>}
      </Card>
    );
  }
  return null;
}
