"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import IconButton from "@/components/ui/IconButton";

interface Snapshot {
  days: number;
  has_pending_review_items: boolean;
  signups: {
    count: number;
    items: { username: string; display_name: string | null; email: string }[];
  };
  groups: {
    count: number;
    items: { name: string; slug: string; status: string; created_by: string | null }[];
    pending_count: number;
    pending_items: { name: string; slug: string; status: string; created_by: string | null }[];
  };
  events: {
    created_count: number;
    completed_count: number;
    small_bags: number;
    large_bags: number;
    pounds: number;
    items: { title: string; status: string; group_name: string | null; group_slug: string | null; organizers: string[] }[];
  };
  contributions: {
    count: number;
    total_points: number;
    items: { username: string | null; group_name: string | null; value: number }[];
  };
  partners: {
    count: number;
    items: { name: string; slug: string; status: string; created_by: string | null }[];
    pending_count: number;
    pending_items: { name: string; slug: string; status: string; created_by: string | null }[];
  };
  offers: {
    count: number;
    items: { title: string; status: string; business_name: string; business_slug: string }[];
  };
  redemptions: {
    count: number;
    total_points: number;
    items: { username: string | null; offer_title: string; business_name: string; points_spent: number }[];
  };
}

export default function ActivitySnapshotModal({ hasPendingReviewItems }: { hasPendingReviewItems: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/activity-snapshot?days=7");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setSnapshot(data);
    } catch {
      setError("Couldn't load the activity snapshot.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="relative">
        <IconButton
          size="sm"
          onClick={handleOpen}
          className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:text-zinc-100 active:bg-zinc-800 active:scale-[0.92] transition-[background-color,color,transform] duration-150"
          aria-label="Site activity snapshot"
          title={hasPendingReviewItems ? "Site activity snapshot: groups or partners awaiting review" : "Site activity snapshot"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </IconButton>
        {hasPendingReviewItems && (
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_2px_rgba(251,191,36,0.6)] animate-pulse pointer-events-none"
            aria-hidden="true"
          />
        )}
      </div>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 pt-[max(1rem,calc(var(--top-header-h)+1.25rem))] pb-[max(1rem,calc(var(--bottom-nav-h)+1.25rem))] bg-black/70 backdrop-blur-sm overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md modal-max-h-85 flex flex-col bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-5 pb-3 shrink-0 border-b border-zinc-800/60">
              <h2 className="text-lg font-black text-zinc-100 tracking-tight">Last 7 days</h2>
              <p className="text-zinc-500 text-xs mt-0.5">Site-wide activity snapshot</p>
            </div>

            <div className="px-6 py-4 overflow-y-auto min-h-0 flex-1">
              {loading && <p className="text-zinc-500 text-sm">Loading...</p>}
              {error && <p className="text-red-400 text-sm">{error}</p>}
              {snapshot && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                      Signups ({snapshot.signups.count})
                    </p>
                    {snapshot.signups.count === 0 ? (
                      <p className="text-sm text-zinc-500">None</p>
                    ) : (
                      <ul className="space-y-1">
                        {snapshot.signups.items.map((s) => (
                          <li key={s.email} className="text-sm text-zinc-300 flex items-center justify-between gap-2">
                            <span className="truncate">{s.display_name ?? s.username}</span>
                            <span className="text-xs text-zinc-500 shrink-0 truncate">{s.email}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {snapshot.groups.pending_count > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">
                        Pending review ({snapshot.groups.pending_count})
                      </p>
                      <ul className="space-y-1">
                        {snapshot.groups.pending_items.map((g) => (
                          <li key={g.slug} className="text-sm text-zinc-300 flex items-center justify-between gap-2">
                            <span className="truncate">{g.name}</span>
                            <span className="text-xs text-zinc-500 shrink-0">{g.created_by ?? "unknown"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                      New groups ({snapshot.groups.count})
                    </p>
                    {snapshot.groups.count === 0 ? (
                      <p className="text-sm text-zinc-500">None</p>
                    ) : (
                      <ul className="space-y-1">
                        {snapshot.groups.items.map((g) => (
                          <li key={g.slug} className="text-sm text-zinc-300 flex items-center justify-between gap-2">
                            <span className="truncate">{g.name}</span>
                            <span className="text-xs text-zinc-500 shrink-0 truncate">
                              {g.created_by ?? "unknown"} · {g.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                      Events ({snapshot.events.created_count})
                    </p>
                    <p className="text-sm text-zinc-300">
                      {snapshot.events.created_count} created, {snapshot.events.completed_count} completed
                    </p>
                    <p className="text-sm text-zinc-300">
                      {snapshot.events.small_bags} small bags, {snapshot.events.large_bags} large bags, {snapshot.events.pounds} lbs
                    </p>
                    {snapshot.events.items.length > 0 && (
                      <ul className="space-y-1 mt-1">
                        {snapshot.events.items.map((e, i) => (
                          <li key={i} className="text-sm text-zinc-300 flex items-center justify-between gap-2">
                            <span className="truncate">{e.title}</span>
                            <span className="text-xs text-zinc-500 shrink-0 truncate">
                              {e.group_name ?? "unknown"} · {e.organizers.join(", ") || "no organizer"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                      Contributions ({snapshot.contributions.count})
                    </p>
                    <p className="text-sm text-zinc-300">
                      {snapshot.contributions.count} logged, {snapshot.contributions.total_points} points
                    </p>
                    {snapshot.contributions.items.length > 0 && (
                      <ul className="space-y-1 mt-1">
                        {snapshot.contributions.items.map((c, i) => (
                          <li key={i} className="text-sm text-zinc-300 flex items-center justify-between gap-2">
                            <span className="truncate">{c.username ?? "unknown"}</span>
                            <span className="text-xs text-zinc-500 shrink-0 truncate">
                              {c.group_name ?? "-"} · {c.value} pts
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {snapshot.partners.pending_count > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">
                        Partners pending review ({snapshot.partners.pending_count})
                      </p>
                      <ul className="space-y-1">
                        {snapshot.partners.pending_items.map((b) => (
                          <li key={b.slug} className="text-sm text-zinc-300 flex items-center justify-between gap-2">
                            <span className="truncate">{b.name}</span>
                            <span className="text-xs text-zinc-500 shrink-0">{b.created_by ?? "unknown"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                      New partners ({snapshot.partners.count})
                    </p>
                    {snapshot.partners.count === 0 ? (
                      <p className="text-sm text-zinc-500">None</p>
                    ) : (
                      <ul className="space-y-1">
                        {snapshot.partners.items.map((b) => (
                          <li key={b.slug} className="text-sm text-zinc-300 flex items-center justify-between gap-2">
                            <span className="truncate">{b.name}</span>
                            <span className="text-xs text-zinc-500 shrink-0 truncate">
                              {b.created_by ?? "unknown"} · {b.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                      New offers ({snapshot.offers.count})
                    </p>
                    {snapshot.offers.count === 0 ? (
                      <p className="text-sm text-zinc-500">None</p>
                    ) : (
                      <ul className="space-y-1">
                        {snapshot.offers.items.map((o, i) => (
                          <li key={i} className="text-sm text-zinc-300 flex items-center justify-between gap-2">
                            <span className="truncate">{o.title}</span>
                            <span className="text-xs text-zinc-500 shrink-0 truncate">{o.business_name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                      Redemptions ({snapshot.redemptions.count})
                    </p>
                    <p className="text-sm text-zinc-300">
                      {snapshot.redemptions.count} redeemed, {snapshot.redemptions.total_points} points spent
                    </p>
                    {snapshot.redemptions.items.length > 0 && (
                      <ul className="space-y-1 mt-1">
                        {snapshot.redemptions.items.map((r, i) => (
                          <li key={i} className="text-sm text-zinc-300 flex items-center justify-between gap-2">
                            <span className="truncate">{r.username ?? "unknown"}</span>
                            <span className="text-xs text-zinc-500 shrink-0 truncate">
                              {r.offer_title} · {r.business_name} · {r.points_spent} pts
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 pb-5 pt-3 shrink-0 border-t border-zinc-800/60">
              <button
                onClick={() => setOpen(false)}
                className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl transition-[background-color,transform] duration-150 touch-manipulation"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
