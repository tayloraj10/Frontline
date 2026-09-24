"use client";

import { useCallback, useEffect, useState } from "react";

type SponsorshipStatus = "pending_funding" | "funded" | "released" | "refunded";

interface Sponsorship {
  id: string;
  sponsor_type: "user" | "business";
  target_type: "cleanup_event" | "geo_unit" | "general";
  amount_cents: number;
  currency: string;
  message: string | null;
  status: SponsorshipStatus;
  released_at: string | null;
  created_at: string;
  sponsor_user_name: string | null;
  sponsor_business_name: string | null;
  target_cleanup_title: string | null;
  target_geo_unit_name: string | null;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // not JSON
  }
  return err.message || fallback;
}

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

const STATUS_STYLES: Record<SponsorshipStatus, string> = {
  pending_funding: "bg-zinc-800 text-zinc-400",
  funded: "bg-amber-900/50 text-amber-300",
  released: "bg-emerald-900/50 text-emerald-300",
  refunded: "bg-red-900/50 text-red-300",
};

export default function SponsorshipsHub({
  geoUnits,
  businesses,
  currentUserId,
}: {
  geoUnits: { id: string; label: string }[];
  businesses: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SponsorshipStatus | "">("");

  const [targetMode, setTargetMode] = useState<"geo_unit" | "general">("geo_unit");
  const [sponsorMode, setSponsorMode] = useState<"user" | "business">("user");
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? "");
  const [geoUnitId, setGeoUnitId] = useState(geoUnits[0]?.id ?? "");
  const [amountDollars, setAmountDollars] = useState("25");
  const [message, setMessage] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [releasingId, setReleasingId] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const url = statusFilter ? `/api/admin/sponsorships?status=${statusFilter}` : "/api/admin/sponsorships";
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setSponsorships(await res.json());
    } catch (err) {
      setListError(extractErrorMessage(err, "Failed to load sponsorships"));
    } finally {
      setListLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleCreate = async () => {
    if (targetMode === "geo_unit" && !geoUnitId) {
      setCreateError("Select an area to sponsor.");
      return;
    }
    const amountCents = Math.round(parseFloat(amountDollars) * 100);
    if (!amountCents || amountCents <= 0) {
      setCreateError("Enter a valid amount.");
      return;
    }
    if (sponsorMode === "business" && !businessId) {
      setCreateError("Select a business to sponsor as.");
      return;
    }

    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/sponsorships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor_type: sponsorMode,
          sponsor_user_id: sponsorMode === "user" ? currentUserId : null,
          sponsor_business_id: sponsorMode === "business" ? businessId : null,
          target_type: targetMode,
          target_geo_unit_id: targetMode === "geo_unit" ? geoUnitId : null,
          amount_cents: amountCents,
          message: message || null,
          success_url: `${window.location.origin}/billing/success`,
          cancel_url: `${window.location.origin}/billing/cancel`,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.open(data.url, "_blank", "noopener,noreferrer");
      refreshList();
    } catch (err) {
      setCreateError(extractErrorMessage(err, "Failed to start checkout"));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRelease = async (id: string) => {
    setReleasingId(id);
    try {
      const res = await fetch(`/api/admin/sponsorships/${id}/release`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      await refreshList();
    } catch (err) {
      setListError(extractErrorMessage(err, "Failed to release sponsorship"));
    } finally {
      setReleasingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-2 bg-zinc-950">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
          <span className="text-sm font-semibold text-zinc-300">Sponsor an area or the mission</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          {createError && <p className="text-sm text-red-400">{createError}</p>}

          <div className="flex gap-2">
            <button
              className={`min-h-9 px-3 rounded-lg text-xs font-semibold transition-colors duration-150 ${
                targetMode === "geo_unit" ? "bg-emerald-700 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
              onClick={() => setTargetMode("geo_unit")}
            >
              A specific area
            </button>
            <button
              className={`min-h-9 px-3 rounded-lg text-xs font-semibold transition-colors duration-150 ${
                targetMode === "general" ? "bg-emerald-700 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
              onClick={() => setTargetMode("general")}
            >
              Frontline's general fund
            </button>
          </div>

          {targetMode === "geo_unit" ? (
            <select
              className="w-full min-h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm"
              value={geoUnitId}
              onChange={(e) => setGeoUnitId(e.target.value)}
            >
              {geoUnits.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-zinc-500">
              A GoFundMe-style donation to the mission overall, not tied to a specific cleanup or area.
            </p>
          )}

          <div className="flex gap-2">
            <button
              className={`min-h-9 px-3 rounded-lg text-xs font-semibold transition-colors duration-150 ${
                sponsorMode === "user" ? "bg-emerald-700 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
              onClick={() => setSponsorMode("user")}
            >
              As myself
            </button>
            <button
              className={`min-h-9 px-3 rounded-lg text-xs font-semibold transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                sponsorMode === "business" ? "bg-emerald-700 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
              onClick={() => setSponsorMode("business")}
              disabled={businesses.length === 0}
            >
              As a business
            </button>
          </div>

          {sponsorMode === "business" && (
            <select
              className="w-full min-h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-sm">$</span>
            <input
              type="number"
              min="1"
              step="1"
              className="w-24 min-h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
            />
          </div>

          <input
            type="text"
            placeholder="Optional message"
            className="w-full min-h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-sm"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <button
            className="min-h-9 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={createLoading || (targetMode === "geo_unit" && geoUnits.length === 0)}
            onClick={handleCreate}
          >
            Start test checkout
          </button>
        </div>
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-2 bg-zinc-950">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-300">All sponsorships</span>
          <select
            className="min-h-8 px-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SponsorshipStatus | "")}
          >
            <option value="">All statuses</option>
            <option value="pending_funding">Pending funding</option>
            <option value="funded">Funded</option>
            <option value="released">Released</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <div className="px-5 py-4 space-y-3">
          {listError && <p className="text-sm text-red-400">{listError}</p>}
          {listLoading && sponsorships.length === 0 && <p className="text-sm text-zinc-600">Loading...</p>}
          {!listLoading && sponsorships.length === 0 && (
            <p className="text-sm text-zinc-600">No sponsorships yet.</p>
          )}

          {sponsorships.map((s) => {
            const sponsorLabel = s.sponsor_type === "user" ? s.sponsor_user_name ?? "A user" : s.sponsor_business_name ?? "A business";
            const targetLabel =
              s.target_type === "cleanup_event"
                ? s.target_cleanup_title ?? "a cleanup"
                : s.target_type === "general"
                  ? "Frontline's general fund"
                  : s.target_geo_unit_name ?? "an area";
            return (
              <div key={s.id} className="flex items-start justify-between gap-3 border-b border-zinc-900 last:border-b-0 pb-3 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200">
                    <span className="font-semibold">{sponsorLabel}</span> sponsored <span className="font-semibold">{targetLabel}</span> for{" "}
                    <span className="font-semibold">{formatAmount(s.amount_cents, s.currency)}</span>
                  </p>
                  {s.message && <p className="text-xs text-zinc-500 mt-0.5">&quot;{s.message}&quot;</p>}
                  <p className="text-[11px] text-zinc-600 mt-0.5">{new Date(s.created_at).toLocaleString()}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_STYLES[s.status]}`}>
                    {s.status.replace("_", " ")}
                  </span>
                  {s.status === "funded" && (
                    <button
                      className="min-h-7 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-semibold transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={releasingId === s.id}
                      onClick={() => handleRelease(s.id)}
                    >
                      Mark released
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
