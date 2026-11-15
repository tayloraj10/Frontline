"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Info, Store, TriangleAlert, X } from "lucide-react";
import { JOB_SIZES, jobSize } from "@/lib/jobSizes";
import { categoryColor, categoryIcon, prettyKey, useCategories, type JobCategory } from "@/lib/categories";

/** Icon plus label for a job's type. Pass compact to show the icon alone when space is tight. */
export function CategoryChip({ type, compact = false, className = "" }: { type: string; compact?: boolean; className?: string }) {
  const { get, label } = useCategories();
  const cat = get(type);
  const Icon = categoryIcon(cat?.icon);
  const text = label(type) || prettyKey(type);
  const color = categoryColor(cat?.color);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color.chip} ${className}`}
      title={text}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${color.icon}`} aria-hidden="true" />
      {compact ? <span className="sr-only">{text}</span> : text}
      {cat?.hazard_risk && <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-red-400" aria-label="Hazard risk" />}
    </span>
  );
}

/** A small highlighted tag for a category, like "Good for businesses". */
export function BusinessBadge({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200 ring-1 ring-inset ring-amber-400/30 ${className}`}>
      <Store className="h-3 w-3" aria-hidden="true" />
      {text}
    </span>
  );
}

/** A category description where text wrapped in {{double braces}} is highlighted in orange. */
export function CategoryDescription({ text }: { text: string }) {
  const parts = text.split(/\{\{(.+?)\}\}/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-semibold text-amber-400">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** Icon-only version for tight spots like the filter tiles. The text stays as the tooltip and screen reader label. */
export function BusinessIconBadge({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span
      title={text}
      role="img"
      aria-label={text}
      className={`flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-zinc-950 shadow ${className}`}
    >
      <Store className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}

/** A job's size as a small pill. The hover title carries the plain-language meaning. */
export function SizeBadge({ size, className = "" }: { size: string | null | undefined; className?: string }) {
  const z = jobSize(size);
  if (!z) return null;
  return (
    <span title={z.description} className={`inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-300 ${className}`}>
      {z.label}
    </span>
  );
}

/** Shown wherever a hazard-flagged category appears. Hazardous work is against Frontline policy. */
export function HazardNotice({ className = "" }: { className?: string }) {
  return (
    <div role="note" className={`flex items-start gap-2 rounded-xl bg-red-950/40 px-3 py-2 text-xs text-red-200 ring-1 ring-inset ring-red-500/30 ${className}`}>
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
      <p>
        <span className="font-semibold">Hazard risk.</span> This kind of work can cause injury, and Frontline does not allow hazardous jobs.
        Only continue if the site is safe, and never enter water, climb, or handle sharp or dangerous items.
      </p>
    </div>
  );
}

/** The description, rule note and requirements for one category. Shared by the info sheet and the post form. */
export function CategoryFacts({ cat, className = "" }: { cat: JobCategory; className?: string }) {
  return (
    <div className={className}>
      {cat.description && <p className="mt-2 text-sm text-zinc-300"><CategoryDescription text={cat.description} /></p>}
      {cat.rule_note && <p className="mt-2 text-sm text-amber-300/90">{cat.rule_note}</p>}
      {cat.hazard_risk && <HazardNotice className="mt-3" />}
      <ul className="mt-3 space-y-1 text-xs text-zinc-400">
        <li>{cat.bags_required ? "Bag your haul and show it in the finish photo." : "No bags needed."}</li>
        {!cat.after_photo_required && <li>A finish photo is optional.</li>}
        {cat.requires_permission && <li>The poster must own the land or have permission.</li>}
      </ul>
    </div>
  );
}

function CategorySheet({ cat, onClose }: { cat: JobCategory; onClose: () => void }) {
  const Icon = categoryIcon(cat.icon);
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={cat.label}
    >
      <div
        className="w-full rounded-t-3xl border border-zinc-700/60 bg-zinc-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-zinc-100">
            <Icon className="h-5 w-5 text-sky-400" aria-hidden="true" />
            {cat.label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <CategoryFacts cat={cat} />
      </div>
    </div>,
    document.body,
  );
}

function GuideSheet({ onClose }: { onClose: () => void }) {
  const { categories } = useCategories();
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Job types"
    >
      <div
        className="flex max-h-[85vh] w-full flex-col rounded-t-3xl border border-zinc-700/60 bg-zinc-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold text-zinc-100">What each job type covers</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <ul className="mt-2 space-y-3 overflow-y-auto pr-1">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            const color = categoryColor(c.color);
            return (
              <li key={c.key} className="text-sm">
                <p className="flex items-center gap-2 font-semibold text-zinc-100">
                  <Icon className={`h-4 w-4 ${color.icon}`} aria-hidden="true" />
                  {c.label}
                </p>
                {c.badge && <BusinessBadge text={c.badge} className="mt-1" />}
                {c.description && <p className="mt-0.5 text-zinc-400"><CategoryDescription text={c.description} /></p>}
                {c.rule_note && <p className="mt-0.5 text-amber-300/90">{c.rule_note}</p>}
              </li>
            );
          })}
          <li className="border-t border-zinc-800 pt-3 text-sm">
            <p className="font-semibold text-zinc-100">Job sizes</p>
            <dl className="mt-1 space-y-1.5">
              {JOB_SIZES.map((z) => (
                <div key={z.key}>
                  <dt className="font-medium text-zinc-200">{z.label}</dt>
                  <dd className="text-zinc-400">{z.description}</dd>
                </div>
              ))}
            </dl>
          </li>
        </ul>
      </div>
    </div>,
    document.body,
  );
}

/** One button that explains every job type at once, so nobody has to pick a type to learn what it means. */
export function CategoryGuideButton({ className = "", label = "What do the job types mean?" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-sky-300 touch-manipulation hover:text-sky-200 active:scale-95 ${className}`}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
      {open && <GuideSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** A tap-friendly "what does this mean" button for one category. Works on touch, unlike a hover tooltip. */
export function CategoryInfoButton({ type, className = "" }: { type: string; className?: string }) {
  const { get } = useCategories();
  const [open, setOpen] = useState(false);
  const cat = get(type);
  if (!cat || (!cat.description && !cat.rule_note)) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`What does ${cat.label} cover?`}
        className={`inline-flex h-11 w-9 items-center justify-center rounded-full text-zinc-400 touch-manipulation hover:text-zinc-100 active:scale-95 ${className}`}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && <CategorySheet cat={cat} onClose={() => setOpen(false)} />}
    </>
  );
}
