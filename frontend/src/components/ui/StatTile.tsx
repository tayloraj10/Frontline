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
    <Card elevation={2} padding="sm" className={cn("flex flex-col items-center gap-1 text-center", className)}>
      {icon && <span className="text-zinc-500">{icon}</span>}
      <span
        className={cn(
          "text-lg font-bold leading-tight",
          hero
            ? "bg-gradient-to-b from-emerald-300 to-emerald-500 bg-clip-text text-transparent text-2xl"
            : "text-zinc-100"
        )}
      >
        {value}
      </span>
      <span className="text-xs text-zinc-500">{label}</span>
    </Card>
  );
}
