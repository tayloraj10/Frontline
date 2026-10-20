"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note } from "@/components/ui/fields";
import { shareImage } from "@/lib/share";

export interface ImpactStats {
  displayName: string;
  username: string;
  periodLabel: string;
  monthBags: number;
  monthCleanups: number;
  lifetimeBags: number;
  lifetimeCleanups: number;
  streak: number;
  areas: number;
  points: string;
}

const W = 1080;
const H = 1350;

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
async function renderCard(s: ImpactStats): Promise<Blob> {
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
  glow.addColorStop(0, "rgba(251,191,36,0.28)");
  glow.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const font = (px: number, weight = 800) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#fbbf24";
  ctx.font = font(34, 800);
  ctx.fillText("✦ FRONTLINE PLUS", 80, 140);

  ctx.fillStyle = "#fafafa";
  ctx.font = font(84, 800);
  ctx.fillText(s.displayName.length > 18 ? `${s.displayName.slice(0, 17)}…` : s.displayName, 80, 270);
  ctx.fillStyle = "#a1a1aa";
  ctx.font = font(36, 500);
  ctx.fillText(`@${s.username}  ·  ${s.periodLabel}`, 80, 330);

  const grad = ctx.createLinearGradient(80, 0, 700, 0);
  grad.addColorStop(0, "#fde68a");
  grad.addColorStop(1, "#f59e0b");
  ctx.fillStyle = grad;
  ctx.font = font(300, 800);
  ctx.fillText(String(s.monthBags), 70, 640);
  ctx.fillStyle = "#e4e4e7";
  ctx.font = font(44, 700);
  ctx.fillText(s.monthBags === 1 ? "bag of trash picked up this month" : "bags of trash picked up this month", 80, 710);

  const tiles: [string, string][] = [
    [String(s.monthCleanups), "cleanups this month"],
    [String(s.streak), "week streak"],
    [s.lifetimeBags.toLocaleString(), "bags all time"],
    [String(s.areas), s.areas === 1 ? "zip code cleaned" : "zip codes cleaned"],
  ];
  const tileW = (W - 160 - 30) / 2;
  tiles.forEach(([value, label], i) => {
    const x = 80 + (i % 2) * (tileW + 30);
    const y = 800 + Math.floor(i / 2) * 200;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundRect(ctx, x, y, tileW, 170, 32);
    ctx.fill();
    ctx.fillStyle = "#fafafa";
    ctx.font = font(70, 800);
    ctx.fillText(value, x + 36, y + 90);
    ctx.fillStyle = "#a1a1aa";
    ctx.font = font(30, 500);
    ctx.fillText(label, x + 36, y + 134);
  });

  ctx.fillStyle = "#71717a";
  ctx.font = font(32, 500);
  ctx.fillText("Cleaning up our communities, together. Frontline", 80, H - 80);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image."))), "image/png"),
  );
}

/**
 * Monthly recap and shareable impact card (Frontline Plus perk). Everyone sees the recap;
 * sharing the image is the Plus part, so non-members see what they would unlock.
 */
export default function PlusImpactCard({ stats, isPlus }: { stats: ImpactStats; isPlus: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const share = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await renderCard(stats);
      const result = await shareImage(blob, `frontline-${stats.periodLabel.toLowerCase().replace(/\s+/g, "-")}.png`, {
        title: "My Frontline impact",
        text: `${stats.monthBags} bags picked up this month with Frontline.`,
      });
      if (result === "downloaded") setMessage("Saved to your downloads.");
    } catch (err) {
      // A dismissed share sheet rejects with AbortError; that is not a failure.
      if (!(err instanceof Error) || err.name !== "AbortError") setMessage("Could not create the card. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const tiles: [string, string][] = [
    [String(stats.monthCleanups), "cleanups"],
    [String(stats.streak), "week streak"],
    [stats.lifetimeBags.toLocaleString(), "bags all time"],
    [String(stats.areas), "zip codes"],
  ];

  return (
    <Card padding="lg" className="mb-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-extrabold tracking-tight text-zinc-100">Your {stats.periodLabel} recap</h3>
        <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-widest text-amber-300">✦ Plus</span>
      </div>

      <div className="rounded-[20px] bg-gradient-to-br from-zinc-800 to-zinc-950 p-5 ring-1 ring-inset ring-amber-300/20">
        <div className="bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text font-display text-6xl font-extrabold tabular-nums text-transparent">
          {stats.monthBags}
        </div>
        <p className="text-sm text-zinc-300">{stats.monthBags === 1 ? "bag picked up this month" : "bags picked up this month"}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {tiles.map(([value, label]) => (
            <div key={label} className="rounded-2xl bg-white/5 px-3 py-2.5">
              <div className="font-display text-xl font-extrabold tabular-nums text-zinc-50">{value}</div>
              <div className="text-[11px] text-zinc-500">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {isPlus ? (
        <Button className="w-full sm:w-auto" loading={busy} onClick={share}>
          Share this card
        </Button>
      ) : (
        <Note>Plus members can turn this recap into an image and share it. Get Plus above to unlock it.</Note>
      )}
      {message && <p className="text-xs text-zinc-400">{message}</p>}
    </Card>
  );
}
