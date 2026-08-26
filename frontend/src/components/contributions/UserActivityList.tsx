"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ConfirmModal from "@/components/ui/ConfirmModal";

const PAGE_SIZE = 15;

interface Contribution {
  id: string;
  campaign_id: string | null;
  value: number | null;
  contribution_type: string;
  notes: string | null;
  submitted_at: string;
  small_bags?: number | null;
  large_bags?: number | null;
}

interface ProblemReport {
  id: string;
  campaign_id: string | null;
  severity: string;
  status: string;
  reported_at: string;
}

interface Campaign {
  id: string;
  title: string;
  slug: string;
  campaign_type: string;
}

type ActivityItem =
  | ({ kind: "contribution"; timestamp: string } & Contribution)
  | ({ kind: "report"; timestamp: string } & ProblemReport);

const CONTRIBUTION_ICON: Record<string, string> = {
  cleanup: "🗑️",
  photo: "📷",
  registration: "🗳️",
  advocacy: "✊",
  civic_action: "🗽",
  unfollow: "🧠",
  solarpunk_action: "🌿",
  solarpunk_photo: "📸",
  solarpunk_hex_credit: "🌱",
  cleanup_event_checkin: "✅",
};

const CONTRIBUTION_UNIT: Record<string, string> = {
  cleanup: "pts",
  photo: "photo",
  registration: "registration",
  advocacy: "action",
  civic_action: "action",
  unfollow: "unfollow",
  solarpunk_action: "pts",
  solarpunk_photo: "pts",
  solarpunk_hex_credit: "bloom",
  cleanup_event_checkin: "pts",
};

const CONTRIBUTION_LABEL: Record<string, string> = {
  cleanup: "Trash cleanup",
  photo: "Photo submission",
  registration: "Voter registration",
  advocacy: "Advocacy action",
  civic_action: "Civic action",
  unfollow: "Unfollow action",
  solarpunk_action: "Solarpunk action",
  solarpunk_photo: "Solarpunk photo",
  solarpunk_hex_credit: "Solarpunk hex credit",
  cleanup_event_checkin: "Event check-in",
};

const REPORT_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  scheduled: "Claimed",
  in_progress: "In progress",
  addressed: "Resolved",
  flagged: "Flagged",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1H11Z" />
    </svg>
  );
}

export default function UserActivityList({
  initialContribs,
  initialReports = [],
  campaigns,
  isOwn,
  userId,
  profileId,
}: {
  initialContribs: Contribution[];
  initialReports?: ProblemReport[];
  campaigns: Campaign[];
  isOwn: boolean;
  userId: string | null;
  profileId: string;
}) {
  const [contribs, setContribs] = useState(initialContribs);
  const [reports, setReports] = useState(initialReports);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "contribution" | "report"; id: string } | null>(null);
  const [campaignsById, setCampaignsById] = useState(new Map(campaigns.map((c) => [c.id, c])));

  const [contribOffset, setContribOffset] = useState(initialContribs.length);
  const [reportOffset, setReportOffset] = useState(initialReports.length);
  const [hasMoreContribs, setHasMoreContribs] = useState(initialContribs.length >= PAGE_SIZE);
  const [hasMoreReports, setHasMoreReports] = useState(initialReports.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const hasMore = hasMoreContribs || hasMoreReports;

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const supabase = createClient();

      const [{ data: moreContribs }, { data: moreReports }] = await Promise.all([
        hasMoreContribs
          ? supabase
              .from("contributions")
              .select(
                "id, campaign_id, value, contribution_type, notes, submitted_at, cleanup_id, cleanups!cleanup_id(metrics_small_bags, metrics_large_bags)",
              )
              .eq("user_id", profileId)
              .order("submitted_at", { ascending: false })
              .range(contribOffset, contribOffset + PAGE_SIZE - 1)
          : Promise.resolve({ data: [] as never[] }),
        hasMoreReports
          ? supabase
              .from("problem_reports")
              .select("id, campaign_id, severity, status, reported_at")
              .eq("submitted_by_user_id", profileId)
              .order("reported_at", { ascending: false })
              .range(reportOffset, reportOffset + PAGE_SIZE - 1)
          : Promise.resolve({ data: [] as ProblemReport[] }),
      ]);

      const newContribs = (moreContribs ?? []).map((c) => {
        const cleanup = c.cleanups as unknown as { metrics_small_bags: number | null; metrics_large_bags: number | null } | null;
        return {
          id: c.id,
          campaign_id: c.campaign_id,
          value: c.value,
          contribution_type: c.contribution_type,
          notes: c.notes,
          submitted_at: c.submitted_at,
          small_bags: cleanup?.metrics_small_bags ?? null,
          large_bags: cleanup?.metrics_large_bags ?? null,
        };
      });
      const newReports = moreReports ?? [];

      if (newContribs.length > 0) setContribs((prev) => [...prev, ...newContribs]);
      if (newReports.length > 0) setReports((prev) => [...prev, ...newReports]);
      setContribOffset((prev) => prev + newContribs.length);
      setReportOffset((prev) => prev + newReports.length);
      setHasMoreContribs(newContribs.length >= PAGE_SIZE);
      setHasMoreReports(newReports.length >= PAGE_SIZE);

      const missingCampaignIds = [
        ...new Set(
          [...newContribs, ...newReports]
            .map((item) => item.campaign_id)
            .filter((id): id is string => !!id && !campaignsById.has(id)),
        ),
      ];
      if (missingCampaignIds.length > 0) {
        const { data: moreCampaigns } = await supabase
          .schema("public")
          .from("campaigns")
          .select("id, title, slug, campaign_type")
          .in("id", missingCampaignIds);
        if (moreCampaigns && moreCampaigns.length > 0) {
          setCampaignsById((prev) => {
            const next = new Map(prev);
            for (const c of moreCampaigns) next.set(c.id, c);
            return next;
          });
        }
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDeleteContribution = async (id: string) => {
    if (!userId) return;
    setDeleting(id);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/${id}?user_id=${userId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      setContribs((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!userId) return;
    setDeleting(id);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/problem-reports/${id}?user_id=${userId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      setReports((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    setPendingDelete(null);
    if (kind === "contribution") await handleDeleteContribution(id);
    else await handleDeleteReport(id);
  };

  const items: ActivityItem[] = [
    ...contribs.map((c) => ({ kind: "contribution" as const, timestamp: c.submitted_at, ...c })),
    ...reports.map((r) => ({ kind: "report" as const, timestamp: r.reported_at, ...r })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (items.length === 0) {
    return <div className="px-5 py-8 text-center text-zinc-600 text-sm">No contributions yet.</div>;
  }

  return (
    <>
    <ul className="divide-y divide-zinc-800/60">
      {items.map((item) => {
        const campaign = item.campaign_id ? campaignsById.get(item.campaign_id) : null;

        if (item.kind === "report") {
          return (
            <li key={item.id} className="px-5 py-3 flex items-start gap-3">
              <div
                className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs shrink-0 mt-0.5 shadow-elevation-1"
                title="Trash report"
              >
                🚩
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-300">
                    Trash report
                  </span>
                  <span className="text-xs text-zinc-600">
                    {REPORT_STATUS_LABEL[item.status] ?? item.status}
                  </span>
                  {campaign && (
                    <>
                      <span className="text-xs text-zinc-600">in</span>
                      <Link
                        href={`/campaigns/${campaign.slug}`}
                        className="text-xs text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150"
                      >
                        {campaign.title}
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                <span className="text-xs text-zinc-600">{timeAgo(item.timestamp)}</span>
                {isOwn && (
                  <button
                    onClick={() => setPendingDelete({ kind: "report", id: item.id })}
                    disabled={deleting === item.id}
                    className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-600 border border-transparent hover:text-red-400 hover:bg-red-950/30 hover:border-red-900/60 active:text-red-400 active:bg-red-950/30 active:border-red-900/60 transition-colors duration-150 disabled:opacity-40 touch-manipulation"
                    title="Delete report"
                  >
                    {deleting === item.id ? <span className="text-xs text-zinc-600">…</span> : <TrashIcon />}
                  </button>
                )}
              </div>
            </li>
          );
        }

        const icon = CONTRIBUTION_ICON[item.contribution_type] ?? "📌";
        const unit = CONTRIBUTION_UNIT[item.contribution_type] ?? "pts";
        const label = CONTRIBUTION_LABEL[item.contribution_type] ?? item.contribution_type;
        return (
          <li key={item.id} className="px-5 py-3 flex items-start gap-3">
            <div
              className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs shrink-0 mt-0.5 shadow-elevation-1"
              title={label}
            >
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-zinc-300 tabular-nums">
                  {item.value ?? 1} {unit}
                </span>
                {((item.small_bags ?? 0) > 0 || (item.large_bags ?? 0) > 0) && (
                  <span className="text-[11px] text-zinc-600 tabular-nums">
                    ({(item.small_bags ?? 0) + (item.large_bags ?? 0)} bag
                    {(item.small_bags ?? 0) + (item.large_bags ?? 0) !== 1 ? "s" : ""}
                    {(item.small_bags ?? 0) > 0 && (item.large_bags ?? 0) > 0 && (
                      <> &mdash; {item.small_bags} small, {item.large_bags} large</>
                    )}
                    )
                  </span>
                )}
                {campaign && (
                  <>
                    <span className="text-xs text-zinc-600">in</span>
                    <Link
                      href={`/campaigns/${campaign.slug}`}
                      className="text-xs text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150"
                    >
                      {campaign.title}
                    </Link>
                  </>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-600">{label}</p>
              {item.notes && (
                <p className="mt-0.5 text-xs text-zinc-600 line-clamp-1">{item.notes}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              <span className="text-xs text-zinc-600">{timeAgo(item.timestamp)}</span>
              {isOwn && (
                <button
                  onClick={() => setPendingDelete({ kind: "contribution", id: item.id })}
                  disabled={deleting === item.id}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-600 border border-transparent hover:text-red-400 hover:bg-red-950/30 hover:border-red-900/60 active:text-red-400 active:bg-red-950/30 active:border-red-900/60 transition-colors duration-150 disabled:opacity-40 touch-manipulation"
                  title="Delete contribution"
                >
                  {deleting === item.id ? <span className="text-xs text-zinc-600">…</span> : <TrashIcon />}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
    {hasMore && (
      <div className="px-5 py-3 border-t border-zinc-800/60 text-center">
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="text-xs text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150 disabled:opacity-40"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      </div>
    )}
    <ConfirmModal
      open={!!pendingDelete}
      title={pendingDelete?.kind === "report" ? "Delete this report?" : "Delete this contribution?"}
      message="This can't be undone."
      confirmLabel="Delete"
      cancelLabel="Keep it"
      onConfirm={handleConfirmDelete}
      onCancel={() => setPendingDelete(null)}
    />
    </>
  );
}
