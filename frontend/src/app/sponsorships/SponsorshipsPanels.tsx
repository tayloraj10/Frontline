"use client";

import { useEffect, useState } from "react";
import SponsoredMap from "./SponsoredMap";
import SponsoredSites from "./SponsoredSites";
import SponsorshipsHub, { type PanelId } from "./SponsorshipsHub";

type MainTab = "earn" | "fund" | "admin";

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: "earn", label: "Claim" },
  { id: "fund", label: "Fund one" },
];

const ADMIN_PANELS: { id: PanelId; label: string }[] = [
  { id: "review", label: "Review payouts" },
  { id: "all", label: "All sponsorships" },
];

const TAB_HELP: Record<MainTab, string> = {
  earn: "Funded cleanups near you, with your claims pinned on top. Clean, add before and after photos, and get paid once they are approved.",
  fund: "Put money behind a cleanup. It is only paid out after the work is verified.",
  admin: "Admin tools for reviewing payouts and managing sponsorships.",
};

/** Earn and Fund tabs (plus an Admin tab for site admins) so the page starts with one job at a time. */
export default function SponsorshipsPanels({
  businesses,
  currentUserId,
  isAdmin,
}: {
  businesses: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<MainTab>("earn");
  const [adminPanel, setAdminPanel] = useState<PanelId>("review");
  const tabs = isAdmin ? [...MAIN_TABS, { id: "admin" as const, label: "Admin" }] : MAIN_TABS;
  const open: PanelId = tab === "earn" ? "claim" : tab === "fund" ? "fund" : adminPanel;

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
      <nav aria-label="What do you want to do?" className="mb-3">
        <div className={`grid gap-1 rounded-2xl bg-zinc-900 p-1 ring-1 ring-inset ring-zinc-800/60 ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(t.id)}
                className={`min-h-10 rounded-xl px-2 text-[13px] font-bold touch-manipulation transition-colors ${
                  active
                    ? t.id === "admin"
                      ? "bg-violet-400 text-violet-950"
                      : "bg-emerald-400/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/30"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
      <p className="mb-4 text-sm text-zinc-400">{TAB_HELP[tab]}</p>

      {tab === "admin" && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {ADMIN_PANELS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={adminPanel === a.id}
              onClick={() => setAdminPanel(a.id)}
              className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-[13px] font-semibold ring-1 ring-inset touch-manipulation transition-colors active:scale-[0.97] ${
                adminPanel === a.id
                  ? "bg-violet-400 text-violet-950 ring-violet-300"
                  : "bg-violet-500/15 text-violet-300 ring-violet-400/30 hover:bg-violet-500/25"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {tab === "earn" && <SponsoredMap />}
      {tab === "earn" && <SponsoredSites />}
      <SponsorshipsHub businesses={businesses} currentUserId={currentUserId} isAdmin={isAdmin} open={open} />
    </div>
  );
}
