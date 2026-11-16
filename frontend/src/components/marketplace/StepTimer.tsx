"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import LocalTime from "./LocalTime";

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/**
 * Live countdown for the step the earner is on, on two lines (time, then what it is for).
 * For a job that has not reached its start time yet, it counts down to the start and says when to be there by.
 */
export default function StepTimer({ deadline, label, startsAt }: { deadline: string; label: string; startsAt?: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const toStart = startsAt ? new Date(startsAt).getTime() - now : 0;
  const waiting = toStart > 0;
  const left = new Date(deadline).getTime() - now;
  const urgent = !waiting && left < 5 * 60000;
  const tone = urgent ? "bg-red-500/15 text-red-300 ring-red-400/50" : waiting ? "bg-sky-400/10 text-sky-200 ring-sky-400/40" : "bg-emerald-400/15 text-emerald-300 ring-emerald-400/50";
  return (
    <div role="timer" className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 ring-1 ring-inset ${tone}`}>
      <Timer className="h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="leading-tight">
        <p className="text-base font-extrabold tabular-nums">{left <= 0 ? "Time is up" : fmt(waiting ? toStart : left)}</p>
        <p className="text-[11px] font-semibold opacity-90">
          {left <= 0 ? "This step has expired" : waiting ? <>until it starts, be there by <LocalTime iso={deadline} /></> : label}
        </p>
      </div>
    </div>
  );
}
