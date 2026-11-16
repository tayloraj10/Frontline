"use client";

import { createElement, useEffect, useRef, useState, type MutableRefObject } from "react";
import maplibregl from "maplibre-gl";
import { jobSize } from "@/lib/jobSizes";
import { saveMapReturn } from "@/lib/mapReturn";
import { mk, usd, type BoardPin } from "@/lib/marketplace";
import { renderToStaticMarkup } from "react-dom/server";
import { categoryHex, categoryIcon, categoryLabel, findCategory, useCategories } from "@/lib/categories";

/**
 * Open neighbor jobs as small sky dots, for maps whose main job is something else (the Trash War map).
 * Positions come rounded from the server. Tapping a dot shows a tiny card that links to the job page.
 * A failed fetch (marketplace not visible to this viewer) leaves `available` false so no toggle renders.
 */
let jobPopup: maplibregl.Popup | null = null;

export function useJobPinsLayer(
  mapRef: MutableRefObject<maplibregl.Map | null>,
  show: boolean,
): { available: boolean; count: number } {
  const [pins, setPins] = useState<BoardPin[] | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const { categories: cats } = useCategories();

  useEffect(() => {
    let live = true;
    mk<{ pins: BoardPin[] }>("/board/pins")
      .then((r) => live && setPins(r.pins))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    markersRef.current.forEach((x) => x.remove());
    markersRef.current = [];
    // Hiding or reloading the job pins also closes the job card that was open.
    jobPopup?.remove();
    jobPopup = null;
    if (!m || !pins || !show) return;
    for (const j of pins) {
      const cat = findCategory(cats, j.job_type);
      const Icon = categoryIcon(cat?.icon);
      const catHex = categoryHex(cat?.color);
      const typeLabel = categoryLabel(cats, j.job_type);
      if (j.latitude == null || j.longitude == null) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${j.is_mine ? "Your job" : "Job"}: ${typeLabel}, ${j.title}, ${usd(j.price_cents)}`);
      // 44px tap target around a small visible dot.
      el.style.cssText = "display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;background:none;border:0;padding:0;cursor:pointer;z-index:20";
      // One solid price pill ("$45"), so it reads as pay and not as another blue dot.
      const pill = document.createElement("span");
      const fg = j.is_mine ? "#451a03" : "#082f49";
      pill.innerHTML = renderToStaticMarkup(createElement(Icon, { width: 13, height: 13, color: fg, "aria-hidden": true, style: { display: "block", flexShrink: 0 } }));
      pill.append(usd(j.price_cents));
      pill.style.cssText =
        `padding:4px 9px;border-radius:999px;background:${j.is_mine ? "#fcd34d" : "#38bdf8"};color:${j.is_mine ? "#451a03" : "#082f49"};` +
        "display:inline-flex;flex-direction:row;align-items:center;gap:4px;white-space:nowrap;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);font-size:12px;font-weight:800;line-height:1";
      el.append(pill);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const card = document.createElement("div");
        card.style.cssText = "width:200px;max-width:100%;font-family:inherit;color:#f4f4f5";
        const kind = document.createElement("div");
        kind.style.cssText = `font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${j.is_mine ? "#fcd34d" : "#38bdf8"}`;
        kind.textContent = j.is_mine ? "Your job" : "Neighbor job";
        // The type gets its own row in the category color, so it does not read as part of the label above.
        const type = document.createElement("div");
        type.style.cssText = `display:flex;align-items:center;gap:5px;margin-top:3px;font-size:13px;font-weight:700;color:${catHex}`;
        type.innerHTML = renderToStaticMarkup(createElement(Icon, { width: 15, height: 15, color: catHex, "aria-hidden": true, style: { display: "block", flexShrink: 0 } }));
        type.append(jobSize(j.size) ? `${typeLabel} · ${jobSize(j.size)!.label}` : typeLabel);
        const title = document.createElement("div");
        title.style.cssText = "font-size:15px;font-weight:700;line-height:1.25;margin-top:2px;padding-right:20px";
        title.textContent = j.title;
        const price = document.createElement("div");
        price.style.cssText = `font-size:22px;font-weight:800;color:${j.is_mine ? "#fde68a" : "#7dd3fc"};margin-top:4px`;
        price.textContent = `${usd(j.price_cents)}${j.price_type === "hourly" ? "/hr" : ""}`;
        const link = document.createElement("a");
        link.href = `/fund/jobs/${j.id}`;
        link.textContent = j.is_mine ? "View job" : "View job";
        link.style.cssText =
          `display:flex;align-items:center;justify-content:center;min-height:40px;margin-top:8px;border-radius:999px;background:${j.is_mine ? "#fcd34d" : "#0284c7"};color:${j.is_mine ? "#451a03" : "#fff"};font-size:14px;font-weight:700;text-decoration:none`;
        link.addEventListener("click", () => saveMapReturn(m));
        card.append(kind, type, title, price, link);
        jobPopup?.remove();
        const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "232px", offset: 14, className: "frontline-card-popup" })
          .setLngLat([j.longitude as number, j.latitude as number])
          .setDOMContent(card)
          .addTo(m);
        popup.getElement().style.zIndex = "100";
        jobPopup = popup;
      });
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([j.longitude, j.latitude]).addTo(m));
    }
    return () => {
      markersRef.current.forEach((x) => x.remove());
      markersRef.current = [];
    };
  }, [pins, show, mapRef, cats]);

  return { available: pins !== null, count: pins?.length ?? 0 };
}
