"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import maplibregl from "maplibre-gl";
import { mk, usd, type BoardPin } from "@/lib/marketplace";

/**
 * Open neighbor jobs as small sky dots, for maps whose main job is something else (the Trash War map).
 * Positions come rounded from the server. Tapping a dot shows a tiny card that links to the job page.
 * A failed fetch (marketplace not visible to this viewer) leaves `available` false so no toggle renders.
 */
export function useJobPinsLayer(
  mapRef: MutableRefObject<maplibregl.Map | null>,
  show: boolean,
): { available: boolean; count: number } {
  const [pins, setPins] = useState<BoardPin[] | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

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
    if (!m || !pins || !show) return;
    for (const j of pins) {
      if (j.latitude == null || j.longitude == null) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Job: ${j.title}, ${usd(j.price_cents)}`);
      // 44px tap target around a small visible dot.
      el.style.cssText = "display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;background:none;border:0;padding:0;cursor:pointer";
      // One solid price pill ("$45"), so it reads as pay and not as another blue dot.
      const pill = document.createElement("span");
      pill.textContent = usd(j.price_cents);
      pill.style.cssText =
        `padding:4px 9px;border-radius:999px;background:${j.is_mine ? "#fcd34d" : "#38bdf8"};color:${j.is_mine ? "#451a03" : "#082f49"};` +
        "border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);font-size:12px;font-weight:800;line-height:1";
      el.append(pill);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const card = document.createElement("div");
        card.style.cssText = "width:200px;max-width:100%;font-family:inherit;color:#f4f4f5";
        const kind = document.createElement("div");
        kind.style.cssText = "font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#38bdf8";
        kind.textContent = "Neighbor job";
        const title = document.createElement("div");
        title.style.cssText = "font-size:15px;font-weight:700;line-height:1.25;margin-top:2px;padding-right:20px";
        title.textContent = j.title;
        const price = document.createElement("div");
        price.style.cssText = "font-size:22px;font-weight:800;color:#7dd3fc;margin-top:4px";
        price.textContent = `${usd(j.price_cents)}${j.price_type === "hourly" ? "/hr" : ""}`;
        const link = document.createElement("a");
        link.href = `/fund/jobs/${j.id}`;
        link.textContent = "View job";
        link.style.cssText =
          "display:flex;align-items:center;justify-content:center;min-height:40px;margin-top:8px;border-radius:999px;background:#0284c7;color:#fff;font-size:14px;font-weight:700;text-decoration:none";
        card.append(kind, title, price, link);
        const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "232px", offset: 14, className: "sponsor-popup" })
          .setLngLat([j.longitude as number, j.latitude as number])
          .setDOMContent(card)
          .addTo(m);
        popup.getElement().style.zIndex = "100";
      });
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([j.longitude, j.latitude]).addTo(m));
    }
    return () => {
      markersRef.current.forEach((x) => x.remove());
      markersRef.current = [];
    };
  }, [pins, show, mapRef]);

  return { available: pins !== null, count: pins?.length ?? 0 };
}
