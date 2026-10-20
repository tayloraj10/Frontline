"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

interface DayOfWeekBucket {
  dow: number;
  label: string;
  total_value: number;
  contribution_count: number;
}

interface TopContributor {
  user_id: string;
  display_name: string | null;
  username: string | null;
  total_value: number;
}

interface PremiumInsights {
  day_of_week: DayOfWeekBucket[];
  top_contributors_30d: TopContributor[];
}

/**
 * Advanced group analytics -- the first feature actually gated by has_premium()
 * (see dev-docs/payments-scoping-2026-08-20.md use case 1). Only rendered for group
 * admins; shows an upsell if the group has no active subscription.
 */
export default function PremiumInsightsCard({
  groupId,
  viewerUserId,
  fastapiUrl,
}: {
  groupId: string;
  viewerUserId: string;
  fastapiUrl: string;
}) {
  const [state, setState] = useState<"loading" | "locked" | "ready" | "error">("loading");
  const [insights, setInsights] = useState<PremiumInsights | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`${fastapiUrl}/api/groups/${groupId}/stats/premium-insights?viewer_user_id=${viewerUserId}`)
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
  }, [groupId, viewerUserId, fastapiUrl]);

  if (state === "loading" || state === "error") return null;

  if (state === "locked") {
    return (
      <Card padding="lg" className="mb-5">
        <p className="font-display text-base font-extrabold text-zinc-100 mb-1">Premium Insights</p>
        <p className="text-sm text-zinc-400">
          Day-of-week activity trends and top contributors are available with an active group subscription.
        </p>
      </Card>
    );
  }

  const maxValue = Math.max(1, ...(insights?.day_of_week ?? []).map((d) => d.total_value));

  return (
    <Card padding="lg" className="mb-5 space-y-5">
      <h3 className="font-display text-lg font-extrabold tracking-tight text-emerald-400">Premium Insights</h3>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Activity by day of week</p>
          <div className="flex items-end gap-1.5 h-20">
            {insights?.day_of_week.map((d) => (
              <div key={d.dow} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-emerald-400 rounded-t"
                  style={{ height: `${Math.max(4, (d.total_value / maxValue) * 64)}px` }}
                  title={`${d.total_value} points, ${d.contribution_count} logs`}
                />
                <span className="text-[10px] text-zinc-500">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {insights && insights.top_contributors_30d.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Top contributors (last 30 days)</p>
            <ul className="space-y-1">
              {insights.top_contributors_30d.map((c) => (
                <li key={c.user_id} className="flex items-center justify-between text-sm text-zinc-300">
                  <span>{c.display_name || c.username || "Anonymous"}</span>
                  <span className="text-zinc-500">{c.total_value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
