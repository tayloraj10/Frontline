"use client";

import { useEffect, useState } from "react";
import {
  Fence, Footprints, Grid3x3, Sparkles, Sprout, Snowflake, Trash2, TreePine, Waves, Leaf, Droplets, Mountain, Hammer, Recycle,
  type LucideIcon,
} from "lucide-react";
import { mk } from "@/lib/marketplace";

export type JobCategory = {
  key: string;
  label: string;
  short_label: string;
  icon: string;
  color: string;
  badge?: string | null;
  description: string;
  rule_note: string;
  sort_order: number;
  active: boolean;
  bags_required: boolean;
  after_photo_required: boolean;
  requires_permission: boolean;
  hazard_risk: boolean;
};

/** Icons an admin can pick for a category. The key is what is stored in the database. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  trash: Trash2,
  fence: Fence,
  footprints: Footprints,
  grid: Grid3x3,
  tree: TreePine,
  sprout: Sprout,
  snowflake: Snowflake,
  waves: Waves,
  leaf: Leaf,
  droplets: Droplets,
  mountain: Mountain,
  hammer: Hammer,
  recycle: Recycle,
  sparkles: Sparkles,
};

/** Accent palettes an admin can pick. Full class strings so Tailwind keeps them. */
export const CATEGORY_COLORS: Record<string, { icon: string; chip: string; tile: string; tileOn: string }> = {
  emerald: { icon: "text-emerald-400", chip: "bg-emerald-500/15 text-emerald-200", tile: "bg-emerald-500/10 text-emerald-200 ring-emerald-500/20", tileOn: "bg-emerald-400/25 text-emerald-100 ring-emerald-400/60" },
  sky: { icon: "text-sky-400", chip: "bg-sky-500/15 text-sky-200", tile: "bg-sky-500/10 text-sky-200 ring-sky-500/20", tileOn: "bg-sky-400/25 text-sky-100 ring-sky-400/60" },
  lime: { icon: "text-lime-400", chip: "bg-lime-500/15 text-lime-200", tile: "bg-lime-500/10 text-lime-200 ring-lime-500/20", tileOn: "bg-lime-400/25 text-lime-100 ring-lime-400/60" },
  cyan: { icon: "text-cyan-400", chip: "bg-cyan-500/15 text-cyan-200", tile: "bg-cyan-500/10 text-cyan-200 ring-cyan-500/20", tileOn: "bg-cyan-400/25 text-cyan-100 ring-cyan-400/60" },
  teal: { icon: "text-teal-400", chip: "bg-teal-500/15 text-teal-200", tile: "bg-teal-500/10 text-teal-200 ring-teal-500/20", tileOn: "bg-teal-400/25 text-teal-100 ring-teal-400/60" },
  blue: { icon: "text-blue-400", chip: "bg-blue-500/15 text-blue-200", tile: "bg-blue-500/10 text-blue-200 ring-blue-500/20", tileOn: "bg-blue-400/25 text-blue-100 ring-blue-400/60" },
  violet: { icon: "text-violet-400", chip: "bg-violet-500/15 text-violet-200", tile: "bg-violet-500/10 text-violet-200 ring-violet-500/20", tileOn: "bg-violet-400/25 text-violet-100 ring-violet-400/60" },
  amber: { icon: "text-amber-400", chip: "bg-amber-500/15 text-amber-200", tile: "bg-amber-500/10 text-amber-200 ring-amber-500/20", tileOn: "bg-amber-400/25 text-amber-100 ring-amber-400/60" },
  orange: { icon: "text-orange-400", chip: "bg-orange-500/15 text-orange-200", tile: "bg-orange-500/10 text-orange-200 ring-orange-500/20", tileOn: "bg-orange-400/25 text-orange-100 ring-orange-400/60" },
  rose: { icon: "text-rose-400", chip: "bg-rose-500/15 text-rose-200", tile: "bg-rose-500/10 text-rose-200 ring-rose-500/20", tileOn: "bg-rose-400/25 text-rose-100 ring-rose-400/60" },
  slate: { icon: "text-slate-400", chip: "bg-slate-500/15 text-slate-200", tile: "bg-slate-500/10 text-slate-200 ring-slate-500/20", tileOn: "bg-slate-400/25 text-slate-100 ring-slate-400/60" },
  green: { icon: "text-green-400", chip: "bg-green-500/15 text-green-200", tile: "bg-green-500/10 text-green-200 ring-green-500/20", tileOn: "bg-green-400/25 text-green-100 ring-green-400/60" },
  yellow: { icon: "text-yellow-400", chip: "bg-yellow-500/15 text-yellow-200", tile: "bg-yellow-500/10 text-yellow-200 ring-yellow-500/20", tileOn: "bg-yellow-400/25 text-yellow-100 ring-yellow-400/60" },
  indigo: { icon: "text-indigo-400", chip: "bg-indigo-500/15 text-indigo-200", tile: "bg-indigo-500/10 text-indigo-200 ring-indigo-500/20", tileOn: "bg-indigo-400/25 text-indigo-100 ring-indigo-400/60" },
  fuchsia: { icon: "text-fuchsia-400", chip: "bg-fuchsia-500/15 text-fuchsia-200", tile: "bg-fuchsia-500/10 text-fuchsia-200 ring-fuchsia-500/20", tileOn: "bg-fuchsia-400/25 text-fuchsia-100 ring-fuchsia-400/60" },
};

/** Hex for hand-built DOM (map pins and popups) that cannot use Tailwind classes. Matches the 400 shades above. */
const CATEGORY_HEX: Record<string, string> = {
  emerald: "#34d399", sky: "#38bdf8", lime: "#a3e635", cyan: "#22d3ee", teal: "#2dd4bf", blue: "#60a5fa", violet: "#a78bfa",
  amber: "#fbbf24", orange: "#fb923c", rose: "#fb7185", slate: "#94a3b8", green: "#4ade80", yellow: "#facc15",
  indigo: "#818cf8", fuchsia: "#e879f8",
};
export function categoryHex(name: string | undefined) {
  return CATEGORY_HEX[name ?? ""] ?? CATEGORY_HEX.emerald;
}

export function categoryColor(name: string | undefined) {
  return CATEGORY_COLORS[name ?? ""] ?? CATEGORY_COLORS.emerald;
}

export function categoryIcon(name: string | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Sparkles;
}

let cache: JobCategory[] | null = null;
let inflight: Promise<JobCategory[]> | null = null;
const listeners = new Set<(c: JobCategory[]) => void>();

function load(force = false): Promise<JobCategory[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight || force) {
    inflight = mk<JobCategory[]>("/categories")
      .then((c) => {
        cache = c;
        listeners.forEach((l) => l(c));
        return c;
      })
      .catch(() => cache ?? [])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Reload after an admin edit so every screen picks up the change. */
export function refreshCategories() {
  return load(true);
}

/** Synchronous read for code that builds DOM by hand (map popups). Empty until the first load finishes. */
export function cachedCategories(): JobCategory[] {
  if (!cache) void load();
  return cache ?? [];
}

export function prettyKey(key: string): string {
  const t = key.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function findCategory(list: JobCategory[], key: string): JobCategory | undefined {
  return list.find((c) => c.key === key);
}

export function categoryLabel(list: JobCategory[], key: string): string {
  return findCategory(list, key)?.label ?? prettyKey(key);
}

/** Active categories in display order, plus helpers keyed by job type. */
export function useCategories() {
  const [list, setList] = useState<JobCategory[]>(cache ?? []);
  useEffect(() => {
    listeners.add(setList);
    void load().then(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return {
    categories: list,
    get: (key: string) => findCategory(list, key),
    label: (key: string) => categoryLabel(list, key),
    /** Bags step applies unless the category says otherwise (unknown types keep the safe default). */
    needsBags: (key: string) => findCategory(list, key)?.bags_required ?? true,
    needsPermission: (key: string) => findCategory(list, key)?.requires_permission ?? false,
  };
}
