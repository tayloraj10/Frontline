import { PageShell } from "@/components/ui/PageShell";
import { cn } from "@/lib/cn";

const bar = "rounded-md bg-zinc-800";

/** Title block placeholder matching PageHeader. */
function HeaderSkeleton({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="mb-6 lg:mb-8" aria-hidden="true">
      <div className={cn(bar, "h-8 w-44 lg:h-10 lg:w-56")} />
      {subtitle && <div className={cn(bar, "mt-3 h-4 w-72 max-w-full bg-zinc-800/60")} />}
    </div>
  );
}

/** One card row: avatar, two text lines. Matches the bg-zinc-900 rounded-[20px] card look. */
function CardRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-zinc-900 p-4 ring-1 ring-inset ring-white/5">
      <div className="h-12 w-12 shrink-0 rounded-full bg-zinc-800" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className={cn(bar, "h-4 w-2/3")} />
        <div className={cn(bar, "h-3 w-1/2 bg-zinc-800/60")} />
      </div>
    </div>
  );
}

/** Content-only skeleton for pages that already sit inside a shell (e.g. /fund). */
export function ListSkeletonBody({ rows = 6, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div className="animate-pulse" role="status" aria-label="Loading">
      {header && <HeaderSkeleton />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: rows }).map((_, i) => (
          <CardRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** List-of-cards page (groups, partners, team events, leaderboard). */
export function ListPageSkeleton({ width = "wide", rows = 6 }: { width?: "narrow" | "default" | "wide"; rows?: number }) {
  return (
    <PageShell width={width}>
      <ListSkeletonBody rows={rows} />
    </PageShell>
  );
}

/** Detail page: hero block, stat tiles, then a few content cards. */
export function DetailPageSkeleton({ width = "default" }: { width?: "narrow" | "default" | "wide" }) {
  return (
    <PageShell width={width}>
      <div className="animate-pulse" role="status" aria-label="Loading">
        <div className="mb-6 flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full bg-zinc-800" />
          <div className="flex-1 space-y-2">
            <div className={cn(bar, "h-7 w-1/2")} />
            <div className={cn(bar, "h-4 w-1/3 bg-zinc-800/60")} />
          </div>
        </div>
        <div className="mb-6 grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-[20px] bg-zinc-900 ring-1 ring-inset ring-white/5" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
