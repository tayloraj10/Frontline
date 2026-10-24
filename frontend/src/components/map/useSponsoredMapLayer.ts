"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import maplibregl from "maplibre-gl";
import { getPosition } from "@/lib/getPosition";
import { circleRing } from "@/lib/areaShape";

/**
 * Payments v2 sponsored areas on the map. One fetch per mount from the allowlisted proxy;
 * a 401/403/404 (payments not visible to this viewer) leaves `available` false so the
 * Layers toggle never renders. Sites are tappable pin markers with a dollar tag, group areas are
 * dashed outlines with a light fill. On by default; the caller owns the toggle.
 */

type PayoutRule = { type: string; amount_cents?: number; cents_per_bag?: number };

interface MapSite {
  id: string;
  label: string | null;
  remaining_cents: number;
  payout_rule: PayoutRule;
  radius_meters?: number | null;
  latitude: number;
  longitude: number;
  available: boolean;
}

interface MapArea {
  id: string;
  area_name: string | null;
  remaining_cents: number;
  payout_rule: PayoutRule;
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
const DEFAULT_CLAIM_RADIUS_M = 100;

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

function ruleParts(rule: PayoutRule): { amount: string; caption: string } {
  if (rule.type === "per_bag") return { amount: usd(rule.cents_per_bag ?? 0), caption: "per bag" };
  if (rule.type === "equal_split") return { amount: usd(rule.amount_cents ?? 0), caption: "split among attendees" };
  return { amount: usd(rule.amount_cents ?? 0), caption: "per cleanup" };
}

function el(tag: string, css: string, text?: string) {
  const n = document.createElement(tag);
  n.style.cssText = css;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Plain-language proximity rule shown before someone taps Claim. */
export function claimRangeNote(radius?: number | null) {
  const m = Math.round(Number(radius) || 100);
  const ft = Math.round((m * 3.281) / 10) * 10;
  return `Be within ${m} m (about ${ft} ft) of the site to claim it.`;
}

/** One popup for several pools covering the same spot, so overlapping sponsors read as a group. */
function overlapNode(areas: { name: string; left: number; rule: PayoutRule }[]) {
  const root = el("div", "min-width:220px;font-family:inherit;color:#f4f4f5");
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
      el("div", "font-size:13px;font-weight:700", a.name),
      el("div", "font-size:12px;color:#d4d4d8;margin-top:2px", `${amount} ${caption} · ${usd(a.left)} left`),
    );
    root.append(row);
  }
  root.append(el("div", "font-size:12px;color:#fbbf24;margin-top:8px", "Groups: pick the pool you want when you host a cleanup here."));
  return root;
}

function popupNode(
  kind: string,
  title: string,
  rule: PayoutRule,
  left: number,
  cta: { label: string; href?: string; onClick?: (btn: HTMLButtonElement, status: HTMLElement) => void } | null,
  note?: string,
) {
  const { amount, caption } = ruleParts(rule);
  const root = el("div", "min-width:210px;font-family:inherit;color:#f4f4f5");
  root.append(
    el("div", "font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#34d399", kind),
    el("div", "font-size:15px;font-weight:700;line-height:1.25;margin-top:2px", title),
  );
  const stats = el(
    "div",
    "display:flex;align-items:baseline;gap:6px;margin-top:8px;padding:8px 10px;border-radius:10px;" +
      "background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.25)",
  );
  stats.append(
    el("span", "font-size:28px;font-weight:800;line-height:1;color:#6ee7b7", amount),
    el("span", "font-size:12px;color:#d4d4d8", caption),
  );
  root.append(stats, el("div", "font-size:12px;color:#a1a1aa;margin-top:6px", `${usd(left)} left in the pool`));
  if (note) root.append(el("div", "font-size:12px;color:#fbbf24;margin-top:6px", note));
  if (!cta) return root;
  const ctaCss =
    "display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;margin-top:10px;border-radius:12px;" +
    "background:#059669;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border:0;cursor:pointer";
  if (cta.onClick) {
    const btn = el("button", ctaCss, cta.label) as HTMLButtonElement;
    btn.type = "button";
    const status = el("div", "font-size:12px;margin-top:6px");
    const limitLine = el("div", "font-size:11px;color:#a1a1aa;margin-top:6px");
    void fillLimitLine(limitLine);
    btn.addEventListener("click", () => cta.onClick?.(btn, status));
    root.append(btn, status, limitLine);
    return root;
  }
  const a = el("a", ctaCss, cta.label) as HTMLAnchorElement;
  a.href = cta.href ?? "/sponsorships";
  root.append(a);
  return root;
}

// Shows what is left of today's payout limit under the claim button, so nobody claims a site they
// cannot be paid for. Quietly absent when the limit cannot be loaded.
async function fillLimitLine(target: HTMLElement) {
  try {
    const res = await fetch("/api/sponsored/my-limits", { cache: "no-store" });
    if (!res.ok) return;
    const l = (await res.json()) as { limit_cents: number; remaining_cents: number };
    const dollars = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;
    if (l.remaining_cents <= 0) {
      target.style.color = "#fbbf24";
      target.textContent = `You have reached today's ${dollars(l.limit_cents)} payout limit. It resets tomorrow.`;
    } else {
      target.textContent = `${dollars(l.remaining_cents)} left of your ${dollars(l.limit_cents)} daily payout limit.`;
    }
  } catch {
    /* leave blank */
  }
}

// Claiming happens right in the popup: you have to be standing at the site, so the browser's
// location is sent with the request. The photo steps then continue in the sites list.
async function claimFromPopup(siteId: string, btn: HTMLButtonElement, status: HTMLElement) {
  if (btn.dataset.claimed) {
    document.getElementById("sponsored-sites")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  btn.disabled = true;
  btn.textContent = "Checking your location...";
  status.textContent = "";
  try {
    const pos = await getPosition();
    btn.textContent = "Claiming...";
    const res = await fetch(`/api/sponsored/${siteId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
    });
    if (!res.ok) {
      let msg = "Could not claim this site.";
      try {
        const j = JSON.parse(await res.text());
        if (typeof j.detail === "string") msg = j.detail;
      } catch {
        /* not JSON */
      }
      throw new Error(msg);
    }
    btn.dataset.claimed = "1";
    btn.textContent = "Go to my claim";
    btn.disabled = false;
    status.style.color = "#6ee7b7";
    status.textContent = "It is yours. Take your starting photo from the sites list.";
    window.dispatchEvent(new Event(SPONSORED_CHANGED_EVENT));
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Claim this site";
    status.style.color = "#fbbf24";
    status.textContent = err instanceof Error ? err.message : "Could not claim this site.";
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
    const frame = m.getContainer().getBoundingClientRect();
    const card = el.getBoundingClientRect();
    const pad = 12;
    const dy = Math.max(0, frame.top + pad - card.top) - Math.max(0, card.bottom - (frame.bottom - pad));
    const dx = Math.max(0, frame.left + pad - card.left) - Math.max(0, card.right - (frame.right - pad));
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
  const [data, setData] = useState<{ sites: MapSite[]; areas: MapArea[] } | null>(null);
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
    if (!m || !data) return;

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
          paint: { "fill-color": COLOR, "fill-opacity": 0.12 },
        });
        m.addLayer({
          id: LINE_ID,
          type: "line",
          source: SOURCE_ID,
          layout: { visibility: vis },
          paint: { "line-color": COLOR, "line-width": 2, "line-dasharray": [2, 2] },
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
          new maplibregl.Popup({ closeButton: true, maxWidth: "300px", anchor: "bottom" })
            .setLngLat(e.lngLat)
            .setDOMContent(
              overlapNode(
                stack.map((x) => ({
                  name: String(x.properties?.name),
                  left: Number(x.properties?.left ?? 0),
                  rule: JSON.parse(String(x.properties?.rule ?? "{}")) as PayoutRule,
                })),
              ),
            ),
          m,
        );
        return;
      }
      const rule = JSON.parse(String(f.properties?.rule ?? "{}")) as PayoutRule;
      openPopup(
        new maplibregl.Popup({ closeButton: true, maxWidth: "280px", anchor: "bottom" })
          .setLngLat(e.lngLat)
          .setDOMContent(
            popupNode("Sponsored area", String(f.properties?.name), rule, Number(f.properties?.left ?? 0), null,
              "Groups: pick this area when you host a cleanup here."),
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
          "border:1.5px dashed #34d399;font-size:12px;font-weight:700;line-height:1.25;white-space:nowrap;",
      );
      tagEl.append(
        el("div", "", a.area_name ?? "Sponsored area"),
        el("div", "font-weight:500;color:#d4d4d8;font-size:11px", `${usd(a.remaining_cents)} left`),
      );
      tagEl.style.display = showAreasRef.current ? "" : "none";
      return new maplibregl.Marker({ element: tagEl }).setLngLat(center).addTo(m);
    });

    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current = data.sites.map((s) => {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Sponsored site ${s.label ?? ""}`.trim());
      el.style.cssText =
        "display:flex;flex-direction:column;align-items:center;gap:2px;min-width:44px;background:none;border:0;padding:0;cursor:pointer";
      const amount = s.payout_rule.type === "per_bag" ? s.payout_rule.cents_per_bag ?? 0 : s.payout_rule.amount_cents ?? 0;
      const fill = s.available ? "#059669" : "#71717a";
      const tag = document.createElement("span");
      tag.textContent = usd(amount);
      tag.style.cssText =
        "padding:2px 8px;border-radius:999px;background:#18181b;color:#fff;font-size:13px;font-weight:800;line-height:1.2;" +
        "border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)";
      const pin = document.createElement("span");
      pin.innerHTML =
        `<svg width="34" height="42" viewBox="0 0 24 30" aria-hidden="true" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.45))">` +
        `<path d="M12 1.5C6.2 1.5 1.5 6.1 1.5 11.8c0 7.6 10.5 17.2 10.5 17.2s10.5-9.6 10.5-17.2C22.5 6.1 17.8 1.5 12 1.5Z" fill="${fill}" stroke="#fff" stroke-width="1.5"/>` +
        `<circle cx="12" cy="11.5" r="4" fill="#fff"/></svg>`;
      el.append(tag, pin);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openPopup(
          new maplibregl.Popup({ closeButton: true, maxWidth: "280px", offset: 56, anchor: "bottom" })
            .setLngLat([s.longitude, s.latitude])
            .setDOMContent(
              popupNode(
                "Sponsored site",
                s.label ?? "Sponsored site",
                s.payout_rule,
                s.remaining_cents,
                s.available
                  ? { label: "Claim this site", onClick: (btn, status) => claimFromPopup(s.id, btn, status) }
                  : null,
                s.available ? claimRangeNote(s.radius_meters) : "Someone is working this site right now.",
              ),
            ),
          m,
        );
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([s.longitude, s.latitude]).addTo(m);
      marker.getElement().style.display = showSitesRef.current && !(availableOnlyRef.current && !s.available) ? "" : "none";
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
          new maplibregl.Popup({ closeButton: true, maxWidth: "280px", anchor: "bottom" })
            .setLngLat(bounds.getCenter())
            .setDOMContent(
              popupNode("Sponsored area", area.area_name ?? "Sponsored area", area.payout_rule, area.remaining_cents, null,
                "Groups: pick this area when you host a cleanup here."),
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
