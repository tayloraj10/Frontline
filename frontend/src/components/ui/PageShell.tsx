import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const WIDTH = {
  narrow: "max-w-2xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
} as const;

/** Standard page container: consistent gutters, bottom-nav clearance on mobile, wider columns on desktop. */
export function PageShell({ width = "default", className, children }: { width?: keyof typeof WIDTH; className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-10 pb-28 sm:pb-12", WIDTH[width], className)}>{children}</div>;
}

/** Page title block with optional eyebrow, subtitle and right-aligned action. */
export function PageHeader({ title, subtitle, eyebrow, action }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 lg:mb-8 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-400">{eyebrow}</p>}
        <h1 className="font-display text-3xl lg:text-4xl font-extrabold tracking-tight text-zinc-50 text-balance">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-prose text-sm lg:text-base text-zinc-400">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Titled content section. */
export function Section({ title, description, action, children, className }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mb-8", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-lg font-extrabold tracking-tight text-zinc-100">{title}</h2>}
          {action}
        </div>
      )}
      {description && <p className="-mt-2 mb-3 text-sm text-zinc-400">{description}</p>}
      {children}
    </section>
  );
}

/** Friendly empty state with an optional call to action. */
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-[20px] bg-zinc-900 px-6 py-10 text-center">
      <p className="font-display text-base font-extrabold text-zinc-100">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-400">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
