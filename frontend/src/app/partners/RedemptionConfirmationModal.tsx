"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import BodyPortal from "@/components/ui/BodyPortal";

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
      <BodyPortal>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6 text-center space-y-4 shadow-elevation-4"
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
              className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg font-medium shadow-elevation-1 transition-[background-color,transform] duration-150 active:scale-[0.97] touch-manipulation"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      </BodyPortal>
    );
  }

  const notch = (edge: "top" | "bottom"): React.CSSProperties => {
    const y = edge === "top" ? "0" : "100%";
    const mask = `radial-gradient(circle 11px at 0 ${y}, transparent 98%, #000), radial-gradient(circle 11px at 100% ${y}, transparent 98%, #000)`;
    return { maskImage: mask, WebkitMaskImage: mask, maskComposite: "intersect", WebkitMaskComposite: "source-in" };
  };
  const meta = [proof.pointsSpent > 0 ? `${proof.pointsSpent} points spent` : null, formatTimestamp(proof.redeemedAt)]
    .filter(Boolean)
    .join(" · ");

  return (
    <BodyPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 8 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className="relative w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={notch("bottom")}
            className="relative overflow-hidden rounded-t-3xl bg-gradient-to-br from-emerald-600 to-emerald-800 px-6 pb-7 pt-6 text-center"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white touch-manipulation"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent"
              animate={{ left: ["-60%", "130%"] }}
              transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 0.8, ease: "easeInOut" }}
            />
            <span className="relative inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-white/90">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
              Redeemed {formatRelative(proof.redeemedAt)}
            </span>
            <h2 className="relative mt-3 font-display text-3xl font-extrabold leading-tight text-white">{proof.offerTitle}</h2>
            <p className="relative mt-1 text-base text-white/90">{proof.businessName}</p>
            {proof.code && (
              <button
                onClick={handleCopy}
                className="relative mt-5 w-full rounded-2xl bg-black/25 py-4 transition-transform active:scale-[0.98] touch-manipulation"
              >
                <span className="block font-mono text-3xl font-bold tracking-[0.15em] text-white">{proof.code}</span>
                <span className="mt-1 block text-xs text-white/80">{copied ? "Copied!" : "Tap to copy"}</span>
              </button>
            )}
          </div>

          <div className="mx-4 border-t-2 border-dashed border-zinc-400" aria-hidden="true" />

          <div style={notch("top")} className="rounded-b-3xl bg-zinc-100 px-6 pb-5 pt-6 text-center">
            <p className="font-display text-lg font-extrabold leading-snug text-zinc-900">Tap after giving the perk</p>
            <button
              onClick={handleMarkUsed}
              disabled={marking}
              className="mt-3 min-h-14 w-full rounded-2xl bg-amber-400 text-base font-extrabold text-amber-950 shadow-md hover:bg-amber-300 disabled:opacity-40 active:scale-[0.97] transition-[background-color,transform] touch-manipulation"
            >
              {marking ? "Marking…" : "Mark as used"}
            </button>
            {markError && <p className="mt-2 text-xs font-semibold text-red-600">{markError}</p>}
            {meta && <p className="mt-4 text-xs text-zinc-600">{meta}</p>}
          </div>
        </motion.div>
      </motion.div>
    </BodyPortal>
  );
}
