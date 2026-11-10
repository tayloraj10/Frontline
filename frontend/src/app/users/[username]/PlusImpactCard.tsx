"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { shareImage } from "@/lib/share";

export interface RecapMonth {
  /** "2026-10", sortable. */
  key: string;
  label: string;
  monthName: string;
  bags: number;
  cleanups: number;
  /** Bags picked up on each day of the month (index 0 is the 1st). */
  days: number[];
}

type Theme = "amber" | "emerald" | "sky";

const THEMES: Record<Theme, { label: string; accent: string; accent2: string; glow: string; swatch: string }> = {
  amber: { label: "Gold", accent: "#fde68a", accent2: "#f59e0b", glow: "251,191,36", swatch: "bg-amber-400" },
  emerald: { label: "Green", accent: "#a7f3d0", accent2: "#10b981", glow: "52,211,153", swatch: "bg-emerald-400" },
  sky: { label: "Blue", accent: "#bae6fd", accent2: "#0ea5e9", glow: "56,189,248", swatch: "bg-sky-400" },
};

const W = 1080;
const BAG_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

interface Recap {
  month: RecapMonth;
  delta: string | null;
  badges: string[];
  bestDay: { bags: number; day: number } | null;
  activeDays: number;
  allTimeBags: number;
}

/** Derives everything shown for one month: comparison to the previous month, badges, and the waterways line. */
function buildRecap(months: RecapMonth[], idx: number): Recap {
  const month = months[idx];
  const [y, m] = month.key.split("-").map(Number);
  const prevKey = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const prev = months.find((x) => x.key === prevKey);
  const earlier = months.filter((x) => x.key < month.key);
  const bagsBefore = earlier.reduce((a, x) => a + x.bags, 0);
  const allTimeBags = bagsBefore + month.bags;

  let delta: string | null = null;
  if (prev && prev.bags > 0 && month.bags > 0) {
    const pct = Math.round(((month.bags - prev.bags) / prev.bags) * 100);
    delta = pct === 0 ? `Same as ${prev.monthName}` : `${pct > 0 ? "Up" : "Down"} ${Math.abs(pct)}% from ${prev.monthName}`;
  }

  const badges: string[] = [];
  if (month.bags > 0 && earlier.length > 0 && earlier.every((x) => x.bags < month.bags)) badges.push("Best month yet");
  if (month.bags > 0 && bagsBefore === 0) badges.push("First cleanup month");
  for (const t of BAG_MILESTONES) if (bagsBefore < t && allTimeBags >= t) badges.push(`${t} bags all time`);

  const peak = Math.max(...month.days);
  const bestDay = peak > 0 ? { bags: peak, day: month.days.indexOf(peak) + 1 } : null;

  return {
    month,
    delta,
    badges,
    bestDay,
    activeDays: month.days.filter((d) => d > 0).length,
    allTimeBags,
  };
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

/** Renders the shareable card to a PNG. Plain canvas, no remote images, so it never taints. */
async function renderCard(r: Recap, who: { displayName: string; username: string }, theme: Theme): Promise<Blob> {
  const H = 1350;
  const t = THEMES[theme];
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported on this device.");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#18181b");
  bg.addColorStop(1, "#0a0a0c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 760);
  glow.addColorStop(0, `rgba(${t.glow},0.28)`);
  glow.addColorStop(1, `rgba(${t.glow},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const font = (px: number, weight = 800) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "alphabetic";

  const L = { head: 130, name: 250, nameSize: 80, sub: 310, num: 590, numSize: 280, cap: 650, delta: 706, chart: 790, chartH: 270, tiles: 1120, tileH: 130 };

  ctx.fillStyle = t.accent2;
  ctx.font = font(32, 800);
  ctx.fillText("✦ FRONTLINE PLUS", 80, L.head);

  ctx.fillStyle = "#fafafa";
  ctx.font = font(L.nameSize, 800);
  ctx.fillText(who.displayName.length > 18 ? `${who.displayName.slice(0, 17)}…` : who.displayName, 80, L.name);
  ctx.fillStyle = "#a1a1aa";
  ctx.font = font(34, 500);
  ctx.fillText(`@${who.username}  ·  ${r.month.label}`, 80, L.sub);

  const grad = ctx.createLinearGradient(80, 0, 700, 0);
  grad.addColorStop(0, t.accent);
  grad.addColorStop(1, t.accent2);
  ctx.fillStyle = grad;
  ctx.font = font(L.numSize, 800);
  ctx.fillText(String(r.month.bags), 70, L.num);
  ctx.fillStyle = "#e4e4e7";
  ctx.font = font(42, 700);
  ctx.fillText(r.month.bags === 1 ? "bag of trash picked up" : "bags of trash picked up", 80, L.cap);

  const tag = r.delta ?? r.badges[0];
  if (tag) {
    ctx.fillStyle = t.accent;
    ctx.font = font(36, 700);
    ctx.fillText(r.delta && r.badges[0] ? `${r.delta}  ·  ${r.badges[0]}` : tag, 80, L.delta);
  }

  // Daily bars: one per day of the month, tallest day fills the height.
  const peak = Math.max(1, ...r.month.days);
  const n = r.month.days.length;
  const gap = 6;
  const barW = (W - 160 - gap * (n - 1)) / n;
  r.month.days.forEach((v, i) => {
    const x = 80 + i * (barW + gap);
    const h = v > 0 ? Math.max(10, (v / peak) * L.chartH) : 6;
    ctx.fillStyle = v > 0 ? t.accent2 : "rgba(255,255,255,0.10)";
    roundRect(ctx, x, L.chart + L.chartH - h, barW, h, Math.min(5, barW / 2));
    ctx.fill();
  });

  const tiles: [string, string][] = [
    [String(r.month.cleanups), r.month.cleanups === 1 ? "cleanup" : "cleanups"],
    [String(r.activeDays), r.activeDays === 1 ? "active day" : "active days"],
    [r.allTimeBags.toLocaleString(), "bags all time"],
  ];
  const tileW = (W - 160 - 40) / 3;
  tiles.forEach(([value, label], i) => {
    const x = 80 + i * (tileW + 20);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundRect(ctx, x, L.tiles, tileW, L.tileH, 28);
    ctx.fill();
    ctx.fillStyle = "#fafafa";
    ctx.font = font(52, 800);
    ctx.fillText(value, x + 28, L.tiles + L.tileH * 0.52);
    ctx.fillStyle = "#a1a1aa";
    ctx.font = font(26, 500);
    ctx.fillText(label, x + 28, L.tiles + L.tileH * 0.82);
  });

  ctx.fillStyle = "#71717a";
  ctx.font = font(28, 500);
  ctx.fillText("Cleaning up our communities, together. Frontline", 80, H - 50);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image."))), "image/png"),
  );
}

/** Monthly recap for Frontline Plus members: pick any month, see how it compares, and share it as an image. */
export default function PlusImpactCard({
  displayName,
  username,
  months,
}: {
  displayName: string;
  username: string;
  months: RecapMonth[];
}) {
  const [idx, setIdx] = useState(0);
  const [theme, setTheme] = useState<Theme>("amber");
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const recap = useMemo(() => buildRecap(months, idx), [months, idx]);
  const t = THEMES[theme];
  const { month } = recap;
  const peak = Math.max(1, ...month.days);

  const run = async (kind: "share" | "save") => {
    setBusy(kind);
    setMessage(null);
    try {
      const blob = await renderCard(recap, { displayName, username }, theme);
      const filename = `frontline-${month.key}.png`;
      if (kind === "save") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage("Saved to your downloads.");
      } else {
        const result = await shareImage(blob, filename, {
          title: "My Frontline impact",
          text: `${month.bags} ${month.bags === 1 ? "bag" : "bags"} picked up in ${month.monthName} with Frontline.`,
        });
        if (result === "downloaded") setMessage("Saved to your downloads.");
      }
    } catch (err) {
      // A dismissed share sheet rejects with AbortError; that is not a failure.
      if (!(err instanceof Error) || err.name !== "AbortError") setMessage("Could not create the card. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const chip = (active: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset touch-manipulation transition-colors ${
      active ? "bg-amber-300 text-amber-950 ring-amber-200" : "bg-zinc-800 text-zinc-300 ring-white/10 hover:bg-zinc-700"
    }`;

  const tiles: [string, string][] = [
    [String(month.cleanups), month.cleanups === 1 ? "cleanup" : "cleanups"],
    [String(recap.activeDays), recap.activeDays === 1 ? "active day" : "active days"],
    [recap.bestDay ? String(recap.bestDay.bags) : "0", recap.bestDay ? `bags on ${month.monthName.slice(0, 3)} ${recap.bestDay.day}` : "best day"],
    [recap.allTimeBags.toLocaleString(), "bags all time"],
  ];

  return (
    <Card padding="lg" className="mb-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-extrabold tracking-tight text-zinc-100">Your recap</h3>
        <select
          value={idx}
          onChange={(e) => {
            setIdx(Number(e.target.value));
            setMessage(null);
          }}
          aria-label="Choose a month"
          className="min-h-10 rounded-2xl bg-zinc-800 px-3 text-sm font-semibold text-zinc-100 ring-1 ring-inset ring-white/10"
        >
          {months.map((m, i) => (
            <option key={m.key} value={i}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-[20px] bg-gradient-to-br from-zinc-800 to-zinc-950 p-5 ring-1 ring-inset ring-amber-300/20">
        <div className="flex items-baseline gap-3">
          <div
            className="bg-clip-text font-display text-6xl font-extrabold tabular-nums text-transparent"
            style={{ backgroundImage: `linear-gradient(90deg, ${t.accent}, ${t.accent2})` }}
          >
            {month.bags}
          </div>
          <p className="text-sm text-zinc-300">{month.bags === 1 ? "bag picked up" : "bags picked up"}</p>
        </div>

        {(recap.delta || recap.badges.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recap.delta && <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-100">{recap.delta}</span>}
            {recap.badges.map((b) => (
              <span key={b} className="rounded-full bg-amber-300/15 px-2.5 py-1 text-xs font-semibold text-amber-200">
                ✦ {b}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex h-16 items-end gap-[2px]" role="img" aria-label="Bags picked up each day of the month">
          {month.days.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-[2px]"
              style={{ height: v > 0 ? `${Math.max(12, (v / peak) * 100)}%` : "4px", background: v > 0 ? t.accent2 : "rgba(255,255,255,0.1)" }}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map(([value, label]) => (
            <div key={label} className="rounded-2xl bg-white/5 px-3 py-2.5">
              <div className="font-display text-xl font-extrabold tabular-nums text-zinc-50">{value}</div>
              <div className="text-[11px] text-zinc-500">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(THEMES) as Theme[]).map((k) => (
            <button key={k} type="button" onClick={() => setTheme(k)} aria-pressed={theme === k} className={chip(theme === k)}>
              <span className={`h-2.5 w-2.5 rounded-full ${THEMES[k].swatch}`} />
              {THEMES[k].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="flex-1 sm:flex-none" loading={busy === "share"} onClick={() => run("share")}>
            Share
          </Button>
          <Button variant="secondary" className="flex-1 sm:flex-none" loading={busy === "save"} onClick={() => run("save")}>
            Save image
          </Button>
        </div>
        {message && <p className="text-xs text-zinc-400">{message}</p>}
      </div>
    </Card>
  );
}
