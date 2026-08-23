"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { formatPoints } from "@/lib/formatPoints";
import GeoStatsExplorer from "@/app/leaderboard/GeoStatsExplorer";
import CampaignDashboardMap from "./CampaignDashboardMap";
import IntervalPicker from "@/app/groups/[slug]/stats/IntervalPicker";
import { type StatsWindow, statsWindowParams } from "@/app/groups/[slug]/stats/statsWindow";

const CHART_COLORS = { emerald: "#10b981", sky: "#0ea5e9", amber: "#f59e0b", zinc: "#71717a" };

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-zinc-800 rounded-xl overflow-hidden mb-6 shadow-elevation-2 bg-zinc-950">
      <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-300">{title}</span>
        {right}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2.5 shadow-elevation-1">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-bold text-zinc-100 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-zinc-600">{sub}</div>}
    </div>
  );
}

function useDashboardFetch<T>(
  fastapiUrl: string,
  campaignId: string,
  path: string,
  statsWindow: StatsWindow,
  viewerUserId: string
): { data: T | null; loading: boolean; error: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ ...statsWindowParams(statsWindow), viewer_user_id: viewerUserId });
    fetch(`${fastapiUrl}/api/campaigns/${campaignId}/dashboard/${path}?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json: T) => setData(json))
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fastapiUrl, campaignId, path, viewerUserId, statsWindow.interval, statsWindow.anchor.getTime()]);

  return { data, loading, error };
}

interface OverviewData {
  contribution_count: number;
  unique_participants: number;
  total_points: number;
  group_cleanup_count: number;
  individual_cleanup_count: number;
  total_small_bags: number;
  total_large_bags: number;
  total_pounds: number;
  trash_reports_open: number;
  trash_reports_resolved: number;
  trash_reports_total: number;
  active_partner_count: number;
  redemption_count: number;
  points_redeemed: number;
}

interface CleanupsData {
  trend: { bucket: string; group_count: number; individual_count: number }[];
  top_groups: { group_id: string; name: string; cleanup_count: number; small_bags: number; large_bags: number; pounds: number }[];
  rsvp_count: number;
  going_count: number;
  checked_in_count: number;
  map_points: { latitude: number; longitude: number; is_group_event: boolean; status: string }[];
}

interface RoutesData {
  routed_cleanup_count: number;
  total_distance_miles: number;
  routes: { cleanup_id: string; title: string; distance_miles: number; geojson: string }[];
}

interface ContribBreakdownData {
  by_type: { contribution_type: string; count: number; total_value: number }[];
  top_contributors: { user_id: string; username: string | null; display_name: string | null; contribution_count: number; total_value: number }[];
}

interface ContribTrendData {
  bucket_unit: string;
  trend: { bucket: string; count: number; total_value: number }[];
}

interface TrashReportsData {
  by_status_severity: { status: string; severity: string; count: number }[];
  avg_resolution_hours: number | null;
  resolved_count: number;
  map_points: { latitude: number; longitude: number; status: string; severity: string }[];
}

interface PartnersData {
  businesses: { business_id: string; name: string; status: string; redemption_count: number; points_redeemed: number }[];
  offers: { offer_id: string; title: string; business_name: string; status: string; redemption_count: number; points_redeemed: number }[];
  trend: { bucket: string; redemption_count: number; points_redeemed: number; active_offer_count: number }[];
}

function formatBucketLabel(bucket: React.ReactNode): string {
  return new Date(String(bucket)).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatBucketTick(bucket: string): string {
  return new Date(bucket).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatContributionType(type: string): string {
  return type
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Wraps a proper-cased label onto up to two lines (splitting on the space closest to the
// midpoint) so long contribution-type names don't get clipped by the Y-axis column width.
function wrapLabel(label: string, maxCharsPerLine = 14): [string] | [string, string] {
  if (label.length <= maxCharsPerLine) return [label];
  const words = label.split(" ");
  if (words.length === 1) return [label];
  let bestSplit = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const firstLine = words.slice(0, i).join(" ");
    const diff = Math.abs(firstLine.length - label.length / 2);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = i;
    }
  }
  return [words.slice(0, bestSplit).join(" "), words.slice(bestSplit).join(" ")];
}

function ContributionTypeTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const label = formatContributionType(payload?.value ?? "");
  const lines = wrapLabel(label);
  return (
    <text x={x} y={y} textAnchor="end" fill="#71717a" fontSize={11}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? (lines.length > 1 ? -4 : 4) : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export default function CampaignDashboardView({
  campaignId,
  campaignSlug,
  campaignName,
  viewerUserId,
  fastapiUrl,
}: {
  campaignId: string;
  campaignSlug: string;
  campaignName: string;
  viewerUserId: string;
  fastapiUrl: string;
}) {
  const [statsWindow, setStatsWindow] = useState<StatsWindow>({ interval: "month", anchor: new Date() });
  const [exporting, setExporting] = useState(false);

  const overview = useDashboardFetch<OverviewData>(fastapiUrl, campaignId, "overview", statsWindow, viewerUserId);
  const cleanups = useDashboardFetch<CleanupsData>(fastapiUrl, campaignId, "cleanups", statsWindow, viewerUserId);
  const routes = useDashboardFetch<RoutesData>(fastapiUrl, campaignId, "routes", statsWindow, viewerUserId);
  const breakdown = useDashboardFetch<ContribBreakdownData>(fastapiUrl, campaignId, "contributions/breakdown", statsWindow, viewerUserId);
  const trend = useDashboardFetch<ContribTrendData>(fastapiUrl, campaignId, "contributions/trend", statsWindow, viewerUserId);
  const trashReports = useDashboardFetch<TrashReportsData>(fastapiUrl, campaignId, "trash-reports", statsWindow, viewerUserId);
  const partners = useDashboardFetch<PartnersData>(fastapiUrl, campaignId, "partners", statsWindow, viewerUserId);

  async function handleExportPdf() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ ...statsWindowParams(statsWindow), viewer_user_id: viewerUserId });
      const res = await fetch(`${fastapiUrl}/api/campaigns/${campaignId}/dashboard/export.pdf?${params}`);
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${campaignSlug}-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Couldn't generate the PDF report. Try again later.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <IntervalPicker window={statsWindow} onChange={setStatsWindow} />
        <button
          onClick={handleExportPdf}
          disabled={exporting}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-700/60 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60 transition-colors disabled:opacity-50 touch-manipulation"
        >
          {exporting ? "Generating…" : "Export PDF Report"}
        </button>
      </div>

      <Section title="Overview">
        {overview.loading ? (
          <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
        ) : overview.error || !overview.data ? (
          <div className="text-center text-zinc-600 text-sm py-8">Couldn&apos;t load overview.</div>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiTile label="Total points" value={formatPoints(overview.data.total_points)} />
            <KpiTile label="Contributions" value={overview.data.contribution_count.toLocaleString()} />
            <KpiTile label="Unique participants" value={overview.data.unique_participants.toLocaleString()} />
            <KpiTile
              label="Cleanups"
              value={(overview.data.group_cleanup_count + overview.data.individual_cleanup_count).toLocaleString()}
              sub={`${overview.data.group_cleanup_count} group / ${overview.data.individual_cleanup_count} individual`}
            />
            <KpiTile
              label="Bags collected"
              value={(overview.data.total_small_bags + overview.data.total_large_bags).toLocaleString()}
              sub={`${overview.data.total_small_bags} small / ${overview.data.total_large_bags} large`}
            />
            <KpiTile label="Pounds collected" value={Math.round(overview.data.total_pounds).toLocaleString()} />
            <KpiTile
              label="Trash reports"
              value={overview.data.trash_reports_total.toLocaleString()}
              sub={`${overview.data.trash_reports_open} open / ${overview.data.trash_reports_resolved} resolved`}
            />
            <KpiTile
              label="Partner redemptions"
              value={overview.data.redemption_count.toLocaleString()}
              sub={`${overview.data.active_partner_count} active partners · ${formatPoints(overview.data.points_redeemed)} pts spent`}
            />
          </dl>
        )}
      </Section>

      <Section title="Cleanups">
        {cleanups.loading ? (
          <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
        ) : cleanups.error || !cleanups.data ? (
          <div className="text-center text-zinc-600 text-sm py-8">Couldn&apos;t load cleanup data.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <KpiTile label="RSVPs" value={cleanups.data.rsvp_count.toLocaleString()} />
              <KpiTile label="Going" value={cleanups.data.going_count.toLocaleString()} />
              <KpiTile label="Checked in" value={cleanups.data.checked_in_count.toLocaleString()} />
            </div>
            {cleanups.data.trend.length === 0 ? (
              <div className="text-center text-zinc-600 text-sm py-6">No cleanups in this period.</div>
            ) : (
              <div className="h-64 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cleanups.data.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="bucket" tickFormatter={formatBucketTick} stroke="#71717a" fontSize={11} />
                    <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={formatBucketLabel}
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="group_count" name="Group events" fill={CHART_COLORS.emerald} stackId="a" />
                    <Bar dataKey="individual_count" name="Individual cleanups" fill={CHART_COLORS.sky} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {cleanups.data.map_points.length > 0 && (
              <div className="mb-4">
                <CampaignDashboardMap
                  points={cleanups.data.map_points.map((p) => ({
                    latitude: p.latitude,
                    longitude: p.longitude,
                    color: p.is_group_event ? CHART_COLORS.emerald : CHART_COLORS.sky,
                  }))}
                  legend={[
                    { color: CHART_COLORS.emerald, label: "Group event" },
                    { color: CHART_COLORS.sky, label: "Individual cleanup" },
                  ]}
                />
              </div>
            )}
            {cleanups.data.top_groups.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-500 border-b border-zinc-800">
                      <th className="py-1.5 pr-3">Group</th>
                      <th className="py-1.5 pr-3 text-right">Cleanups</th>
                      <th className="py-1.5 pr-3 text-right">Bags</th>
                      <th className="py-1.5 text-right">Pounds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cleanups.data.top_groups.map((g) => (
                      <tr key={g.group_id} className="border-b border-zinc-900 text-zinc-300">
                        <td className="py-1.5 pr-3">{g.name}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{g.cleanup_count}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{g.small_bags + g.large_bags}</td>
                        <td className="py-1.5 text-right tabular-nums">{Math.round(g.pounds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Routes">
        {routes.loading ? (
          <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
        ) : routes.error || !routes.data ? (
          <div className="text-center text-zinc-600 text-sm py-8">Couldn&apos;t load route data.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <KpiTile label="Cleanups with a route" value={routes.data.routed_cleanup_count.toLocaleString()} />
              <KpiTile label="Total distance" value={`${routes.data.total_distance_miles.toFixed(1)} mi`} />
            </div>
            {routes.data.routes.length === 0 ? (
              <div className="text-center text-zinc-600 text-sm py-6">No logged routes in this period.</div>
            ) : (
              <>
                <div className="mb-4">
                  <CampaignDashboardMap
                    routes={routes.data.routes.map((r) => ({ geojson: r.geojson, color: CHART_COLORS.emerald }))}
                    legend={[{ color: CHART_COLORS.emerald, label: "Logged route" }]}
                  />
                </div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-500 border-b border-zinc-800">
                      <th className="py-1.5 pr-3">Cleanup</th>
                      <th className="py-1.5 text-right">Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.data.routes.map((r) => (
                      <tr key={r.cleanup_id} className="border-b border-zinc-900 text-zinc-300">
                        <td className="py-1.5 pr-3">{r.title}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.distance_miles.toFixed(2)} mi</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </>
        )}
      </Section>

      <Section title="Points & Contributions">
        {trend.loading || breakdown.loading ? (
          <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
        ) : trend.error || breakdown.error || !trend.data || !breakdown.data ? (
          <div className="text-center text-zinc-600 text-sm py-8">Couldn&apos;t load contribution data.</div>
        ) : (
          <>
            {trend.data.trend.length === 0 ? (
              <div className="text-center text-zinc-600 text-sm py-6">No contributions in this period.</div>
            ) : (
              <div className="h-64 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend.data.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="bucket" tickFormatter={formatBucketTick} stroke="#71717a" fontSize={11} />
                    <YAxis stroke="#71717a" fontSize={11} />
                    <Tooltip
                      labelFormatter={formatBucketLabel}
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="total_value" name="Points" stroke={CHART_COLORS.emerald} dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="count" name="Contributions" stroke={CHART_COLORS.sky} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-zinc-500 mb-2">By contribution type</div>
                {breakdown.data.by_type.length === 0 ? (
                  <div className="text-zinc-600 text-xs">No data.</div>
                ) : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={breakdown.data.by_type} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis type="number" stroke="#71717a" fontSize={11} />
                        <YAxis
                          type="category"
                          dataKey="contribution_type"
                          stroke="#71717a"
                          fontSize={11}
                          width={110}
                          tick={<ContributionTypeTick />}
                        />
                        <Tooltip
                          labelFormatter={(label) => formatContributionType(String(label))}
                          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                        />
                        <Bar dataKey="total_value" name="Points" fill={CHART_COLORS.amber} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-500 mb-2">Top contributors</div>
                {breakdown.data.top_contributors.length === 0 ? (
                  <div className="text-zinc-600 text-xs">No data.</div>
                ) : (
                  <div className="max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <tbody>
                        {breakdown.data.top_contributors.slice(0, 10).map((c) => (
                          <tr key={c.user_id} className="border-b border-zinc-900 text-zinc-300">
                            <td className="py-1 pr-3">{c.display_name ?? c.username ?? "Unknown"}</td>
                            <td className="py-1 text-right tabular-nums">{formatPoints(c.total_value)} pts</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </Section>

      <Section title="Trash Reports">
        {trashReports.loading ? (
          <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
        ) : trashReports.error || !trashReports.data ? (
          <div className="text-center text-zinc-600 text-sm py-8">Couldn&apos;t load trash report data.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <KpiTile label="Resolved" value={trashReports.data.resolved_count.toLocaleString()} />
              <KpiTile
                label="Avg. resolution time"
                value={
                  trashReports.data.avg_resolution_hours != null
                    ? `${trashReports.data.avg_resolution_hours.toFixed(1)} hrs`
                    : "—"
                }
              />
            </div>
            {trashReports.data.map_points.length > 0 && (
              <div className="mb-4">
                <CampaignDashboardMap
                  points={trashReports.data.map_points.map((p) => ({
                    latitude: p.latitude,
                    longitude: p.longitude,
                    color: p.status === "resolved" ? CHART_COLORS.emerald : p.status === "open" ? CHART_COLORS.amber : CHART_COLORS.zinc,
                  }))}
                  legend={[
                    { color: CHART_COLORS.amber, label: "Open" },
                    { color: CHART_COLORS.emerald, label: "Resolved" },
                    { color: CHART_COLORS.zinc, label: "Other" },
                  ]}
                />
              </div>
            )}
            {trashReports.data.by_status_severity.length === 0 ? (
              <div className="text-center text-zinc-600 text-sm py-6">No trash reports in this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-500 border-b border-zinc-800">
                      <th className="py-1.5 pr-3">Status</th>
                      <th className="py-1.5 pr-3">Severity</th>
                      <th className="py-1.5 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trashReports.data.by_status_severity.map((r, i) => (
                      <tr key={i} className="border-b border-zinc-900 text-zinc-300">
                        <td className="py-1.5 pr-3 capitalize">{r.status}</td>
                        <td className="py-1.5 pr-3 capitalize">{r.severity}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Partners, Offers & Redemptions">
        {partners.loading ? (
          <div className="text-center text-zinc-600 text-sm py-8">Loading…</div>
        ) : partners.error || !partners.data ? (
          <div className="text-center text-zinc-600 text-sm py-8">Couldn&apos;t load partner data.</div>
        ) : (
          <>
            {partners.data.trend.length > 0 && (
              <div className="h-56 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={partners.data.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="bucket" tickFormatter={formatBucketTick} stroke="#71717a" fontSize={11} />
                    <YAxis yAxisId="redemptions" stroke="#71717a" fontSize={11} allowDecimals={false} />
                    <YAxis yAxisId="offers" orientation="right" stroke="#71717a" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={formatBucketLabel}
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="redemptions" type="monotone" dataKey="redemption_count" name="Redemptions" stroke={CHART_COLORS.emerald} dot={false} strokeWidth={2} />
                    <Line yAxisId="offers" type="stepAfter" dataKey="active_offer_count" name="Active offers" stroke={CHART_COLORS.sky} dot={false} strokeWidth={2} strokeDasharray="4 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-zinc-500 mb-2">Businesses</div>
                {partners.data.businesses.length === 0 ? (
                  <div className="text-zinc-600 text-xs">No linked partners.</div>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {partners.data.businesses.map((b) => (
                        <tr key={b.business_id} className="border-b border-zinc-900 text-zinc-300">
                          <td className="py-1 pr-3">{b.name}</td>
                          <td className="py-1 text-right tabular-nums">{b.redemption_count} redemptions</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-500 mb-2">Top offers</div>
                {partners.data.offers.length === 0 ? (
                  <div className="text-zinc-600 text-xs">No offers.</div>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {partners.data.offers.slice(0, 10).map((o) => (
                        <tr key={o.offer_id} className="border-b border-zinc-900 text-zinc-300">
                          <td className="py-1 pr-3">
                            {o.title}
                            <span className="text-zinc-600"> · {o.business_name}</span>
                          </td>
                          <td className="py-1 text-right tabular-nums">{o.redemption_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </Section>

      <Section title="Geography">
        <GeoStatsExplorer campaignId={campaignId} fastapiUrl={fastapiUrl} unit="pts" />
      </Section>
    </div>
  );
}
