"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/lib/useProgressRouter";
import Button from "@/components/ui/Button";
import { ChoiceChips, Field, Note, TextArea, TextInput } from "@/components/ui/fields";
import SitePlacePicker, { EMPTY_SITE, sitePlaceProblem, type SitePlace } from "@/app/earn/SitePlacePicker";
import AreaBuilder, { EMPTY_AREA, areaProblem, areaToPayload, type AreaDraft } from "@/app/earn/AreaBuilder";
import { useLimits } from "@/lib/useLimits";
import { scrollToTop } from "@/lib/scrollToTop";
import PayoutOptions, { choiceProblem, choiceToPayload, suggestChoice, type PlanChoice } from "../PayoutOptions";

const STEPS = ["Basics", "Where", "Money"] as const;

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return typeof data?.detail === "string" ? data.detail : fallback;
}

/** Mobile-first form that creates a pool, then lands on its page. */
export default function NewPoolForm({ minCents = 1500 }: { minCents?: number }) {
  const router = useRouter();
  const lim = useLimits();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [model, setModel] = useState<"site" | "group_area">("site");
  const [site, setSite] = useState<SitePlace>(EMPTY_SITE);
  const [area, setArea] = useState<AreaDraft>(EMPTY_AREA);
  const [goal, setGoal] = useState("1000");
  const [choice, setChoice] = useState<PlanChoice>(() => suggestChoice(100000));
  const [days, setDays] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollToTop(rootRef.current);
  }, [step]);

  const goalCents = Math.round(parseFloat(goal || "0") * 100);

  const changeGoal = (v: string) => {
    setGoal(v);
    const cents = Math.round(parseFloat(v || "0") * 100);
    // Keep the suggested rates in step with the goal until the person picks their own numbers.
    if (cents > 0) setChoice((c) => ({ ...suggestChoice(cents, c.option), option: c.option }));
  };

  const changeModel = (m: "site" | "group_area") => {
    setModel(m);
    setChoice((c) => {
      if (m === "site" && c.option === "group") return suggestChoice(goalCents, "flat");
      if (m === "group_area" && c.option === "bag") return suggestChoice(goalCents, "flat");
      return c;
    });
  };

  const placeProblem = () => (model === "site" ? sitePlaceProblem(site) : areaProblem(area, lim));

  const next = () => {
    const problem = step === 0 ? (title.trim().length < 3 ? "Give the pool a title." : null) : step === 1 ? placeProblem() : null;
    if (problem) return setError(problem);
    setError(null);
    setStep(step + 1);
  };

  const submit = async () => {
    if (title.trim().length < 3) return setError("Give the pool a title.");
    const place = placeProblem();
    if (place) return setError(place);
    if (goalCents < minCents) return setError(`The goal must be at least $${(minCents / 100).toLocaleString()}.`);
    const planProblem = choiceProblem(choice, goalCents);
    if (planProblem) return setError(planProblem);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sponsorship-pools", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim() || null,
          goal_cents: goalCents,
          model,
          ...choiceToPayload(choice),
          ...(model === "site"
            ? {
                site_label: site.label.trim(),
                site_latitude: site.point![1],
                site_longitude: site.point![0],
                site_radius_meters: site.radius,
              }
            : { area: areaToPayload(area), area_name: area.name.trim() || null }),
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
    <div ref={rootRef} className="space-y-5">
      <div className="rounded-2xl bg-zinc-900 p-3 text-sm text-zinc-300 ring-1 ring-inset ring-zinc-800">
        A pool is community crowdfunding for a bigger project, like a very rough area that one person cannot afford to fund alone.
        Money is held until the goal is met, and refunded if it is not.
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
      {step === 1 && (
        <div className="space-y-5">
          <Field label="What is the pool for?">
            <ChoiceChips<"site" | "group_area">
              value={model}
              onChange={changeModel}
              options={[
                { value: "site", label: "One spot" },
                { value: "group_area", label: "A whole area" },
              ]}
            />
          </Field>
          {model === "site" ? <SitePlacePicker value={site} onChange={setSite} /> : <AreaBuilder value={area} onChange={setArea} />}
        </div>
      )}
      {step === 2 && (
        <div className="space-y-5">
          <Field label="Overall goal in dollars" hint="The pool goes live when it reaches this amount.">
            <TextInput inputMode="decimal" value={goal} onChange={(e) => changeGoal(e.target.value.replace(/[^0-9.]/g, ""))} />
          </Field>
          <Field label="Once the goal is reached, the money will..." hint="Pick one. You can adjust the details.">
            <PayoutOptions model={model} goalCents={goalCents} value={choice} onChange={setChoice} />
          </Field>
          <Field label="Raise it within" hint="If the goal is not met, you choose whether to go ahead with what was raised, extend it, or refund everyone.">
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
        </div>
      )}
      {error && <Note tone="warn">{error}</Note>}
      <div className="flex gap-2">
        {step > 0 && (
          <Button
            variant="secondary"
            onClick={() => {
              setError(null);
              setStep(step - 1);
            }}
          >
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
