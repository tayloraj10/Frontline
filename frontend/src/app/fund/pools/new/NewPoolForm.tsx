"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { ChoiceChips, Field, Note, TextArea, TextInput } from "@/components/ui/fields";
import SitePlacePicker, { EMPTY_SITE, sitePlaceProblem, type SitePlace } from "@/app/earn/SitePlacePicker";
import { usd } from "@/lib/sponsorshipPools";

type Rule = "flat_per_cleanup" | "per_bag";

const STEPS = ["Basics", "Where", "Money"] as const;

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return typeof data?.detail === "string" ? data.detail : fallback;
}

/** Mobile-first form that creates a pooled sponsorship, then lands on its share page. */
export default function NewPoolForm({ minCents = 1500 }: { minCents?: number }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [site, setSite] = useState<SitePlace>(EMPTY_SITE);
  const [goal, setGoal] = useState("100");
  const [rule, setRule] = useState<Rule>("flat_per_cleanup");
  const [unit, setUnit] = useState("20");
  const [maxBags, setMaxBags] = useState("10");
  const [days, setDays] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

  const goalCents = Math.round(parseFloat(goal || "0") * 100);
  const unitCents = Math.round(parseFloat(unit || "0") * 100);

  const next = () => {
    const problem =
      step === 0 ? (title.trim().length < 3 ? "Give the pool a title." : null) : step === 1 ? sitePlaceProblem(site) : null;
    if (problem) return setError(problem);
    setError(null);
    setStep(step + 1);
  };

  const submit = async () => {
    const problem = sitePlaceProblem(site);
    if (title.trim().length < 3) return setError("Give the pool a title.");
    if (problem) return setError(problem);
    if (goalCents < minCents) return setError(`The goal must be at least $${(minCents / 100).toLocaleString()}.`);
    if (unitCents <= 0) return setError("Enter a payout amount.");
    if (rule === "flat_per_cleanup" && unitCents > goalCents) return setError("A single payout cannot be more than the goal.");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sponsorship-pools", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim() || null,
          goal_cents: goalCents,
          payout_rule:
            rule === "per_bag"
              ? { type: "per_bag", cents_per_bag: unitCents, max_bags: Math.max(1, parseInt(maxBags || "10", 10)) }
              : { type: "flat_per_cleanup", amount_cents: unitCents },
          site_label: site.label.trim(),
          site_latitude: site.point![1],
          site_longitude: site.point![0],
          site_radius_meters: site.radius,
          days: parseInt(days, 10),
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not start the pool."));
      const pool = await res.json();
      router.push(`/fund/pools/${pool.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the pool.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-zinc-900 p-3 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-800">
        Pools are community crowdfunding for bigger projects. Tip: sponsor a regular site or area first, so some money is already
        pledged and neighbors can add to it. Start a pool when the project needs more than one person can give.
      </div>
      <div className="space-y-2">
        <div className="flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-emerald-400" : "bg-zinc-800"}`} />
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
      </div>
      {step === 0 && (
        <div className="space-y-5">
      <Field label="Pool title" hint="What neighbors will see on the share link.">
        <TextInput maxLength={80} placeholder="Clean up Maple Street lot" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Why it matters (optional)">
        <TextArea rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
        </div>
      )}
      {step === 1 && <SitePlacePicker value={site} onChange={setSite} />}
      {step === 2 && (
        <div className="space-y-5">
      <Field label="Goal in dollars" hint="The pool only turns into a real sponsorship when it reaches this amount.">
        <TextInput inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value.replace(/[^0-9.]/g, ""))} />
      </Field>
      <Field label="How cleaners get paid">
        <ChoiceChips<Rule>
          value={rule}
          onChange={setRule}
          options={[
            { value: "flat_per_cleanup", label: "Flat per cleanup" },
            { value: "per_bag", label: "Per bag" },
          ]}
        />
      </Field>
      <Field label={rule === "per_bag" ? "Dollars per bag" : "Dollars per cleanup"}>
        <TextInput inputMode="decimal" value={unit} onChange={(e) => setUnit(e.target.value.replace(/[^0-9.]/g, ""))} />
      </Field>
      {rule === "per_bag" && (
        <Field label="Most bags paid per cleanup">
          <TextInput inputMode="numeric" value={maxBags} onChange={(e) => setMaxBags(e.target.value.replace(/\D/g, ""))} />
        </Field>
      )}
      <Field label="Raise it within" hint="If the goal is not met by then, everyone is refunded.">
        <ChoiceChips
          value={days}
          onChange={setDays}
          options={[
            { value: "14", label: "2 weeks" },
            { value: "30", label: "30 days" },
            { value: "60", label: "60 days" },
          ]}
        />
      </Field>
      {goalCents >= minCents && unitCents > 0 && (
        <Note tone="info">
          A {usd(goalCents)} pool covers about {Math.floor(goalCents / unitCents)} {rule === "per_bag" ? "bags" : "cleanups"}.
        </Note>
      )}
        </div>
      )}
      {error && <Note tone="warn">{error}</Note>}
      <div className="flex gap-2">
        {step > 0 && (
          <Button variant="secondary" onClick={() => { setError(null); setStep(step - 1); }}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button className="flex-1" onClick={next}>
            Next
          </Button>
        ) : (
          <Button className="flex-1" loading={loading} onClick={submit}>
            Start the pool
          </Button>
        )}
      </div>
    </div>
  );
}
