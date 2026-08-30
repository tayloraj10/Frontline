"use client";

import { useEffect, useState } from "react";
import { formatPoints } from "@/lib/formatPoints";
import { downloadImage, shareImage } from "@/lib/share";
import { canReviewTeamEvent, getTeamEventAdminSummary, type StatsInterval, type TeamEventAdminSummary } from "@/lib/teamEvents";
import { resolveTeamColor } from "@/lib/teamColors";
import { paintCardBackground, CARD_BG_STYLES, type CardBgStyle } from "@/lib/cardBackground";
import ShareCard from "@/components/team-events/ShareCard";

const INTERVALS: { value: StatsInterval; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

interface EventTeam {
  id: string;
  name: string;
  color: string | null;
  logo_url: string | null;
}

interface Props {
  teamEventId: string;
  eventTitle: string;
  eventLogoUrl: string | null;
  teams: EventTeam[];
  userId: string | null;
}

function proxiedImageUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillTruncatedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  let t = text;
  if (ctx.measureText(t).width > maxWidth) {
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    t = `${t}…`;
  }
  ctx.fillText(t, x, y);
}

async function drawCircularLogo(ctx: CanvasRenderingContext2D, url: string, cx: number, cy: number, size: number) {
  try {
    const img = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.stroke();
  } catch {
    // Logo failed to load -- skip it rather than let one bad image blank the whole card.
  }
}

/** Canvas-drawn (not DOM/SVG capture) share card for a single team's standing in a
 * team event -- shows both the event logo and the team's own logo, scoped to only
 * that team's event submissions. See GroupStatsView.tsx's renderShareCardSnapshot
 * for why this is drawn manually instead of captured from the DOM (iOS Safari blanks
 * captured logos). */
async function renderTeamEventShareCard(opts: {
  eventTitle: string;
  eventLogoUrl: string | null;
  teamName: string;
  teamLogoUrl: string | null;
  teamColor: string | null;
  totalValue: number;
  submissionCount: number;
  intervalLabel: string;
  bgStyle: CardBgStyle;
}): Promise<string> {
  const BASE = 360;
  const SCALE = 3;
  const canvas = document.createElement("canvas");
  canvas.width = BASE * SCALE;
  canvas.height = BASE * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.scale(SCALE, SCALE);

  roundRect(ctx, 0, 0, BASE, BASE, 16);
  ctx.clip();

  const teamColor = opts.teamColor || "#065f46";
  paintCardBackground(ctx, BASE, teamColor, opts.bgStyle);

  const pad = 28;
  const logoSize = 40;

  let textX = pad;
  const logos = [opts.eventLogoUrl, opts.teamLogoUrl].filter((u): u is string => !!u);
  if (logos.length > 0) {
    let cx = pad + logoSize / 2;
    const cy = pad + logoSize / 2;
    for (const url of logos) {
      await drawCircularLogo(ctx, url, cx, cy, logoSize);
      cx += logoSize + 8;
    }
    textX = pad + logos.length * logoSize + (logos.length - 1) * 8 + 12;
  }

  const textMaxWidth = BASE - pad - textX;
  ctx.textBaseline = "alphabetic";

  const line1Y = pad + 10;
  ctx.fillStyle = "#fff";
  ctx.font = "700 11px sans-serif";
  fillTruncatedText(ctx, opts.intervalLabel.toUpperCase(), textX, line1Y, textMaxWidth);

  const line2Y = line1Y + 22;
  ctx.fillStyle = "#fafafa";
  ctx.font = "900 20px sans-serif";
  fillTruncatedText(ctx, opts.teamName, textX, line2Y, textMaxWidth);

  const line3Y = line2Y + 16;
  ctx.fillStyle = "#a1a1aa";
  ctx.font = "400 12px sans-serif";
  fillTruncatedText(ctx, opts.eventTitle, textX, line3Y, textMaxWidth);

  const items: { value: string; label: string }[] = [
    { value: formatPoints(opts.totalValue), label: "points" },
    { value: opts.submissionCount.toLocaleString(), label: "submissions" },
  ];

  const gap = 8;
  const cols = 2;
  const cellH = 64;
  const colWidth = (BASE - pad * 2 - gap * (cols - 1)) / cols;
  const headerBottom = pad + logoSize;
  const footerTop = BASE - pad - 14;
  const gridTop = headerBottom + Math.max(0, (footerTop - headerBottom - cellH) / 2);

  ctx.textAlign = "center";
  items.forEach((item, i) => {
    const x = pad + i * (colWidth + gap);
    const cx = x + colWidth / 2;
    const cy = gridTop + cellH / 2;

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, x, gridTop, colWidth, cellH, 8);
    ctx.fill();

    ctx.font = "900 22px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(item.value, cx, cy - 2);

    ctx.font = "600 10px sans-serif";
    ctx.fillStyle = "#d4d4d8";
    ctx.fillText(item.label.toUpperCase(), cx, cy + 18);
  });
  ctx.textAlign = "left";

  ctx.fillStyle = "#fff";
  ctx.font = "900 10px sans-serif";
  ctx.fillText("FRONTLINE", pad, BASE - pad);

  return canvas.toDataURL("image/png");
}

export default function EventShareExportSection({ teamEventId, eventTitle, eventLogoUrl, teams, userId }: Props) {
  const [interval, setInterval] = useState<StatsInterval>("all");
  const [data, setData] = useState<TeamEventAdminSummary | null>(null);
  const [error, setError] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teams[0]?.id ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState<"share" | "download" | null>(null);
  const [bgStyle, setBgStyle] = useState<CardBgStyle>("vertical");
  const [canManage, setCanManage] = useState(false);

  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;

  useEffect(() => {
    if (!userId) return;
    canReviewTeamEvent({ teamEventId, userId }).then(setCanManage).catch(() => setCanManage(false));
  }, [teamEventId, userId]);

  useEffect(() => {
    const controller = new AbortController();
    getTeamEventAdminSummary({ teamEventId, interval, signal: controller.signal })
      .then((summary) => {
        setData(summary);
        setError(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [teamEventId, interval]);

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const selectedTeamStats = data?.teams.find((t) => t.team_id === selectedTeamId) ?? null;

  const intervalLabel = INTERVALS.find((i) => i.value === interval)?.label ?? "All time";

  async function renderCardBlob(): Promise<Blob | null> {
    if (!selectedTeam || !selectedTeamStats) return null;
    const dataUrl = await renderTeamEventShareCard({
      eventTitle,
      eventLogoUrl: eventLogoUrl ? proxiedImageUrl(eventLogoUrl) : null,
      teamName: selectedTeam.name,
      teamLogoUrl: selectedTeam.logo_url ? proxiedImageUrl(selectedTeam.logo_url) : null,
      teamColor: selectedTeam.color ? resolveTeamColor(selectedTeam.color) : null,
      totalValue: selectedTeamStats.total_value,
      submissionCount: selectedTeamStats.submission_count,
      intervalLabel,
      bgStyle,
    });
    const res = await fetch(dataUrl);
    return res.blob();
  }

  function cardFilename(): string {
    const teamSlug = (selectedTeam?.name ?? "team").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `${teamSlug}-${interval}.png`;
  }

  async function handleShareCard() {
    setShareBusy("share");
    try {
      const blob = await renderCardBlob();
      if (!blob) return;
      await shareImage(blob, cardFilename(), { title: `${selectedTeam?.name} · ${eventTitle}` });
    } finally {
      setShareBusy(null);
    }
  }

  async function handleDownloadCard() {
    setShareBusy("download");
    try {
      const blob = await renderCardBlob();
      if (!blob) return;
      await downloadImage(blob, cardFilename(), { title: `${selectedTeam?.name} · ${eventTitle}` });
    } finally {
      setShareBusy(null);
    }
  }

  function exportCsv() {
    const qs = new URLSearchParams({ interval });
    window.open(`${fastapiUrl}/api/team-events/${teamEventId}/export.csv?${qs}`, "_blank");
  }

  function exportXlsx() {
    const qs = new URLSearchParams({ interval });
    window.open(`${fastapiUrl}/api/team-events/${teamEventId}/export.xlsx?${qs}`, "_blank");
  }

  function exportFullCsv() {
    if (!userId) return;
    const qs = new URLSearchParams({ requesting_user_id: userId });
    window.open(`${fastapiUrl}/api/team-events/${teamEventId}/export/full.csv?${qs}`, "_blank");
  }

  function exportFullXlsx() {
    if (!userId) return;
    const qs = new URLSearchParams({ requesting_user_id: userId });
    window.open(`${fastapiUrl}/api/team-events/${teamEventId}/export/full.xlsx?${qs}`, "_blank");
  }

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 mb-4">
        {INTERVALS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`touch-manipulation active:scale-[0.97] shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors ${
              interval === opt.value ? "border-sky-500 text-sky-400 bg-sky-500/10" : "border-zinc-800 text-zinc-500"
            }`}
            onClick={() => setInterval(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400 mb-4">Failed to load export data.</p>}

      {data && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="touch-manipulation active:scale-[0.97] flex-1 text-xs font-semibold text-zinc-200 border border-zinc-800 rounded-lg px-3 py-2"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={exportXlsx}
              className="touch-manipulation active:scale-[0.97] flex-1 text-xs font-semibold text-zinc-200 border border-zinc-800 rounded-lg px-3 py-2"
            >
              Export Excel
            </button>
          </div>

          {teams.length > 0 && (
            <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-950">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Share a team&apos;s card</h3>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full mb-3 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedTeamStats}
                onClick={() => setPreviewOpen(true)}
                className="touch-manipulation active:scale-[0.97] w-full text-xs font-semibold text-sky-400 border border-sky-900 rounded-lg px-3 py-2 disabled:opacity-50"
              >
                Preview card
              </button>
            </div>
          )}

          {previewOpen && selectedTeam && selectedTeamStats && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
              <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-elevation-3">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-300">Share Card</span>
                  <button
                    onClick={() => setPreviewOpen(false)}
                    className="text-zinc-500 hover:text-zinc-300 text-sm touch-manipulation"
                  >
                    Close
                  </button>
                </div>

                <div className="mb-3 flex justify-center">
                  <select
                    value={bgStyle}
                    onChange={(e) => setBgStyle(e.target.value as CardBgStyle)}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 touch-manipulation"
                  >
                    {CARD_BG_STYLES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-center">
                  <ShareCard
                    eventTitle={eventTitle}
                    eventLogoUrl={eventLogoUrl ? proxiedImageUrl(eventLogoUrl) : null}
                    teamName={selectedTeam.name}
                    teamLogoUrl={selectedTeam.logo_url ? proxiedImageUrl(selectedTeam.logo_url) : null}
                    teamColor={selectedTeam.color ? resolveTeamColor(selectedTeam.color) : "#065f46"}
                    intervalLabel={intervalLabel}
                    totalValue={selectedTeamStats.total_value}
                    submissionCount={selectedTeamStats.submission_count}
                    bgStyle={bgStyle}
                  />
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={handleDownloadCard}
                    disabled={shareBusy !== null}
                    className="flex-1 px-3 py-2 text-xs font-medium border border-zinc-700 text-zinc-300 rounded-lg transition-[background-color,border-color] duration-150 hover:border-zinc-500 disabled:opacity-50 touch-manipulation"
                  >
                    {shareBusy === "download" ? "Downloading…" : "Download"}
                  </button>
                  <button
                    onClick={handleShareCard}
                    disabled={shareBusy !== null}
                    className="flex-1 px-3 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg transition-colors duration-150 hover:bg-emerald-500 disabled:opacity-50 touch-manipulation"
                  >
                    {shareBusy === "share" ? "Sharing…" : "Share"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {canManage && (
            <div>
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Organizer export</h3>
              <p className="text-xs text-zinc-600 mb-2">Full raw data for the whole event: all participants and all submissions.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={exportFullCsv}
                  className="touch-manipulation active:scale-[0.97] flex-1 text-xs font-semibold text-zinc-200 border border-zinc-800 rounded-lg px-3 py-2"
                >
                  Full export CSV
                </button>
                <button
                  type="button"
                  onClick={exportFullXlsx}
                  className="touch-manipulation active:scale-[0.97] flex-1 text-xs font-semibold text-zinc-200 border border-zinc-800 rounded-lg px-3 py-2"
                >
                  Full export Excel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
