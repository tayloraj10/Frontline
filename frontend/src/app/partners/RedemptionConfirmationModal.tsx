"use client";

import { useState } from "react";

export type RedemptionProof = {
  redemptionId: string;
  businessName: string;
  offerTitle: string;
  code: string | null;
  pointsSpent: number;
  redeemedAt: string | null;
  usedAt: string | null;
};

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function RedemptionConfirmationModal({
  proof,
  onClose,
  onMarkedUsed,
}: {
  proof: RedemptionProof;
  onClose: () => void;
  onMarkedUsed: (redemptionId: string, usedAt: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;

  const handleCopy = () => {
    if (!proof.code) return;
    navigator.clipboard.writeText(proof.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleMarkUsed = async () => {
    setMarking(true);
    setMarkError(null);
    try {
      const res = await fetch(`${fastapiUrl}/api/partners/redemptions/${proof.redemptionId}/mark-used`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to mark as used");
      onMarkedUsed(proof.redemptionId, data.used_at ?? new Date().toISOString());
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "Failed to mark as used");
    } finally {
      setMarking(false);
    }
  };

  if (proof.usedAt) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6 text-center space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-14 h-14 mx-auto rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <svg className="w-7 h-7 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Already used</p>
            <h2 className="text-lg font-bold text-zinc-100 mt-1">{proof.offerTitle}</h2>
            <p className="text-sm text-zinc-500">{proof.businessName}</p>
          </div>
          <p className="text-xs text-zinc-500">Honored {formatTimestamp(proof.usedAt)}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6 text-center space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-900/40 border border-emerald-700/60 flex items-center justify-center">
          <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Redeemed {formatRelative(proof.redeemedAt)}</p>
          <h2 className="text-lg font-bold text-zinc-100 mt-1">{proof.offerTitle}</h2>
          <p className="text-sm text-zinc-500">{proof.businessName}</p>
        </div>

        {proof.code && (
          <button
            onClick={handleCopy}
            className="w-full py-3 rounded-xl bg-zinc-950 border border-zinc-700 hover:border-zinc-500 transition-colors"
          >
            <span className="block text-xl font-mono font-bold tracking-wider text-zinc-100">{proof.code}</span>
            <span className="block text-[10px] text-zinc-500 mt-1">{copied ? "Copied!" : "Tap to copy"}</span>
          </button>
        )}

        <div className="text-xs text-zinc-500 space-y-0.5">
          {proof.pointsSpent > 0 && <p>{proof.pointsSpent} points spent</p>}
          {formatTimestamp(proof.redeemedAt) && <p>Redeemed {formatTimestamp(proof.redeemedAt)}</p>}
        </div>

        <div className="border-t border-zinc-800 pt-4 space-y-2">
          <p className="text-[11px] text-zinc-600">For the merchant: tap below once this offer has been honored.</p>
          <button
            onClick={handleMarkUsed}
            disabled={marking}
            className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-sm rounded-lg font-medium transition-colors"
          >
            {marking ? "Marking…" : "Mark as used"}
          </button>
          {markError && <p className="text-red-400 text-xs">{markError}</p>}
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm rounded-lg font-medium transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
