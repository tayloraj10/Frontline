"use client";

import { useState } from "react";

const inputCls = "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500";

export type OfferFormInitial = {
  title: string;
  description: string | null;
  redemption_mode: "spend" | "threshold";
  points_cost: number | null;
  points_threshold: number | null;
  max_redemptions_per_user: number | null;
  max_total_redemptions: number | null;
  code: string | null;
  ends_at: string | null;
};

export type OfferFormPayload = {
  title: string;
  description: string | null;
  redemption_mode: "spend" | "threshold";
  points_cost: number | null;
  points_threshold: number | null;
  max_redemptions_per_user: number | null;
  max_total_redemptions: number | null;
  code: string | null;
  ends_at: string | null;
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function OfferForm({ initial, onSubmit, onCancel, submitLabel }: {
  initial?: OfferFormInitial;
  onSubmit: (payload: OfferFormPayload) => Promise<string | null>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [redemptionMode, setRedemptionMode] = useState<"spend" | "threshold">(initial?.redemption_mode ?? "spend");
  const [pointsCost, setPointsCost] = useState(initial?.points_cost ?? 100);
  const [pointsThreshold, setPointsThreshold] = useState(initial?.points_threshold ?? 500);
  const [maxPerUser, setMaxPerUser] = useState<string>(initial?.max_redemptions_per_user != null ? String(initial.max_redemptions_per_user) : "1");
  const [maxTotal, setMaxTotal] = useState<string>(initial?.max_total_redemptions != null ? String(initial.max_total_redemptions) : "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [endsAt, setEndsAt] = useState(toDateInputValue(initial?.ends_at ?? null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);

    const err = await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      redemption_mode: redemptionMode,
      points_cost: redemptionMode === "spend" ? pointsCost : null,
      points_threshold: redemptionMode === "threshold" ? pointsThreshold : null,
      max_redemptions_per_user: maxPerUser.trim() ? Number(maxPerUser) : null,
      max_total_redemptions: maxTotal.trim() ? Number(maxTotal) : null,
      code: code.trim() || null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    });

    setLoading(false);
    if (err) setError(err);
  };

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-700 rounded-xl p-4 bg-zinc-900/40 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Title</label>
          <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. 20% off any order" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Description</label>
          <textarea className={`${inputCls} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Redemption mode</label>
          <select className={inputCls} value={redemptionMode} onChange={e => setRedemptionMode(e.target.value as "spend" | "threshold")}>
            <option value="spend">spend (deducts points)</option>
            <option value="threshold">threshold (unlocks at balance)</option>
          </select>
        </div>
        {redemptionMode === "spend" ? (
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Points cost</label>
            <input type="number" min={0} className={inputCls} value={pointsCost} onChange={e => setPointsCost(Number(e.target.value))} />
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Points threshold</label>
            <input type="number" min={0} className={inputCls} value={pointsThreshold} onChange={e => setPointsThreshold(Number(e.target.value))} />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Max redemptions / user</label>
          <input type="number" min={1} className={inputCls} value={maxPerUser} onChange={e => setMaxPerUser(e.target.value)} placeholder="Blank = unlimited" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Max total redemptions</label>
          <input type="number" min={1} className={inputCls} value={maxTotal} onChange={e => setMaxTotal(e.target.value)} placeholder="Blank = unlimited" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Code</label>
          <input className={`${inputCls} font-mono`} value={code} onChange={e => setCode(e.target.value)} placeholder="Optional — shown to everyone who redeems" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Ends</label>
          <input type="date" className={inputCls} value={endsAt} onChange={e => setEndsAt(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
        >
          {loading ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
