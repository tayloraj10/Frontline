"use client";

import { useEffect, useState } from "react";
import LocalTime from "./LocalTime";

function remainingLabel(ms: number) {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h && m ? `${h} hr ${m} min` : h ? `${h} hr` : `${m} min`;
}

/** True while the wait (game setting retake_wait_hours) after giving up a job or site is still running. */
export function isFrozen(until?: string | null) {
  return !!until && new Date(until).getTime() > Date.now();
}

/** Shown before the take or claim button when the viewer gave this job or site up recently. */
export default function RetakeNotice({ until, what, done }: { until: string; what: "job" | "site"; done?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const left = new Date(until).getTime() - now;
  if (left <= 0) return null;
  return (
    <div role="status" className="rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-100 ring-1 ring-inset ring-amber-400/30">
      <p className="font-bold text-amber-200">{done ? `You already cleaned this ${what} recently` : `You gave this ${what} up recently`}</p>
      <p className="mt-1">
        You can {what === "job" ? "take" : "claim"} it again in {remainingLabel(left)} (<LocalTime iso={until} />), or pick another {what}.
      </p>
    </div>
  );
}
