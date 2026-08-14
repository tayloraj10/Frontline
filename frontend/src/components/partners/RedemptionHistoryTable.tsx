"use client";

import { useEffect, useState } from "react";
import type { DashboardOffer } from "@/app/partners/dashboard/PartnerDashboardClient";

type Redemption = {
  id: string;
  redeemed_at: string | null;
  used_at: string | null;
  points_spent: number;
  offer_id: string;
  offer_title: string;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  location_id: string | null;
  location_label: string | null;
};

const PAGE_SIZE = 50;

export default function RedemptionHistoryTable({
  businessId,
  offers,
  fastapiUrl,
  viewerUserId,
}: {
  businessId: string;
  offers: DashboardOffer[];
  fastapiUrl: string;
  viewerUserId: string;
}) {
  const [offerFilter, setOfferFilter] = useState<string>("all");
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = (offset: number, replace: boolean) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      viewer_user_id: viewerUserId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (offerFilter !== "all") params.set("offer_id", offerFilter);
    fetch(`${fastapiUrl}/api/partners/businesses/${businessId}/redemptions?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? "Failed to load redemptions");
        return res.json();
      })
      .then((json: { total_count: number; redemptions: Redemption[] }) => {
        setTotalCount(json.total_count);
        setRedemptions((prev) => (replace ? json.redemptions : [...prev, ...json.redemptions]));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, offerFilter, fastapiUrl, viewerUserId]);

  return (
    <div className="space-y-3">
      <select
        value={offerFilter}
        onChange={(e) => setOfferFilter(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
      >
        <option value="all">All offers</option>
        {offers.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </select>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {redemptions.length === 0 && !loading && (
        <p className="text-xs text-zinc-600">No redemptions yet.</p>
      )}

      {redemptions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-600 border-b border-zinc-800">
                <th className="py-2 pr-3 font-medium">Redeemed by</th>
                <th className="py-2 pr-3 font-medium">Offer</th>
                <th className="py-2 pr-3 font-medium">Redeemed at</th>
                <th className="py-2 pr-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.map((r) => (
                <tr key={r.id} className="border-b border-zinc-900">
                  <td className="py-2 pr-3 text-zinc-300">{r.display_name ?? r.username ?? "Unknown user"}</td>
                  <td className="py-2 pr-3 text-zinc-400">{r.offer_title}</td>
                  <td className="py-2 pr-3 text-zinc-500">
                    {r.redeemed_at ? new Date(r.redeemed_at).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.used_at ? (
                      <span className="text-emerald-400">Used {new Date(r.used_at).toLocaleDateString()}</span>
                    ) : (
                      <span className="text-amber-400">Not yet used</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {redemptions.length < totalCount && (
        <button
          onClick={() => fetchPage(redemptions.length, false)}
          disabled={loading}
          className="px-3 py-1.5 text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-lg font-medium transition-colors duration-150 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
