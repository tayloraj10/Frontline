"use client";

import { useEffect, useState } from "react";
import SponsoredMap from "./SponsoredMap";
import SponsoredSites from "./SponsoredSites";
import SponsorshipsHub, { type PanelId } from "./SponsorshipsHub";

type Tab = { id: PanelId; label: string; idle: string; active: string };

const TABS: Tab[] = [
  {
    id: "claim",
    label: "Claim sponsorship",
    idle: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30 hover:bg-emerald-500/25",
    active: "bg-emerald-400 text-emerald-950 ring-emerald-300",
  },
  {
    id: "fund",
    label: "Fund a cleanup",
    idle: "bg-sky-500/15 text-sky-300 ring-sky-400/30 hover:bg-sky-500/25",
    active: "bg-sky-400 text-sky-950 ring-sky-300",
  },
];

const ADMIN_TABS: Tab[] = [
  {
    id: "review",
    label: "Review payouts",
    idle: "bg-amber-500/15 text-amber-300 ring-amber-400/30 hover:bg-amber-500/25",
    active: "bg-amber-400 text-amber-950 ring-amber-300",
  },
  {
    id: "all",
    label: "View all sponsorships",
    idle: "bg-violet-500/15 text-violet-300 ring-violet-400/30 hover:bg-violet-500/25",
    active: "bg-violet-400 text-violet-950 ring-violet-300",
  },
];

/** Compact buttons that each open one section, so the page starts short instead of showing everything at once. */
export default function SponsorshipsPanels({
  businesses,
  currentUserId,
  isAdmin,
}: {
  businesses: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState<PanelId | null>(null);
  const tabs = isAdmin ? [...TABS, ...ADMIN_TABS] : TABS;

  // Returning from Stripe Checkout: keep the default view, just drop the return flag from the URL.
  const [funded, setFunded] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") !== "success") return;
    window.history.replaceState(null, "", window.location.pathname);
    const show = setTimeout(() => setFunded(true), 0);
    const hide = setTimeout(() => setFunded(false), 7000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  // The map is already on screen by default, so opening a section scrolls down to it.
  useEffect(() => {
    if (!open) return;
    const id = { claim: "sponsored-sites", fund: "fund-cleanups", review: "allocation-review", all: "all-sponsorships" }[open];
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <div>
      {funded && (
        <p
          role="status"
          className="mb-4 rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/30"
        >
          Thank you! Your sponsorship is received and will go live shortly.
        </p>
      )}
      <nav aria-label="What do you want to do?" className="mb-5">
        <h2 className="mb-2 font-display text-base font-extrabold tracking-tight text-zinc-100">What do you want to do?</h2>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const active = open === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-expanded={active}
                onClick={() => setOpen(active ? null : t.id)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold ring-1 ring-inset touch-manipulation transition-colors active:scale-[0.97] ${
                  active ? t.active : t.idle
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* The map is the default view; picking any other section hides it. */}
      {(open === null || open === "claim") && <SponsoredMap />}
      {open === "claim" && <SponsoredSites />}
      <SponsorshipsHub businesses={businesses} currentUserId={currentUserId} isAdmin={isAdmin} open={open} />
    </div>
  );
}
