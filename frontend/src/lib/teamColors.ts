export const TEAM_COLORS = [
  { value: "emerald", swatch: "bg-emerald-500", hex: "#10b981" },
  { value: "sky", swatch: "bg-sky-500", hex: "#0ea5e9" },
  { value: "amber", swatch: "bg-amber-500", hex: "#f59e0b" },
  { value: "violet", swatch: "bg-violet-500", hex: "#8b5cf6" },
  { value: "rose", swatch: "bg-rose-500", hex: "#f43f5e" },
  { value: "orange", swatch: "bg-orange-500", hex: "#f97316" },
  { value: "teal", swatch: "bg-teal-500", hex: "#14b8a6" },
  { value: "fuchsia", swatch: "bg-fuchsia-500", hex: "#d946ef" },
  { value: "lime", swatch: "bg-lime-500", hex: "#84cc16" },
  { value: "cyan", swatch: "bg-cyan-500", hex: "#06b6d4" },
  { value: "indigo", swatch: "bg-indigo-500", hex: "#6366f1" },
  { value: "pink", swatch: "bg-pink-500", hex: "#ec4899" },
  { value: "red", swatch: "bg-red-500", hex: "#ef4444" },
  { value: "blue", swatch: "bg-blue-500", hex: "#3b82f6" },
  { value: "yellow", swatch: "bg-yellow-500", hex: "#eab308" },
  { value: "purple", swatch: "bg-purple-500", hex: "#a855f7" },
];

const HEX_BY_NAME: Record<string, string> = Object.fromEntries(TEAM_COLORS.map((c) => [c.value, c.hex]));

/** Team colors are stored as Tailwind family names (e.g. "emerald"), not hex —
 * resolve to a real CSS color so inline styles actually render. Falls back to
 * the raw value in case it's ever a hex code already, then to a neutral gray. */
export function resolveTeamColor(name: string | null | undefined): string {
  if (!name) return "#3f3f46";
  return HEX_BY_NAME[name] ?? name;
}
