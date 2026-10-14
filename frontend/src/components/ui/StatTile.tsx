import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

interface StatTileProps {
  icon?: ReactNode;
  value: ReactNode;
  label: string;
  /** Gradient-text headline treatment for gamified numbers (rank, points). */
  hero?: boolean;
  className?: string;
}

/** Icon + value + label tile, built on `Card`. Used for campaign stat bars, profile stats, leaderboard headline numbers. */
export default function StatTile({ icon, value, label, hero = false, className = "" }: StatTileProps) {
  return (
    <Card elevation={1} padding="md" className={cn("flex flex-col items-center gap-1 text-center", className)}>
      {icon && <span className="text-zinc-500">{icon}</span>}
      <span
        className={cn(
          "font-display text-xl font-extrabold tracking-tight leading-tight tabular-nums",
          hero
            ? "text-emerald-400 text-2xl"
            : "text-zinc-100"
        )}
      >
        {value}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
    </Card>
  );
}
