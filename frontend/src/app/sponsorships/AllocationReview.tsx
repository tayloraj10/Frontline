"use client";

import { useCallback, useEffect, useState } from "react";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note, Select, TextInput } from "@/components/ui/fields";
import { EmptyState, Section } from "@/components/ui/PageShell";

type AllocationStatus = "pending_review" | "approved" | "rejected" | "paid_out";

interface Allocation {
  id: string;
  amount_cents: number;
  status: AllocationStatus;
  created_at: string;
  reject_reason: string | null;
  user_name: string | null;
  username: string | null;
  group_name: string | null;
  site_label: string | null;
  is_direct?: boolean;
  remaining_cents: number;
  before_photo_url: string | null;
  after_photo_url: string | null;
}

const STATUS_VARIANT: Record<AllocationStatus, BadgeVariant> = {
  pending_review: "pending",
  approved: "success",
  rejected: "error",
  paid_out: "neutral",
};

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

function errorText(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // not JSON
  }
  return err.message || fallback;
}

/** Admin sign-off queue: nothing becomes owed to a cleaner until approved here. */
export default function AllocationReview() {
  const [status, setStatus] = useState<AllocationStatus | "">("pending_review");
  const [items, setItems] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = status ? `?status=${status}` : "";
      const res = await fetch(`/api/sponsored/allocations${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setItems((await res.json()).allocations);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Failed to load allocations"));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (id: string, path: "review" | "paid-out", body: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/sponsored/allocations/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err) {
      setError(errorText(err, "Action failed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Section
      title="Allocation review"
      description="Admin only. Check each earned payout against its photos, approve or reject it, then mark it paid once you have sent the money."
      action={
        <div className="w-44">
          <Select
            className="min-h-11"
            value={status}
            onChange={(e) => setStatus(e.target.value as AllocationStatus | "")}
          >
            <option value="pending_review">Pending review</option>
            <option value="approved">Approved (owed)</option>
            <option value="paid_out">Paid out</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </Select>
        </div>
      }
    >
      {error && <Note tone="warn">{error}</Note>}
      {loading && items.length === 0 && <p className="text-sm text-zinc-500">Loading...</p>}
      {!loading && items.length === 0 && <EmptyState title="Nothing here" />}

      <div className="space-y-3">
        {items.map((a) => (
          <Card key={a.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-zinc-200">
                  <span className="font-semibold">{a.user_name ?? a.username ?? a.group_name ?? "Unknown"}</span> earned{" "}
                  <span className="font-semibold">{usd(a.amount_cents)}</span>
                </p>
                <p className="text-xs text-zinc-500">
                  {a.is_direct ? "Direct group support" : a.site_label ?? "Sponsored area"} · pool has {usd(a.remaining_cents)} left
                </p>
                <p className="text-[11px] text-zinc-600">{new Date(a.created_at).toLocaleString()}</p>
                {a.reject_reason && <p className="text-xs text-red-400">Rejected: {a.reject_reason}</p>}
              </div>
              <Badge variant={STATUS_VARIANT[a.status]}>{a.status.replace("_", " ")}</Badge>
            </div>

            {(a.before_photo_url || a.after_photo_url) && (
              <div className="grid grid-cols-2 gap-2">
                {[a.before_photo_url, a.after_photo_url].map((url, i) =>
                  url ? (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={i === 0 ? "Before" : "After"}
                        className="aspect-square w-full rounded-2xl object-cover"
                      />
                      <span className="mt-1 block text-[11px] text-zinc-500">{i === 0 ? "Before" : "After"}</span>
                    </a>
                  ) : null,
                )}
              </div>
            )}

            {a.status === "pending_review" && (
              <div className="space-y-2">
                <TextInput
                  type="text"
                  placeholder="Reason if rejecting"
                  value={rejectReason[a.id] ?? ""}
                  onChange={(e) => setRejectReason((r) => ({ ...r, [a.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    loading={busyId === a.id}
                    onClick={() => send(a.id, "review", { approve: true })}
                  >
                    Approve
                  </Button>
                  <Button
                    className="flex-1"
                    variant="destructive"
                    loading={busyId === a.id}
                    onClick={() => send(a.id, "review", { approve: false, reject_reason: rejectReason[a.id] || null })}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}

            {a.status === "approved" && (
              <Button
                variant="secondary"
                className="w-full"
                loading={busyId === a.id}
                onClick={() => send(a.id, "paid-out", {})}
              >
                Mark paid out
              </Button>
            )}
          </Card>
        ))}
      </div>
    </Section>
  );
}
