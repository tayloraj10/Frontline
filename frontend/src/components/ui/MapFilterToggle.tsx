"use client";

import type { MapView } from "@/app/earn/SponsoredMap";

/** Compact All / Sponsored / Jobs segmented control for the Earn and Fund maps. */
export default function MapFilterToggle({ value, onChange }: { value: MapView; onChange: (v: MapView) => void }) {
  return (
    <div role="group" aria-label="What to show on the map" className="grid shrink-0 grid-cols-3 gap-0.5 rounded-full bg-zinc-900 p-0.5 ring-1 ring-inset ring-zinc-800/60">
      {(
        [
          ["all", "All"],
          ["sites", "Sponsored"],
          ["jobs", "Jobs"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`min-h-8 rounded-full px-3 text-xs font-bold touch-manipulation transition-colors ${
            value === id ? "bg-sky-400/15 text-sky-200 ring-1 ring-inset ring-sky-400/30" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
