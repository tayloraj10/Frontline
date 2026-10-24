"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import CleanerRow from "@/components/marketplace/CleanerRow";
import { EmptyState } from "@/components/ui/PageShell";
import { JOB_TYPE_LABELS, type CleanerCard } from "@/lib/marketplace";

/** Browse cleaners, per the mocks: search plus filter chips over the full list. */
export default function BrowseCleaners({ cleaners }: { cleaners: CleanerCard[] }) {
  const [query, setQuery] = useState("");
  const [top, setTop] = useState(true);
  const [under30, setUnder30] = useState(false);
  const [service, setService] = useState("");
  const q = query.trim().toLowerCase();

  const list = cleaners
    .filter(
      (c) =>
        (!q || `${c.username ?? ""} ${c.headline ?? ""} ${c.area_label ?? ""}`.toLowerCase().includes(q)) &&
        (!service || c.services.includes(service)) &&
        (!under30 || (c.rate_cents != null && c.rate_cents <= 3000))
    )
    .sort((a, b) => (top ? (b.rating_avg ?? 0) - (a.rating_avg ?? 0) || b.jobs_completed - a.jobs_completed : 0));

  return (
    <div className="space-y-3">
      <label className="flex min-h-12 items-center gap-2 rounded-2xl bg-zinc-900 px-4 ring-1 ring-inset ring-zinc-800 focus-within:ring-emerald-400/50">
        <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cleaners, areas or services"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
      </label>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip active={top} onClick={() => setTop(!top)}>
          Top rated
        </Chip>
        <Chip active={under30} onClick={() => setUnder30(!under30)}>
          Under $30
        </Chip>
        {Object.entries(JOB_TYPE_LABELS).map(([id, label]) => (
          <Chip key={id} active={service === id} onClick={() => setService(service === id ? "" : id)}>
            {label}
          </Chip>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState
          title={cleaners.length === 0 ? "No cleaners in your area yet" : "No cleaners match"}
          body={cleaners.length === 0 ? "Post a job and cleaners will come to you." : "Try clearing a filter."}
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <li key={c.user_id}>
              <CleanerRow c={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold ring-1 ring-inset touch-manipulation transition-colors active:scale-[0.97] ${
        active ? "bg-emerald-400 text-emerald-950 ring-emerald-300" : "bg-zinc-900 text-zinc-400 ring-zinc-800 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
