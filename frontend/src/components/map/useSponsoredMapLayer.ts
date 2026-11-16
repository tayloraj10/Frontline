"use client";


import { distanceLabel, limitLabel } from "@/lib/distance";
import { minLargeBags } from "@/lib/sponsoredBags";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import maplibregl from "maplibre-gl";
import { getPosition } from "@/lib/getPosition";
import { circleRing } from "@/lib/areaShape";
import { saveMapReturn } from "@/lib/mapReturn";
import { flashRow } from "@/lib/flashRow";

/** The map the popups currently belong to, so a popup link can save its camera. */
let activeMap: maplibregl.Map | null = null;

/**
 * Payments v2 sponsored areas on the map. One fetch per mount from the allowlisted proxy;
 * a 401/403/404 (payments not visible to this viewer) leaves `available` false so the
 * Layers toggle never renders. Sites are tappable pin markers with a dollar tag, group areas are
 * dashed outlines with a light fill. On by default; the caller owns the toggle.
 */

type PayoutRule = { type: string; amount_cents?: number; cents_per_bag?: number; one_winner?: boolean };

/** Where a pool is in its Plus lead window. Scheduled ones are only returned to their sponsor. */
interface WindowInfo {
  early_access?: boolean;
  early_access_until?: string | null;
  early_access_locked?: boolean;
  scheduled?: boolean;
  opens_at?: string | null;
  plus_opens_at?: string | null;
}

const whenText = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

/** One line for the popup and list: null when the pool is simply open to everyone. */
function windowLine(w: WindowInfo): { text: string; color: string } | null {
  if (w.scheduled) {
    return { text: `Scheduled. Plus members see it ${whenText(w.plus_opens_at)}, everyone ${whenText(w.opens_at)}.`, color: "#fbbf24" };
  }
  if (w.early_access_locked) {
    return { text: `✦ Plus members only until ${whenText(w.early_access_until)}, then open to everyone.`, color: "#c4b5fd" };
  }
  if (w.early_access) {
    return { text: `✦ Plus early access until ${whenText(w.early_access_until)}. Opens to everyone then.`, color: "#c4b5fd" };
  }
  return null;
}

interface MapSite extends WindowInfo {
  id: string;
  label: string | null;
  remaining_cents: number;
  payout_rule: PayoutRule;
  open_to_additions?: boolean;
  is_mine?: boolean;
  claimed_by_me?: boolean;
  radius_meters?: number | null;
  latitude: number;
  longitude: number;
  available: boolean;
  /** Set when this site was funded by a crowdfund pool. */
  pool_id?: string | null;
}

/** A crowdfund pool still raising its goal. Not claimable yet. */
interface MapPool {
  id: string;
  title: string;
  place: string | null;
  model: "site" | "group_area";
  goal_cents: number;
  raised_cents: number;
  deadline: string | null;
  latitude: number;
  longitude: number;
}

interface MapArea extends WindowInfo {
  id: string;
  area_name: string | null;
  remaining_cents: number;
  payout_rule: PayoutRule;
  open_to_additions?: boolean;
  is_mine?: boolean;
  pool_id?: string | null;
  geometry: GeoJSON.Geometry;
}

/** Fired by the sites list to ask the map to open one site's popup. */
export const SPONSORED_FOCUS_EVENT = "sponsored-map-focus";
/** Fired after a claim so the sites list and map data reload. */
export const SPONSORED_CHANGED_EVENT = "sponsored-sites-changed";

const SOURCE_ID = "sponsored-areas";
const FILL_ID = "sponsored-areas-fill";
const LINE_ID = "sponsored-areas-line";
const RING_SOURCE_ID = "sponsored-site-rings";
const RING_FILL_ID = "sponsored-site-rings-fill";
const RING_LINE_ID = "sponsored-site-rings-line";
const COLOR = "#34d399";
// Pools you funded read yellow everywhere, matching your own job pins.
const MINE_COLOR = "#fcd34d";
const DEFAULT_CLAIM_RADIUS_M = 152;

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

function ruleParts(rule: PayoutRule): { amount: string; caption: string } {
  if (rule.type === "per_bag") return { amount: usd(rule.cents_per_bag ?? 0), caption: "per bag, once a day per person" };
  if (rule.type === "equal_split") return { amount: usd(rule.amount_cents ?? 0), caption: "per attendee, while funds last" };
  if (rule.one_winner) return { amount: usd(rule.amount_cents ?? 0), caption: "to the first verified cleanup" };
  return { amount: usd(rule.amount_cents ?? 0), caption: "per cleanup, once a day per person" };
}

function el(tag: string, css: string, text?: string) {
  const n = document.createElement(tag);
  n.style.cssText = css;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * A popup with the sponsor card look. The padding and close button are set here as well as in globals.css,
 * so the card sizing never depends on which stylesheet the page has loaded.
 */
function sponsorPopup(options: maplibregl.PopupOptions) {
  const popup = new maplibregl.Popup(options);
  popup.on("open", () => {
    const root = popup.getElement();
    const content = root?.querySelector<HTMLElement>(".maplibregl-popup-content");
    const close = root?.querySelector<HTMLElement>(".maplibregl-popup-close-button");
    const set = (node: HTMLElement | null | undefined, props: Record<string, string>) =>
      node && Object.entries(props).forEach(([k, v]) => node.style.setProperty(k, v, "important"));
    set(content, { padding: "12px 14px", "border-radius": "14px" });
    set(close, { top: "6px", right: "6px", width: "36px", height: "36px", "font-size": "22px", "line-height": "36px", "border-radius": "999px" });
  });
  return popup;
}

/** Plain-language proximity rule shown before someone taps Claim. */
export function claimRangeNote(radius?: number | null) {
  return `Take your photos within ${limitLabel(Number(radius) || 152)} of the site.`;
}

/** One popup for several pools covering the same spot, so overlapping sponsors read as a group. */
function overlapNode(areas: { name: string; left: number; rule: PayoutRule; mine?: boolean; win?: WindowInfo }[]) {
  const root = el("div", "width:236px;max-width:100%;box-sizing:border-box;font-family:inherit;color:#f4f4f5");
  const total = areas.reduce((n, a) => n + a.left, 0);
  root.append(
    el("div", "font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#34d399", "Sponsored areas"),
    el("div", "font-size:15px;font-weight:700;line-height:1.25;margin-top:2px", `${areas.length} pools cover this spot`),
    el("div", "font-size:12px;color:#a1a1aa;margin-top:2px", `${usd(total)} left in total`),
  );
  for (const a of areas) {
    const { amount, caption } = ruleParts(a.rule);
    const row = el("div", "margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.25)");
    row.append(
      el("div", "font-size:13px;font-weight:700", a.mine ? `${a.name} (yours)` : a.name),
      el("div", "font-size:12px;color:#d4d4d8;margin-top:2px", `${amount} ${caption} · ${usd(a.left)} left`),
      el("div", "font-size:11px;color:#6ee7b7;margin-top:2px", `Needs at least ${minLargeBags(a.rule)} large bag${minLargeBags(a.rule) === 1 ? "" : "s"}`),
    );
    const wl = a.win ? windowLine(a.win) : null;
    if (wl) row.append(el("div", `font-size:11px;font-weight:600;margin-top:2px;color:${wl.color}`, wl.text));
    root.append(row);
  }
  root.append(el("div", "font-size:12px;color:#fbbf24;margin-top:8px", "Groups: pick the pool you want when you host a cleanup here."));
  return root;
}

/** Metres between two points, close enough for "how far am I from this site". */
function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

const distanceText = (m: number) => (m >= 1609 ? `${(m / 1609.344).toFixed(1)} mi` : `${Math.round((m * 3.28084) / 10) * 10} ft`);

// Only when location is already allowed, so opening a popup never triggers a permission prompt.
async function fillDistanceLine(target: HTMLElement, site: { lat: number; lng: number; radius?: number | null }) {
  try {
    const perm = await navigator.permissions?.query({ name: "geolocation" });
    if (!perm || perm.state !== "granted") return;
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 120000, timeout: 6000 }),
    );
    const d = metersBetween(pos.coords.latitude, pos.coords.longitude, site.lat, site.lng);
    const range = Number(site.radius) || DEFAULT_CLAIM_RADIUS_M;
    const inRange = d <= range;
    target.style.color = inRange ? "#6ee7b7" : "#fbbf24";
    target.textContent = inRange
      ? `You are at the site (${distanceText(d)} away).`
      : `You are ${distanceText(d)} away.`;
  } catch {
    /* leave blank */
  }
}

// Same look as the job pin card: full-pill buttons, 40px tall, zinc for the quiet one.
const PILL_BTN =
  "display:flex;flex:1 1 0;min-width:0;align-items:center;justify-content:center;gap:5px;min-height:40px;padding:0 8px;border-radius:999px;border:0;overflow:hidden;text-overflow:ellipsis;" +
  "font-size:13px;font-weight:700;text-decoration:none;cursor:pointer;white-space:nowrap;font-family:inherit";

const ICON_LIST =
  '<path d="M10 12h11"/><path d="M10 18h11"/><path d="M10 6h11"/><path d="M4 10h2"/><path d="M4 6h1v4"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>';
const ICON_PLUS = '<path d="M5 12h14"/><path d="M12 5v14"/>';

/** A pill button with a small leading icon, matching the job card's buttons. */
function pillButton(tag: "button" | "a", css: string, label: string, icon: string) {
  const node = el(tag, PILL_BTN + ";" + css);
  node.innerHTML =
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
  node.append(document.createTextNode(label));
  return node;
}

function popupNode(
  kind: string,
  title: string,
  rule: PayoutRule,
  left: number,
  cta: { label: string; href?: string; onClick?: (btn: HTMLButtonElement, status: HTMLElement) => void } | null,
  note?: string,
  addId?: string | null,
  where?: { id: string; lat?: number; lng?: number; radius?: number | null },
  mine?: boolean,
  win?: WindowInfo,
) {
  const { amount, caption } = ruleParts(rule);
  const root = el("div", "width:236px;max-width:100%;box-sizing:border-box;font-family:inherit;color:#f4f4f5");
  root.append(
    el("div", `font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${mine ? MINE_COLOR : "#34d399"}`, mine ? `Your ${kind.toLowerCase()}` : kind),
    el("div", "font-size:16px;font-weight:700;line-height:1.25;margin-top:2px;padding-right:20px", title),
  );
  const line = win ? windowLine(win) : null;
  if (line) {
    root.append(
      el(
        "div",
        `margin-top:6px;padding:6px 10px;border-radius:10px;background:rgba(139,92,246,.14);border:1px solid rgba(139,92,246,.4);font-size:12px;font-weight:600;line-height:1.35;color:${line.color}`,
        line.text,
      ),
    );
  }
  const stats = el(
    "div",
    mine
      ? "margin-top:6px;padding:6px 10px;border-radius:12px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.35)"
      : "margin-top:6px;padding:6px 10px;border-radius:12px;background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.25)",
  );
  const big = el("div", "display:flex;align-items:baseline;gap:6px");
  big.append(
    el("span", `font-size:26px;font-weight:800;line-height:1;color:${mine ? "#fde68a" : "#6ee7b7"}`, amount),
    el("span", "font-size:12px;color:#d4d4d8", caption),
  );
  const minBags = minLargeBags(rule);
  stats.append(
    big,
    el(
      "div",
      "font-size:12px;margin-top:3px;color:#a1a1aa",
      `${usd(left)} left · `,
    ),
  );
  const bagsSpan = el("span", "font-weight:700;color:#6ee7b7", `needs ${minBags}+ large bag${minBags === 1 ? "" : "s"}`);
  stats.lastElementChild?.append(bagsSpan);
  root.append(stats);

  // One quiet status block instead of several stacked lines under the button.
  const status = el("div", "margin-top:4px;display:flex;flex-direction:column;gap:1px;font-size:12px;line-height:1.35");
  if (note) status.append(el("div", cta ? "color:#d4d4d8" : "color:#fbbf24", note));
  const distLine = el("div", "");
  const limitLine = el("div", "");
  if (cta) {
    status.append(distLine, limitLine);
    void fillLimitLine(limitLine);
    if (where?.lat != null && where.lng != null) void fillDistanceLine(distLine, { lat: where.lat, lng: where.lng, radius: where.radius });
  }
  if (status.childNodes.length) root.append(status);

  const claimStatus = el("div", "font-size:12px;margin-top:6px");
  if (cta) {
    const ctaCss =
      "display:flex;align-items:center;justify-content:center;width:100%;min-height:42px;margin-top:6px;border-radius:999px;" +
      "background:#059669;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border:0;cursor:pointer";
    if (cta.onClick) {
      const b = el("button", ctaCss, cta.label) as HTMLButtonElement;
      b.type = "button";
      b.addEventListener("click", () => cta.onClick?.(b, claimStatus));
      root.append(b, claimStatus);
    } else {
      const a = el("a", ctaCss, cta.label) as HTMLAnchorElement;
      a.href = cta.href ?? "/earn";
      // Claiming happens on the site's own page, so the map position is saved for the way back.
      if (where?.lat != null) a.addEventListener("click", () => saveMapReturn(activeMap));
      root.append(a);
    }
  }

  // One full-width primary action (Claim, or View details when there is nothing to claim), then the
  // quieter actions side by side as half buttons.
  const isSite = where?.lat != null;
  const pageHref = where ? (isSite ? `/earn/sites/${where.id}` : `/earn/areas/${where.id}`) : null;
  if (!cta && where && pageHref) {
    const more = el(
      "a",
      "display:flex;align-items:center;justify-content:center;width:100%;min-height:42px;margin-top:6px;border-radius:999px;background:#059669;color:#fff;font-size:15px;font-weight:700;text-decoration:none",
      "View details",
    ) as HTMLAnchorElement;
    more.href = pageHref;
    more.addEventListener("click", () => saveMapReturn(activeMap));
    root.append(more);
  }
  const row = el("div", "display:flex;gap:8px;margin-top:6px;width:100%;min-width:0");
  // Add money: the page has the box at the bottom, so jump straight to it.
  if (addId && pageHref) {
    const a = pillButton("a", "background:rgba(52,211,153,.16);color:#6ee7b7", "Add money", ICON_PLUS) as HTMLAnchorElement;
    a.href = `${pageHref}#add-money`;
    a.addEventListener("click", () => saveMapReturn(activeMap));
    row.append(a);
  }
  if (where) {
    // The list may render after the map, so show the button as soon as its row exists.
    const rowId = `sponsored-row-${where.id}`;
    const list = pillButton("button", "background:#27272a;color:#f4f4f5", "Show in list", ICON_LIST) as HTMLButtonElement;
    list.type = "button";
    list.addEventListener("click", () => flashRow(rowId));
    const sync = () => {
      list.style.display = document.getElementById(rowId) ? "flex" : "none";
    };
    sync();
    [500, 1500, 3500].forEach((ms) => setTimeout(sync, ms));
    row.append(list);
  }
  if (row.childNodes.length) root.append(row);
  return root;
}

// Shows what is left of this week's earning limit under the claim button, so nobody claims a site they
// cannot be paid for. Quietly absent when the limit cannot be loaded.
// Temporary: show the limit line in every popup so it can be reviewed; then only show it near the limit.
const FORCE_SHOW_LIMIT = false;

async function fillLimitLine(target: HTMLElement) {
  try {
    const res = await fetch("/api/sponsored/my-limits", { cache: "no-store" });
    if (!res.ok) return;
    const l = (await res.json()) as { limit_cents: number; remaining_cents: number; locked: boolean };
    const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;
    const pct = Math.min(100, Math.round(((l.limit_cents - l.remaining_cents) / Math.max(1, l.limit_cents)) * 100));
    const near = l.locked || pct >= 80;
    if (!FORCE_SHOW_LIMIT && !near) return;
    target.style.cssText = "margin-top:3px;padding:6px 10px;border-radius:10px;background:#27272a;font-size:12px;line-height:1.35;white-space:nowrap;color:" + (near ? "#fbbf24" : "#d4d4d8");
    const text = el(
      "div",
      "font-weight:600",
      l.locked
        ? `Weekly earning limit reached (${dollars(l.limit_cents)}). You can't claim new sites until it drops.`
        : `${dollars(l.remaining_cents)} left of ${dollars(l.limit_cents)} weekly limit`,
    );
    const track = el("div", "height:4px;border-radius:999px;background:#3f3f46;overflow:hidden;margin-top:4px");
    track.append(el("div", `height:100%;width:${pct}%;border-radius:999px;background:${near ? "#fbbf24" : "#38bdf8"}`));
    target.append(text, track);
  } catch {
    /* leave blank */
  }
}

// Business/partner markers set their own z-index, so lift the popup above all of them. The map stays
// where it is unless the card would be clipped by the frame, in which case it pans just far enough to
// bring the whole card (including the call to action) into view.
function openPopup(popup: maplibregl.Popup, m: maplibregl.Map) {
  popup.addTo(m);
  const el = popup.getElement();
  el.style.zIndex = "100";
  const fit = () => {
    if (!popup.isOpen()) return;
    // Measuring while the map is still flying or zooming reads a moving target and can fling the
    // view far away from the pin, so wait for it to settle first.
    if (m.isMoving()) {
      m.once("moveend", () => requestAnimationFrame(fit));
      return;
    }
    const frame = m.getContainer().getBoundingClientRect();
    // Popups live inside the map frame and are clipped by it, so a card taller than the frame scrolls.
    const body = el.querySelector<HTMLElement>(".maplibregl-popup-content");
    if (body) {
      body.style.maxHeight = `${Math.max(160, frame.height - 40)}px`;
      body.style.overflowY = "auto";
    }
    const card = el.getBoundingClientRect();
    const pad = 12;
    const dy = Math.max(0, frame.top + pad - card.top) - Math.max(0, card.bottom - (frame.bottom - pad));
    const dx = Math.max(0, frame.left + pad - card.left) - Math.max(0, card.right - (frame.right - pad));
    // A card measured nowhere near the frame means the position is stale, so never chase it.
    if (Math.abs(dx) > frame.width || Math.abs(dy) > frame.height) return;
    if (dx || dy) m.panBy([-dx, -dy], { duration: 250 });
  };
  // The card grows after it opens (distance check, claim status), so re-fit whenever its size changes.
  requestAnimationFrame(fit);
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => requestAnimationFrame(fit));
    ro.observe(el);
    popup.once("close", () => ro.disconnect());
  }
}

export interface SponsoredLayerOptions {
  sites?: boolean;
  areas?: boolean;
  /** Hide sites someone is already working. */
  availableOnly?: boolean;
  /** Respond to SPONSORED_FOCUS_EVENT from the sites list. */
  listenForFocus?: boolean;
}

export function useSponsoredMapLayer(
  mapRef: MutableRefObject<maplibregl.Map | null>,
  show: boolean,
  opts: SponsoredLayerOptions = {},
): {
  available: boolean;
  count: number;
  siteCount: number;
  areaCount: number;
  openSiteCount: number;
  points: [number, number][];
} {
  const [data, setData] = useState<{ sites: MapSite[]; areas: MapArea[]; pools?: MapPool[] } | null>(null);
  const poolMarkersRef = useRef<maplibregl.Marker[]>([]);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const areaLabelsRef = useRef<maplibregl.Marker[]>([]);
  const handlersRef = useRef(false);
  const showSites = show && (opts.sites ?? true);
  const showAreas = show && (opts.areas ?? true);
  const availableOnly = opts.availableOnly ?? false;
  const showRef = useRef(show);
  showRef.current = show;
  const showAreasRef = useRef(showAreas);
  showAreasRef.current = showAreas;
  const showSitesRef = useRef(showSites);
  showSitesRef.current = showSites;
  const availableOnlyRef = useRef(availableOnly);
  availableOnlyRef.current = availableOnly;

  // One fetch on mount: a failed response means payments are not visible to this viewer, so no toggle.
  const [available, setAvailable] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const onChanged = () => setReloadKey((k) => k + 1);
    window.addEventListener(SPONSORED_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SPONSORED_CHANGED_EVENT, onChanged);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/sponsored/map", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        setAvailable(true);
        if (Array.isArray(json.sites) && Array.isArray(json.areas)) {
          setData(json);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    const m = mapRef.current;
    if (m) activeMap = m;
    if (!m || !data) return;
    const elNode = el;

    const ensureAreas = () => {
      if (!m.getStyle()) return;
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: data.areas.map((a) => ({
          type: "Feature",
          id: undefined,
          properties: {
            id: a.id,
            name: a.area_name ?? "Sponsored area",
            left: a.remaining_cents,
            rule: JSON.stringify(a.payout_rule),
            open: a.open_to_additions ? 1 : 0,
            mine: a.is_mine ? 1 : 0,
            win: JSON.stringify({
              early_access: a.early_access,
              early_access_until: a.early_access_until,
              early_access_locked: a.early_access_locked,
              scheduled: a.scheduled,
              opens_at: a.opens_at,
              plus_opens_at: a.plus_opens_at,
            }),
          },
          geometry: a.geometry,
        })),
      };
      const src = m.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(fc);
      } else {
        m.addSource(SOURCE_ID, { type: "geojson", data: fc });
      }
      const vis = showAreasRef.current ? "visible" : "none";
      if (!m.getLayer(FILL_ID)) {
        m.addLayer({
          id: FILL_ID,
          type: "fill",
          source: SOURCE_ID,
          layout: { visibility: vis },
          paint: { "fill-color": ["case", ["==", ["get", "mine"], 1], MINE_COLOR, COLOR], "fill-opacity": 0.12 },
        });
        m.addLayer({
          id: LINE_ID,
          type: "line",
          source: SOURCE_ID,
          layout: { visibility: vis },
          paint: { "line-color": ["case", ["==", ["get", "mine"], 1], MINE_COLOR, COLOR], "line-width": 2, "line-dasharray": [2, 2] },
        });
      }
    };

    // The claim radius around each site, so people can see how close they need to be.
    const ensureRings = () => {
      if (!m.getStyle()) return;
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: data.sites.map((st) => ({
          type: "Feature",
          properties: { available: st.available },
          geometry: {
            type: "Polygon",
            coordinates: [circleRing([st.longitude, st.latitude], Number(st.radius_meters) || DEFAULT_CLAIM_RADIUS_M)],
          },
        })),
      };
      const src = m.getSource(RING_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(fc);
      else m.addSource(RING_SOURCE_ID, { type: "geojson", data: fc });
      const vis = showSitesRef.current ? "visible" : "none";
      const filter: maplibregl.FilterSpecification | null = availableOnlyRef.current ? ["==", ["get", "available"], true] : null;
      const live: maplibregl.ExpressionSpecification = ["case", ["get", "available"], COLOR, "#a1a1aa"];
      if (!m.getLayer(RING_FILL_ID)) {
        m.addLayer({
          id: RING_FILL_ID,
          type: "fill",
          source: RING_SOURCE_ID,
          layout: { visibility: vis },
          paint: { "fill-color": live, "fill-opacity": 0.1 },
        });
        m.addLayer({
          id: RING_LINE_ID,
          type: "line",
          source: RING_SOURCE_ID,
          layout: { visibility: vis },
          paint: { "line-color": live, "line-width": 1.5, "line-opacity": 0.9 },
        });
      }
      m.setFilter(RING_FILL_ID, filter);
      m.setFilter(RING_LINE_ID, filter);
    };

    const onAreaClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!showAreasRef.current) return;
      const f = e.features?.[0];
      if (!f) return;
      const seen = new Set<string>();
      const stack = m
        .queryRenderedFeatures(e.point, { layers: [FILL_ID] })
        .filter((x) => !seen.has(String(x.properties?.id)) && seen.add(String(x.properties?.id)));
      if (stack.length > 1) {
        openPopup(
          sponsorPopup({ closeButton: true, maxWidth: "264px", anchor: "bottom", className: "sponsor-popup" })
            .setLngLat(e.lngLat)
            .setDOMContent(
              overlapNode(
                stack.map((x) => ({
                  name: String(x.properties?.name),
                  left: Number(x.properties?.left ?? 0),
                  rule: JSON.parse(String(x.properties?.rule ?? "{}")) as PayoutRule,
                  mine: Number(x.properties?.mine) === 1,
                  win: JSON.parse(String(x.properties?.win ?? "{}")) as WindowInfo,
                })),
              ),
            ),
          m,
        );
        return;
      }
      const rule = JSON.parse(String(f.properties?.rule ?? "{}")) as PayoutRule;
      openPopup(
        sponsorPopup({ closeButton: true, maxWidth: "264px", anchor: "bottom", className: "sponsor-popup" })
          .setLngLat(e.lngLat)
          .setDOMContent(
            popupNode("Sponsored area", String(f.properties?.name), rule, Number(f.properties?.left ?? 0), null,
              "Groups: pick this area when you host a cleanup here.",
              Number(f.properties?.open) === 1 ? String(f.properties?.id) : null, { id: String(f.properties?.id) }, Number(f.properties?.mine) === 1,
              JSON.parse(String(f.properties?.win ?? "{}")) as WindowInfo),
          ),
        m,
      );
    };

    const setup = () => {
      ensureAreas();
      ensureRings();
      if (!handlersRef.current) {
        m.on("click", FILL_ID, onAreaClick);
        handlersRef.current = true;
      }
    };

    if (m.isStyleLoaded()) setup();
    else m.once("idle", setup);
    // A basemap style swap drops custom sources, so put them back.
    const onStyle = () => {
      if (!m.isStyleLoaded()) return;
      if (!m.getSource(SOURCE_ID)) ensureAreas();
      if (!m.getSource(RING_SOURCE_ID)) ensureRings();
    };
    m.on("styledata", onStyle);

    // Name tags for areas, dashed like the outline so they read as part of the region, not as a pin.
    areaLabelsRef.current.forEach((mk) => mk.remove());
    areaLabelsRef.current = data.areas.map((a) => {
      const coords = JSON.stringify(a.geometry).match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
      const lons = coords.filter((_, i) => i % 2 === 0);
      const lats = coords.filter((_, i) => i % 2 === 1);
      const center: [number, number] = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
      const tagEl = el(
        "div",
        "pointer-events:none;text-align:center;padding:3px 9px;border-radius:8px;background:rgba(9,9,11,.72);color:#a7f3d0;" +
          "border:1.5px dashed #34d399;font-size:12px;font-weight:700;line-height:1.25;white-space:nowrap;z-index:15;",
      );
      if (a.is_mine) {
        tagEl.style.borderColor = MINE_COLOR;
        tagEl.style.color = "#fde68a";
      }
      tagEl.append(
        el("div", "", a.is_mine ? `${a.area_name ?? "Sponsored area"} (yours)` : a.area_name ?? "Sponsored area"),
        el("div", "font-weight:500;color:#d4d4d8;font-size:11px", `${usd(a.remaining_cents)} left`),
      );
      if (a.early_access || a.scheduled) {
        tagEl.append(el("div", "font-weight:700;color:#c4b5fd;font-size:11px", a.scheduled ? "Scheduled" : "✦ Plus only"));
      }
      tagEl.style.display = showAreasRef.current ? "" : "none";
      return new maplibregl.Marker({ element: tagEl }).setLngLat(center).addTo(m);
    });

    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current = data.sites.map((s) => {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Sponsored site ${s.label ?? ""}`.trim());
      el.style.cssText =
        "display:flex;flex-direction:column;align-items:center;gap:2px;min-width:44px;background:none;border:0;padding:0;cursor:pointer;z-index:20";
      const amount = s.payout_rule.type === "per_bag" ? s.payout_rule.cents_per_bag ?? 0 : s.payout_rule.amount_cents ?? 0;
      const plusOnly = !!(s.early_access || s.scheduled);
      const fill = s.is_mine ? "#fcd34d" : plusOnly ? "#7c3aed" : s.available ? "#059669" : "#71717a";
      const tag = document.createElement("span");
      const price = s.open_to_additions ? `${usd(amount)} +` : usd(amount);
      tag.textContent = plusOnly ? `✦ ${price}` : price;
      tag.style.cssText =
        `padding:2px 8px;border-radius:999px;background:${s.is_mine ? "#fcd34d" : "#18181b"};color:${s.is_mine ? "#451a03" : "#fff"};font-size:13px;font-weight:800;line-height:1.2;` +
        "border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)";
      const pin = document.createElement("span");
      // Auto margins center the pin under the (wider) price tag so the tip sits on the marker anchor.
      pin.style.cssText = "display:block;width:34px;height:42px;margin:0 auto";
      pin.innerHTML =
        `<svg width="34" height="42" viewBox="0 0 24 30" aria-hidden="true" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.45))">` +
        `<path d="M12 1.5C6.2 1.5 1.5 6.1 1.5 11.8c0 7.6 10.5 17.2 10.5 17.2s10.5-9.6 10.5-17.2C22.5 6.1 17.8 1.5 12 1.5Z" fill="${fill}" stroke="#fff" stroke-width="1.5"/>` +
        `<circle cx="12" cy="11.5" r="4" fill="#fff"/></svg>`;
      el.append(tag, pin);
      if (s.pool_id) {
        const badge = document.createElement("span");
        badge.textContent = "Community funded";
        badge.style.cssText =
          "position:absolute;top:-14px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:1px 6px;border-radius:999px;background:#0e7490;color:#fff;font-size:10px;font-weight:700;border:1px solid #fff";
        el.style.position = "relative";
        el.append(badge);
      }
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openPopup(
          sponsorPopup({ closeButton: true, maxWidth: "264px", offset: 56, anchor: "bottom", className: "sponsor-popup" })
            .setLngLat([s.longitude, s.latitude])
            .setDOMContent(
              popupNode(
                "Sponsored site",
                s.label ?? "Sponsored site",
                s.payout_rule,
                s.remaining_cents,
                // Sponsors cannot claim their own site, so their popup has no claim button.
                s.available && !s.is_mine && !s.early_access_locked
                  ? { label: "Claim this site", href: `/earn/sites/${s.id}` }
                  : null,
                s.is_mine
                  ? "You sponsored this site."
                  : s.early_access_locked
                    ? "Get Frontline Plus to claim it now, or come back when it opens to everyone."
                    : s.claimed_by_me
                      ? "You claimed this site. Finish it from your Earn page."
                      : s.available
                        ? `Claim from anywhere, then you have 1 hour to get there. ${claimRangeNote(s.radius_meters)}`
                        : "Someone else is working this site right now.",
                s.open_to_additions ? s.id : null,
                { id: s.id, lat: s.latitude, lng: s.longitude, radius: s.radius_meters },
                s.is_mine,
                s,
              ),
            ),
          m,
        );
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([s.longitude, s.latitude]).addTo(m);
      marker.getElement().style.display = showSitesRef.current && !(availableOnlyRef.current && !s.available) ? "" : "none";
      return marker;
    });

    // Open pools: a dashed-ring pin with a progress arc, linking to the pool page.
    poolMarkersRef.current.forEach((mk) => mk.remove());
    poolMarkersRef.current = (data.pools ?? []).map((pl) => {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Funding in progress ${pl.title}`);
      el.style.cssText =
        "display:flex;flex-direction:column;align-items:center;gap:2px;min-width:44px;background:none;border:0;padding:0;cursor:pointer;z-index:19";
      const pct = Math.max(0, Math.min(1, pl.raised_cents / Math.max(1, pl.goal_cents)));
      const C = 2 * Math.PI * 15;
      const tag = document.createElement("span");
      tag.textContent = `${usd(pl.raised_cents)} / ${usd(pl.goal_cents)}`;
      tag.style.cssText =
        "padding:2px 8px;border-radius:999px;background:#18181b;color:#fff;font-size:12px;font-weight:800;line-height:1.2;border:1.5px dashed #22d3ee;box-shadow:0 1px 4px rgba(0,0,0,.4)";
      const ring = document.createElement("span");
      ring.style.cssText = "display:block;width:40px;height:40px;margin:0 auto";
      ring.innerHTML =
        `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.45))">` +
        `<circle cx="20" cy="20" r="15" fill="#18181b" stroke="#3f3f46" stroke-width="5"/>` +
        `<circle cx="20" cy="20" r="15" fill="none" stroke="#22d3ee" stroke-width="5" stroke-linecap="round" ` +
        `stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 20 20)"/>` +
        `<text x="20" y="24" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">${Math.round(pct * 100)}%</text></svg>`;
      el.append(tag, ring);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const box = document.createElement("div");
        box.style.cssText = "display:flex;flex-direction:column;gap:6px;font-family:inherit";
        box.append(
          elNode("div", "font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;padding-right:30px", "Funding in progress"),
          elNode("div", "font-size:15px;font-weight:700;padding-right:30px", pl.title),
          elNode("div", "font-size:12px;color:#d4d4d8", `${usd(pl.raised_cents)} of ${usd(pl.goal_cents)} raised`),
        );
        const bar = document.createElement("div");
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", "100");
        bar.setAttribute("aria-valuenow", String(Math.round(pct * 100)));
        bar.style.cssText = "height:8px;border-radius:999px;background:#3f3f46;overflow:hidden";
        bar.append(elNode("div", `height:100%;width:${Math.round(pct * 100)}%;background:#22d3ee;border-radius:999px`, ""));
        box.append(bar);
        if (pl.deadline) {
          box.append(elNode("div", "font-size:11px;color:#a1a1aa", `Ends ${new Date(pl.deadline).toLocaleDateString()}`));
        }
        const link = document.createElement("a");
        link.href = `/fund/pools/${pl.id}`;
        link.textContent = "See the pool";
        link.style.cssText =
          "display:block;text-align:center;padding:8px 10px;border-radius:8px;background:#0891b2;color:#fff;font-weight:700;font-size:13px;text-decoration:none";
        box.append(link);
        openPopup(
          sponsorPopup({ closeButton: true, maxWidth: "264px", offset: 52, anchor: "bottom", className: "sponsor-popup" })
            .setLngLat([pl.longitude, pl.latitude])
            .setDOMContent(box),
          m,
        );
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([pl.longitude, pl.latitude]).addTo(m);
      marker.getElement().style.display = showSitesRef.current ? "" : "none";
      return marker;
    });

    return () => {
      m.off("styledata", onStyle);
    };
  }, [data, mapRef]);

  // Visibility toggle: layers may not exist yet (still loading), markers are plain DOM.
  useEffect(() => {
    const m = mapRef.current;
    markersRef.current.forEach((mk, i) => {
      const s = data?.sites[i];
      mk.getElement().style.display = showSites && !(availableOnly && s && !s.available) ? "" : "none";
    });
    areaLabelsRef.current.forEach((mk) => {
      mk.getElement().style.display = showAreas ? "" : "none";
    });
    poolMarkersRef.current.forEach((mk) => {
      mk.getElement().style.display = showSites ? "" : "none";
    });
    if (!m) return;
    const vis = showAreas ? "visible" : "none";
    if (m.getLayer(FILL_ID)) m.setLayoutProperty(FILL_ID, "visibility", vis);
    if (m.getLayer(LINE_ID)) m.setLayoutProperty(LINE_ID, "visibility", vis);
    const ringVis = showSites ? "visible" : "none";
    const ringFilter: maplibregl.FilterSpecification | null = availableOnly ? ["==", ["get", "available"], true] : null;
    for (const id of [RING_FILL_ID, RING_LINE_ID]) {
      if (!m.getLayer(id)) continue;
      m.setLayoutProperty(id, "visibility", ringVis);
      m.setFilter(id, ringFilter);
    }
  }, [showSites, showAreas, availableOnly, mapRef, data]);

  // Keep labels from stacking: an area tag slides to the nearest clear spot when it would cover a
  // site pin or a tag already shown, and only hides if nowhere nearby is free. Re-checked as the map moves.
  const SLOTS: [number, number][] = [[0, 0], [0, 80], [0, -100], [-150, 0], [150, 0], [-150, 80], [150, 80], [-150, -100], [150, -100], [0, 150], [0, -170]];
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const boxes = (data?.areas ?? []).map((a) => {
      const nums = JSON.stringify(a.geometry).match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
      const lons = nums.filter((_, k) => k % 2 === 0);
      const lats = nums.filter((_, k) => k % 2 === 1);
      return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] as const;
    });
    const declutter = () => {
      const taken: DOMRect[] = [];
      const mapRect = m.getContainer().getBoundingClientRect();
      markersRef.current.forEach((mk) => {
        const node = mk.getElement();
        if (node.style.display !== "none") taken.push(node.getBoundingClientRect());
      });
      areaLabelsRef.current.forEach((mk, i) => {
        const node = mk.getElement();
        node.style.visibility = "";
        if (node.style.display === "none") return;
        const box = boxes[i];
        // The tag must stay inside its own area on screen, so a tiny area at a wide zoom shows no tag
        // rather than one floating far away from it.
        const sw = box ? m.project([box[0], box[3]]) : null;
        const ne = box ? m.project([box[2], box[1]]) : null;
        // Try the middle of the area first, then slide the tag to the nearest clear spot.
        for (const [dx, dy] of SLOTS) {
          mk.setOffset([dx, dy]);
          const rect = node.getBoundingClientRect();
          if (sw && ne) {
            const cx = (rect.left + rect.right) / 2 - mapRect.left;
            const cy = (rect.top + rect.bottom) / 2 - mapRect.top;
            if (cx < sw.x || cx > ne.x || cy < sw.y || cy > ne.y) continue;
          }
          if (!taken.some((t) => overlaps(rect, t))) {
            taken.push(rect);
            return;
          }
        }
        mk.setOffset([0, 0]);
        node.style.visibility = "hidden";
      });
    };
    declutter();
    m.on("moveend", declutter);
    m.on("resize", declutter);
    return () => {
      m.off("moveend", declutter);
      m.off("resize", declutter);
    };
  }, [showSites, showAreas, availableOnly, mapRef, data]);

  useEffect(
    () => () => {
      markersRef.current.forEach((mk) => mk.remove());
      markersRef.current = [];
      areaLabelsRef.current.forEach((mk) => mk.remove());
      areaLabelsRef.current = [];
    },
    [],
  );

  // The sites list asks for a site by id: open the same popup a marker tap would.
  useEffect(() => {
    if (!opts.listenForFocus) return;
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      const i = data?.sites.findIndex((x) => x.id === id) ?? -1;
      if (i < 0) {
        // Not a site: frame the area and open its popup at the middle of it.
        const area = data?.areas.find((x) => x.id === id);
        const map = mapRef.current;
        if (!area || !map) return;
        const nums = JSON.stringify(area.geometry).match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
        const lons = nums.filter((_, k) => k % 2 === 0);
        const lats = nums.filter((_, k) => k % 2 === 1);
        const bounds = new maplibregl.LngLatBounds([Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]);
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
        openPopup(
          sponsorPopup({ closeButton: true, maxWidth: "264px", anchor: "bottom", className: "sponsor-popup" })
            .setLngLat(bounds.getCenter())
            .setDOMContent(
              popupNode("Sponsored area", area.area_name ?? "Sponsored area", area.payout_rule, area.remaining_cents, null,
                "Groups: pick this area when you host a cleanup here.", area.open_to_additions ? area.id : null, { id: area.id }, area.is_mine, area),
            ),
          map,
        );
        return;
      }
      const marker = markersRef.current[i];
      marker.getElement().style.display = "";
      mapRef.current?.jumpTo({ center: marker.getLngLat(), zoom: Math.max(mapRef.current.getZoom(), 15) });
      marker.getElement().click();
    };
    window.addEventListener(SPONSORED_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(SPONSORED_FOCUS_EVENT, onFocus);
  }, [opts.listenForFocus, data, mapRef]);

  // Memoized so consumers that fit bounds to it only do so when the data changes.
  const points = useMemo<[number, number][]>(() => (data
    ? [
        ...data.sites.map((x): [number, number] => [x.longitude, x.latitude]),
        ...data.areas.flatMap((x) => {
          const coords: number[] = JSON.stringify(x.geometry).match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
          const out: [number, number][] = [];
          for (let i = 0; i + 1 < coords.length; i += 2) out.push([coords[i], coords[i + 1]]);
          return out;
        }),
      ]
    : []), [data]);
  return {
    available,
    count: data ? data.sites.length + data.areas.length : 0,
    siteCount: data?.sites.length ?? 0,
    areaCount: data?.areas.length ?? 0,
    openSiteCount: data?.sites.filter((x) => x.available).length ?? 0,
    points,
  };
}
