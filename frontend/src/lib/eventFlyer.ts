// Canvas renderer for the shareable "event flyer" (the bento-card announcement graphic
// cleanup groups post on social media). Drawn straight to a 2D canvas instead of going
// through html-to-image: that DOM/SVG capture blanks images on iOS Safari and can never
// capture a WebGL map canvas anyway (same reasoning as GroupStatsView's share card).
import { SOCIAL_ICON_PATHS } from "@/components/ui/SocialIcon";

export const FLYER_W = 1080;
export const FLYER_H = 1350;

const PAD = 36;
const GAP = 24;
const RADIUS = 44;
const INNER_W = FLYER_W - PAD * 2;
const INNER_H = FLYER_H - PAD * 2;
const LEFT_W = 590;
const RIGHT_W = INNER_W - LEFT_W - GAP;

type Rect = { x: number; y: number; w: number; h: number };

function splitColumn(x: number, w: number, ratios: number[]): Rect[] {
  const avail = INNER_H - GAP * (ratios.length - 1);
  const total = ratios.reduce((a, b) => a + b, 0);
  let y = PAD;
  return ratios.map((r) => {
    const h = Math.round((avail * r) / total);
    const rect = { x, y, w, h };
    y += h + GAP;
    return rect;
  });
}

const LEFT = splitColumn(PAD, LEFT_W, [0.6, 0.26, 0.14]);
const RIGHT = splitColumn(PAD + LEFT_W + GAP, RIGHT_W, [0.5, 0.5]);

export const FLYER_RECTS = {
  title: LEFT[0],
  date: LEFT[1],
  handle: LEFT[2],
  details: RIGHT[0],
  map: RIGHT[1],
};

/** Aspect ratio (w / h) of the map tile, so the live framing map can match it exactly. */
export const FLYER_MAP_ASPECT = FLYER_RECTS.map.w / FLYER_RECTS.map.h;

/** Shown in the top-right card when the organizer has no description or meetup details. */
const GENERIC_BLURB = "Grab a bag, bring a friend, and help make the neighborhood cleaner. Everyone is welcome.";

export type FlyerPalette = {
  id: string;
  label: string;
  bg: string;
  cardA: string;
  cardB: string;
  cardC: string;
  text: string;
};

export const FLYER_PALETTES: FlyerPalette[] = [
  // Vibrant
  { id: "grape", label: "Grape", bg: "#5a33c8", cardA: "#dccbf2", cardB: "#c8e8b6", cardC: "#ffffff", text: "#26106b" },
  { id: "electric", label: "Electric", bg: "#2438ff", cardA: "#ffe600", cardB: "#ff8cc4", cardC: "#ffffff", text: "#0d124d" },
  { id: "tangerine", label: "Tangerine", bg: "#f0560a", cardA: "#fff0d4", cardB: "#ffe066", cardC: "#ffffff", text: "#3a1500" },
  { id: "berry", label: "Berry", bg: "#c2105f", cardA: "#ffd0e6", cardB: "#ffe45e", cardC: "#ffffff", text: "#4a0a2c" },
  // Pastel
  { id: "lavender", label: "Lavender", bg: "#9d83e0", cardA: "#f4eeff", cardB: "#c9f2b4", cardC: "#ffffff", text: "#25134f" },
  { id: "peach", label: "Peach", bg: "#ee8456", cardA: "#fff1e8", cardB: "#ffe08a", cardC: "#ffffff", text: "#4d200c" },
  { id: "mint", label: "Mint", bg: "#55bf96", cardA: "#eafaf2", cardB: "#fff0a8", cardC: "#ffffff", text: "#0d3a30" },
  { id: "sky", label: "Sky", bg: "#5ca5ea", cardA: "#eaf5ff", cardB: "#ffd3e1", cardC: "#ffffff", text: "#0e2f55" },
];

export type LogoCorner = "off" | "tl" | "tr" | "bl" | "br" | "center";

export type FlyerOptions = {
  palette: FlyerPalette;
  title: string;
  meetLabel: string;
  venue: string;
  address: string;
  meetNote: string;
  /** Optional "where exactly to meet" text. Empty hides the card. */
  meetDetails: string;
  details: string;
  dateLine: string;
  timeLine: string;
  /** Already formatted, e.g. "@bushwicklitterpickers". Empty hides the text. */
  handle: string;
  /** Platform key for the handle icon (instagram, tiktok, website...). */
  handlePlatform?: string;
  mapImage: CanvasImageSource | null;
  /** Hosting group logo first, then any partner groups. */
  logoUrls: string[];
  logoCorner: LogoCorner;
  /** e.g. "in partnership with StashMaster". Empty hides it. */
  partnerLine: string;
  /** Ring color around the logo badges (white on routes, sky on a point pin). */
  logoRing: string;
};

const FONT = `"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const { x, y, w, h } = r;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillCard(ctx: CanvasRenderingContext2D, r: Rect, color: string) {
  roundRectPath(ctx, r, RADIUS);
  ctx.fillStyle = color;
  ctx.fill();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawSocialIcon(ctx: CanvasRenderingContext2D, platform: string, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  const d = SOCIAL_ICON_PATHS[platform.toLowerCase()];
  if (d && platform !== "website") {
    ctx.fillStyle = color;
    ctx.fill(new Path2D(d));
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(12, 12, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.stroke(new Path2D("M3 12h18M12 3c2.5 2.700 3.800 5.700 3.800 9s-1.300 6.300-3.800 9c-2.500-2.700-3.800-5.700-3.800-9S9.500 5.700 12 3z"));
  }
  ctx.restore();
}

type FitOpts = {
  box: Rect;
  maxSize: number;
  minSize: number;
  weight: number;
  color: string;
  align?: "left" | "center";
  valign?: "top" | "middle" | "bottom";
  lineHeight?: number;
  upper?: boolean;
};

/** Draws wrapped text at the largest size that fits the box; at the minimum size it clips with an ellipsis. */
function drawFitted(ctx: CanvasRenderingContext2D, rawText: string, o: FitOpts) {
  const text = o.upper ? rawText.toUpperCase() : rawText;
  if (!text.trim()) return;
  const lh = o.lineHeight ?? 1.18;
  let size = o.maxSize;
  let lines: string[] = [];
  for (; size >= o.minSize; size -= 2) {
    ctx.font = `${o.weight} ${size}px ${FONT}`;
    lines = wrapLines(ctx, text, o.box.w);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length * size * lh <= o.box.h && widest <= o.box.w) break;
  }
  size = Math.max(size, o.minSize);
  ctx.font = `${o.weight} ${size}px ${FONT}`;
  lines = wrapLines(ctx, text, o.box.w);
  const maxLines = Math.max(1, Math.floor(o.box.h / (size * lh)));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}...`).width > o.box.w) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}...`;
  }
  // A single unbreakable word can still be wider than the box at the minimum size: clip it
  lines = lines.map((line) => {
    if (ctx.measureText(line).width <= o.box.w) return line;
    let l = line;
    while (l.length > 1 && ctx.measureText(`${l}...`).width > o.box.w) l = l.slice(0, -1);
    return `${l}...`;
  });
  const blockH = lines.length * size * lh;
  const startY =
    o.valign === "middle" ? o.box.y + (o.box.h - blockH) / 2 : o.valign === "bottom" ? o.box.y + o.box.h - blockH : o.box.y;
  ctx.fillStyle = o.color;
  ctx.textBaseline = "top";
  ctx.textAlign = o.align ?? "left";
  const x = o.align === "center" ? o.box.x + o.box.w / 2 : o.box.x;
  lines.forEach((line, i) => {
    ctx.fillText(line, x, startY + i * size * lh + (size * lh - size) / 2);
  });
}

function loadImageOnce(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/** CORS-clean image load. A prior non-CORS fetch of the same URL can poison the browser cache, so retry with a cache-busting param. */
export async function loadFlyerImage(src: string): Promise<HTMLImageElement | null> {
  try {
    return await loadImageOnce(src);
  } catch {
    try {
      return await loadImageOnce(`${src}${src.includes("?") ? "&" : "?"}flyer=1`);
    } catch {
      return null;
    }
  }
}

export async function renderEventFlyer(opts: FlyerOptions): Promise<HTMLCanvasElement> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // fall through with whatever fonts are available
    }
  }
  const p = opts.palette;
  const canvas = document.createElement("canvas");
  canvas.width = FLYER_W;
  canvas.height = FLYER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, FLYER_W, FLYER_H);

  // Load logos once: hosting group first, then partners
  const logoImgs = (await Promise.all(opts.logoUrls.map((u) => loadFlyerImage(u)))).filter(
    (im): im is HTMLImageElement => !!im,
  );

  // Title card: a bold band with the group name (+ logos, partnership line), then the event
  // note and the "Meet at" block when an address exists
  const t = FLYER_RECTS.title;
  fillCard(ctx, t, p.cardA);
  const ix = t.x + 44;
  const iw = t.w - 88;
  const showMeet = opts.venue.trim() !== "";

  const HOST = 140;
  const PARTNER = 96;
  const hasLogos = logoImgs.length > 0;
  const partners = logoImgs.slice(1);
  const logoColW = hasLogos ? HOST + 28 : 0;
  const drawBadge = (img: HTMLImageElement, cx: number, cy: number, size: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - 3, 0, Math.PI * 2);
    ctx.clip();
    const sc = Math.max((size - 6) / img.width, (size - 6) / img.height);
    ctx.drawImage(img, cx - (img.width * sc) / 2, cy - (img.height * sc) / 2, img.width * sc, img.height * sc);
    ctx.restore();
  };

  const top = t.y + 44;
  const avail = t.h - 88;
  const nameH = avail * (showMeet ? 0.27 : 0.3);
  const hasPartnerRow = !!opts.partnerLine && partners.length > 0;
  const partnerRowH = hasPartnerRow ? PARTNER : 0;
  const bandPadB = 34;
  let bandBottom = top + nameH + (hasPartnerRow ? 14 + partnerRowH : 0) + bandPadB;
  if (hasLogos) bandBottom = Math.max(bandBottom, top + HOST + bandPadB);

  // Band fill (text color) with rounded top corners matching the card
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(t.x, bandBottom);
  ctx.lineTo(t.x, t.y + RADIUS);
  ctx.arcTo(t.x, t.y, t.x + RADIUS, t.y, RADIUS);
  ctx.lineTo(t.x + t.w - RADIUS, t.y);
  ctx.arcTo(t.x + t.w, t.y, t.x + t.w, t.y + RADIUS, RADIUS);
  ctx.lineTo(t.x + t.w, bandBottom);
  ctx.closePath();
  ctx.fillStyle = p.text;
  ctx.fill();
  ctx.restore();

  if (hasLogos) drawBadge(logoImgs[0], t.x + t.w - 44 - HOST / 2, top + HOST / 2, HOST);

  drawFitted(ctx, opts.title, {
    box: { x: ix, y: top, w: iw - logoColW, h: nameH },
    maxSize: 124,
    minSize: 44,
    weight: 800,
    color: p.cardA,
    upper: true,
    lineHeight: 1.05,
    valign: "top",
  });
  if (hasPartnerRow) {
    const rowY = top + nameH + 14;
    const pStep = PARTNER * 0.72;
    const logosW = PARTNER + pStep * (partners.length - 1) + 18;
    partners.forEach((img, k) => drawBadge(img, ix + PARTNER / 2 + k * pStep, rowY + partnerRowH / 2, PARTNER));
    drawFitted(ctx, opts.partnerLine, {
      box: { x: ix + logosW, y: rowY, w: iw - logosW - (rowY < top + HOST ? logoColW : 0), h: partnerRowH },
      maxSize: 34,
      minSize: 18,
      weight: 600,
      color: p.cardA,
      valign: "middle",
      lineHeight: 1.1,
    });
  } else if (opts.partnerLine) {
    drawFitted(ctx, opts.partnerLine, {
      box: { x: ix, y: top + nameH + 10, w: iw - (top + nameH + 10 < top + HOST ? logoColW : 0), h: 40 },
      maxSize: 34,
      minSize: 18,
      weight: 600,
      color: p.cardA,
      valign: "middle",
      lineHeight: 1.1,
    });
  }

  // "Meet at" block is anchored to the bottom of the card so the street and the city line sit together
  const blockBottom = t.y + t.h - 44;
  const addrY = blockBottom - 36;
  const venueY = addrY - 72;
  const labelY = venueY - 38;
  const divY = labelY - 22;
  const noteTop = bandBottom + 28;
  const noteBottom = showMeet ? divY - 24 : t.y + t.h - 44;
  if (opts.meetNote.trim() && noteBottom - noteTop > 40) {
    drawFitted(ctx, opts.meetNote, {
      box: { x: ix, y: noteTop, w: iw, h: noteBottom - noteTop },
      maxSize: showMeet ? 64 : 76,
      minSize: 26,
      weight: 700,
      color: p.text,
      valign: "middle",
      lineHeight: 1.12,
    });
  }
  if (showMeet) {
    ctx.fillStyle = p.text;
    ctx.fillRect(ix, divY, iw, 5);
    drawFitted(ctx, opts.meetLabel, {
      box: { x: ix, y: labelY, w: iw, h: 34 },
      maxSize: 30,
      minSize: 22,
      weight: 400,
      color: p.text,
    });
    drawFitted(ctx, opts.venue, {
      box: { x: ix, y: venueY, w: iw, h: 70 },
      maxSize: 58,
      minSize: 28,
      weight: 700,
      color: p.text,
      lineHeight: 1.1,
    });
    drawFitted(ctx, opts.address, {
      box: { x: ix, y: addrY, w: iw, h: 36 },
      maxSize: 30,
      minSize: 16,
      weight: 400,
      color: p.text,
    });
  }

  // Date card
  const h = FLYER_RECTS.handle;
  // No handle: drop that card and let the date card use its space
  const d = opts.handle ? FLYER_RECTS.date : { ...FLYER_RECTS.date, h: h.y + h.h - FLYER_RECTS.date.y };
  fillCard(ctx, d, p.cardB);
  drawFitted(ctx, opts.dateLine, {
    box: { x: d.x + 44, y: d.y + 36, w: d.w - 88, h: d.h * 0.24 },
    maxSize: 56,
    minSize: 30,
    weight: 800,
    color: p.text,
    upper: true,
    valign: "middle",
  });
  drawFitted(ctx, opts.timeLine, {
    box: { x: d.x + 44, y: d.y + d.h * 0.36, w: d.w - 88, h: d.h * 0.52 },
    maxSize: 150,
    minSize: 36,
    weight: 800,
    color: p.text,
    upper: true,
    valign: "middle",
    lineHeight: 1,
  });

  // Handle pill
  if (opts.handle) {
    fillCard(ctx, h, p.cardC);
    const iconSize = Math.min(64, h.h - 40);
    const showIcon = !!opts.handlePlatform;
    if (showIcon) drawSocialIcon(ctx, opts.handlePlatform!, h.x + 44, h.y + (h.h - iconSize) / 2, iconSize, p.text);
    const iconW = showIcon ? iconSize + 20 : 0;
    drawFitted(ctx, opts.handle, {
      box: { x: h.x + 44 + iconW, y: h.y + 16, w: h.w - 88 - iconW, h: h.h - 32 },
      maxSize: 56,
      minSize: 26,
      weight: 700,
      color: p.text,
      valign: "middle",
      lineHeight: 1.1,
    });
  }

  // Details column: a meeting details card (only when entered) shares the space with the details card
  const e = FLYER_RECTS.details;
  const hasMeetDetails = opts.meetDetails.trim() !== "";
  const hasDetails = opts.details.trim() !== "";
  if (hasMeetDetails) {
    const mh = hasDetails ? Math.round((e.h - GAP) * 0.42) : e.h;
    const mr = { ...e, h: mh };
    fillCard(ctx, mr, p.cardB);
    drawFitted(ctx, opts.meetDetails, {
      box: { x: mr.x + 28, y: mr.y + 22, w: mr.w - 56, h: mr.h - 44 },
      maxSize: 40,
      minSize: 20,
      weight: 600,
      color: p.text,
      align: "center",
      valign: "middle",
      lineHeight: 1.2,
    });
    if (hasDetails) {
      const dr = { ...e, y: e.y + mh + GAP, h: e.h - mh - GAP };
      fillCard(ctx, dr, p.cardA);
      drawFitted(ctx, opts.details, {
        box: { x: dr.x + 28, y: dr.y + 22, w: dr.w - 56, h: dr.h - 44 },
        maxSize: 34,
        minSize: 18,
        weight: 700,
        color: p.text,
        align: "center",
        valign: "middle",
        lineHeight: 1.25,
      });
    }
  } else if (hasDetails) {
    fillCard(ctx, e, p.cardA);
    drawFitted(ctx, opts.details, {
      box: { x: e.x + 28, y: e.y + 28, w: e.w - 56, h: e.h - 56 },
      maxSize: 38,
      minSize: 20,
      weight: 700,
      color: p.text,
      align: "center",
      valign: "middle",
      lineHeight: 1.25,
    });
  } else {
    fillCard(ctx, e, p.cardA);
    drawFitted(ctx, GENERIC_BLURB, {
      box: { x: e.x + 36, y: e.y + 28, w: e.w - 72, h: e.h - 56 },
      maxSize: 44,
      minSize: 20,
      weight: 700,
      color: p.text,
      align: "center",
      valign: "middle",
      lineHeight: 1.2,
    });
  }

  // Map tile (the live framing map is the same aspect ratio, so this is a straight scale)
  const mp = FLYER_RECTS.map;
  ctx.save();
  roundRectPath(ctx, mp, RADIUS);
  ctx.clip();
  ctx.fillStyle = "#d4d4d8";
  ctx.fillRect(mp.x, mp.y, mp.w, mp.h);
  if (opts.mapImage) ctx.drawImage(opts.mapImage, mp.x, mp.y, mp.w, mp.h);
  ctx.restore();

  // Group + partner logos over the map, overlapping in a row anchored to the chosen corner
  if (opts.logoUrls.length > 0 && opts.logoCorner !== "off") {
    const loaded = logoImgs;
    if (loaded.length > 0) {
      const size = loaded.length > 2 ? 72 : loaded.length > 1 ? 80 : 92;
      const inset = 18;
      const step = loaded.length > 1 ? size * 0.72 : size;
      const rowW = size + step * (loaded.length - 1);
      const corner = opts.logoCorner;
      const startX =
        corner === "tr" || corner === "br"
          ? mp.x + mp.w - rowW - inset
          : corner === "center"
            ? mp.x + (mp.w - rowW) / 2
            : mp.x + inset;
      const ly =
        corner === "bl" || corner === "br"
          ? mp.y + mp.h - size - inset
          : corner === "center"
            ? mp.y + (mp.h - size) / 2
            : mp.y + inset;
      loaded.forEach((img, i) => {
        const lx = startX + i * step;
        const cx = lx + size / 2;
        const cy = ly + size / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2 + 5, 0, Math.PI * 2);
        ctx.fillStyle = opts.logoRing;
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.clip();
        const sc = Math.max(size / img.width, size / img.height);
        ctx.drawImage(img, cx - (img.width * sc) / 2, cy - (img.height * sc) / 2, img.width * sc, img.height * sc);
        ctx.restore();
      });
    }
  }

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** Pulls a display handle out of a stored social link (full URL or bare handle). */
export function handleFromLink(platform: string, raw: string | null | undefined): string {
  if (!raw) return "";
  const value = raw.trim();
  if (platform === "website") {
    return value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  }
  const stripped = value.replace(/^https?:\/\/(www\.)?[^/]+\/+/, "").replace(/^@/, "").replace(/\/$/, "");
  return stripped ? `@${stripped}` : "";
}

export function formatFlyerDate(iso: string | null): { dateLine: string; timeLine: string } {
  if (!iso) return { dateLine: "Date TBD", timeLine: "" };
  const d = new Date(iso);
  const dateLine = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timeLine = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(/\s/g, "");
  return { dateLine, timeLine };
}
