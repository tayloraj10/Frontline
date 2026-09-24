"use client";

import { useEffect, useState } from "react";

interface DayOfWeekBucket {
  dow: number;
  label: string;
  total_value: number;
  contribution_count: number;
}

interface MonthlyTrendBucket {
  month: string;
  total_value: number;
  contribution_count: number;
}

interface TopGeoUnit {
  geo_unit_id: string;
  display_name: string | null;
  total_value: number;
  contribution_count: number;
}

interface PersonalInsights {
  day_of_week: DayOfWeekBucket[];
  monthly_trend: MonthlyTrendBucket[];
  top_geo_units: TopGeoUnit[];
}

/**
 * Personal impact analytics -- premium feature (dev-docs/payments-scoping-2026-08-20.md).
 * Only rendered for the profile owner (admin-only-for-now, see users/[username]/page.tsx);
 * shows an upsell if the account has no active subscription.
 */
export default function PersonalInsightsCard({
  userId,
  viewerUserId,
  fastapiUrl,
}: {
  userId: string;
  viewerUserId: string;
  fastapiUrl: string;
}) {
  const [state, setState] = useState<"loading" | "locked" | "ready" | "error">("loading");
  const [insights, setInsights] = useState<PersonalInsights | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`${fastapiUrl}/api/users/${userId}/premium-insights?viewer_user_id=${viewerUserId}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 402) {
          setState("locked");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        setInsights(await res.json());
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, viewerUserId, fastapiUrl]);

  if (state === "loading" || state === "error") return null;

  if (state === "locked") {
    return (
      <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1 bg-zinc-950 mb-5 px-5 py-4">
        <p className="text-sm font-semibold text-zinc-300 mb-1">Personal Impact Analytics 🔒</p>
        <p className="text-xs text-zinc-500">
          Your activity trends, monthly progress, and top areas are available with an active premium subscription.
        </p>
      </div>
    );
  }

  const maxDowValue = Math.max(1, ...(insights?.day_of_week ?? []).map((d) => d.total_value));
  const maxMonthValue = Math.max(1, ...(insights?.monthly_trend ?? []).map((m) => m.total_value));

  return (
    <div className="border border-emerald-800/50 rounded-xl overflow-hidden shadow-elevation-1 bg-zinc-950 mb-5">
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40">
        <span className="text-sm font-semibold text-emerald-400">Personal Impact Analytics</span>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div>
          <p className="text-xs text-zinc-500 mb-2">Activity by day of week</p>
          <div className="flex items-end gap-1.5 h-20">
            {insights?.day_of_week.map((d) => (
              <div key={d.dow} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-emerald-700 rounded-t"
                  style={{ height: `${Math.max(4, (d.total_value / maxDowValue) * 64)}px` }}
                  title={`${d.total_value} points, ${d.contribution_count} logs`}
                />
                <span className="text-[10px] text-zinc-600">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {insights && insights.monthly_trend.length > 0 && (
          <div>
            <p className="text-xs text-zinc-500 mb-2">Last 6 months</p>
            <div className="flex items-end gap-1.5 h-20">
              {insights.monthly_trend.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-emerald-700 rounded-t"
                    style={{ height: `${Math.max(4, (m.total_value / maxMonthValue) * 64)}px` }}
                    title={`${m.total_value} points, ${m.contribution_count} logs`}
                  />
                  <span className="text-[10px] text-zinc-600">
                    {new Date(m.month).toLocaleDateString(undefined, { month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {insights && insights.top_geo_units.length > 0 && (
          <div>
            <p className="text-xs text-zinc-500 mb-2">Top areas you've contributed to</p>
            <ul className="space-y-1">
              {insights.top_geo_units.map((g) => (
                <li key={g.geo_unit_id} className="flex items-center justify-between text-sm text-zinc-300">
                  <span>{g.display_name || "Unnamed area"}</span>
                  <span className="text-zinc-500">{g.total_value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
