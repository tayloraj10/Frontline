"use client";

import Link from "next/link";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/PageShell";
import { JOB_TYPE_LABELS, STATUS_LABELS, TIME_MODE_LABELS, usd, whenLabel, type Job } from "@/lib/marketplace";

export default function JobsList({ asCustomer, asCleaner }: { asCustomer: Job[]; asCleaner: Job[] }) {
  const [role, setRole] = useState<"customer" | "cleaner">("customer");
  const jobs = role === "customer" ? asCustomer : asCleaner;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-zinc-900 p-1">
        {(
          [
            ["customer", `I hired (${asCustomer.length})`],
            ["cleaner", `I clean (${asCleaner.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={role === id}
            onClick={() => setRole(id)}
            className={`min-h-10 rounded-xl text-[13px] font-bold touch-manipulation transition-colors ${
              role === id ? "bg-zinc-700 text-zinc-50 shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body={role === "customer" ? "Post a job or book a cleaner to get started." : "Jobs you take show up here."}
        />
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => {
            const s = STATUS_LABELS[j.status] ?? { label: j.status, tone: "neutral" as const };
            return (
              <li key={j.id}>
                <Link href={`/marketplace/jobs/${j.id}`}>
                  <Card interactive className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-bold text-zinc-100">{j.title}</p>
                      <Badge variant={s.tone}>{s.label}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      <Badge>{JOB_TYPE_LABELS[j.job_type] ?? j.job_type}</Badge>
                      <span>{TIME_MODE_LABELS[j.time_mode]}</span>
                      <span>{whenLabel(j)}</span>
                      <span className="ml-auto font-bold text-emerald-300">{usd(j.price_cents)}</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {role === "customer" ? (j.cleaner_username ? `Cleaner: ${j.cleaner_username}` : j.origin === "board" ? "Waiting for a cleaner" : "Awaiting reply") : `Customer: ${j.customer_username ?? ""}`}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
