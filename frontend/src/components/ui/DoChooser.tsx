"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Color = "emerald" | "sky" | "amber" | "violet" | "rose";

export type DoChip = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** One short line under the label (shown when there is room, i.e. two-column layouts). */
  sub?: string;
  /** Navigates to its own page. */
  href?: string;
  /** Selects in place (changes the page and map filter). */
  onSelect?: () => void;
  color?: Color;
};

// Dark card with a colored icon tile; the selected card gets a colored ring and tint.
const STYLES: Record<Color, { tile: string; on: string; idle: string }> = {
  emerald: {
    tile: "bg-emerald-500/15 text-emerald-300",
    on: "ring-emerald-400 bg-emerald-500/10",
    idle: "ring-emerald-500/25 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08] hover:ring-emerald-500/40",
  },
  sky: {
    tile: "bg-sky-500/15 text-sky-300",
    on: "ring-sky-400 bg-sky-500/10",
    idle: "ring-sky-500/25 bg-sky-500/[0.04] hover:bg-sky-500/[0.08] hover:ring-sky-500/40",
  },
  amber: {
    tile: "bg-amber-500/15 text-amber-300",
    on: "ring-amber-400 bg-amber-500/10",
    idle: "ring-amber-500/25 bg-amber-500/[0.04] hover:bg-amber-500/[0.08] hover:ring-amber-500/40",
  },
  violet: {
    tile: "bg-violet-500/15 text-violet-300",
    on: "ring-violet-400 bg-violet-500/10",
    idle: "ring-violet-500/25 bg-violet-500/[0.04] hover:bg-violet-500/[0.08] hover:ring-violet-500/40",
  },
  rose: {
    tile: "bg-rose-500/15 text-rose-300",
    on: "ring-rose-400 bg-rose-500/10",
    idle: "ring-rose-500/25 bg-rose-500/[0.04] hover:bg-rose-500/[0.08] hover:ring-rose-500/40",
  },
};

/** "What do you want to do?" cards under the map: centered heading, two rows at most. Same look on Earn and Fund. */
export default function DoChooser({ chips, active, topCount }: { chips: DoChip[]; active?: string | null; topCount?: number }) {
  // Two rows. topCount puts that many cards in the first row (the main paths); otherwise the rows split evenly.
  const first = Math.min(chips.length, topCount ?? Math.ceil(chips.length / 2));
  const rows = [first, chips.length - first].filter((n) => n > 0);
  // Rows of different sizes share one grid whose column count fits both, so every row fills the full width.
  const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
  const total = rows.reduce((acc, n) => (acc * n) / gcd(acc, n), 1);
  const rowOf = (i: number) => (i < first ? first : chips.length - first);
  return (
    <div className="shrink-0">
      <p className="mb-2 text-center text-xs font-semibold tracking-wide text-zinc-400">What do you want to do?</p>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {chips.map((c, i) => {
          const s = STYLES[c.color ?? "sky"];
          const roomy = rowOf(i) <= 2;
          const span = total / rowOf(i);
          const on = active === c.id;
          const cls = `group flex min-w-0 items-center rounded-xl bg-zinc-900 text-zinc-100 ring-1 ring-inset touch-manipulation transition-[background-color,box-shadow,transform] active:scale-[0.98] ${
            roomy ? `min-h-14 gap-2 px-2 py-2 ${c.sub ? "text-left" : "justify-center text-center"}` : "min-h-14 flex-col justify-center gap-1 px-1.5 py-2 text-center"
          } ${on ? s.on : s.idle}`;
          const inner = (
            <>
              <span className={`flex shrink-0 items-center justify-center rounded-lg ${s.tile} ${roomy ? "h-8 w-8" : "h-7 w-7"}`}>
                <c.icon className={roomy ? "h-4 w-4" : "h-4 w-4"} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className={`block font-bold leading-tight ${roomy ? "text-xs" : "text-[11px]"}`}>{c.label}</span>
                {roomy && c.sub && <span className="mt-0.5 block text-[11px] leading-tight text-zinc-400">{c.sub}</span>}
              </span>
            </>
          );
          return c.href ? (
            <Link key={c.id} href={c.href} className={cls} style={{ gridColumn: `span ${span}` }}>
              {inner}
            </Link>
          ) : (
            <button key={c.id} type="button" aria-pressed={on} onClick={c.onSelect} className={cls} style={{ gridColumn: `span ${span}` }}>
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
