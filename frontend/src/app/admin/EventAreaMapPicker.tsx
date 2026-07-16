"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl() {
  return `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`;
}

const CONTINENTAL_US_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-125, 24.5],
  [-66.9, 49.5],
];

export interface SelectedArea {
  geoUnitId: string;
  displayName: string;
  unitType: string;
}

export default function EventAreaMapPicker({
  campaignId,
  onChange,
  mode = "multi",
  unitType = null,
}: {
  campaignId: string;
  onChange: (areas: SelectedArea[]) => void;
  mode?: "single" | "multi";
  unitType?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedRef = useRef<Map<string, SelectedArea>>(new Map());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const unitTypeRef = useRef(unitType);
  unitTypeRef.current = unitType;
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    if (!containerRef.current || !campaignId) return;

    selectedRef.current = new Map();
    setSelectedCount(0);
    onChangeRef.current([]);

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      bounds: CONTINENTAL_US_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      attributionControl: false,
    });
    mapRef.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");

    const tileUrl = `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/${campaignId}/{z}/{x}/{y}.mvt`;

    m.on("load", () => {
      m.addSource("event-area-territory", {
        type: "vector",
        tiles: [tileUrl],
        minzoom: 0,
        maxzoom: 14,
        promoteId: "geo_unit_id",
      });

      m.addLayer({
        id: "event-area-fill",
        type: "fill",
        source: "event-area-territory",
        "source-layer": "territories",
        ...(unitTypeRef.current
          ? { filter: ["==", ["get", "unit_type"], unitTypeRef.current] as maplibregl.FilterSpecification }
          : {}),
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#f59e0b",
            "#3f3f46",
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.75,
            0.2,
          ],
        },
      });

      m.addLayer({
        id: "event-area-border",
        type: "line",
        source: "event-area-territory",
        "source-layer": "territories",
        ...(unitTypeRef.current
          ? { filter: ["==", ["get", "unit_type"], unitTypeRef.current] as maplibregl.FilterSpecification }
          : {}),
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#f59e0b",
            "#71717a",
          ],
          "line-width": 1,
          "line-opacity": 0.8,
        },
      });

      m.on("click", "event-area-fill", (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.id === undefined) return;
        const id = String(feature.id);
        const props = feature.properties as { display_name?: string; unit_type?: string };

        const featureState = {
          source: "event-area-territory",
          sourceLayer: "territories",
          id: feature.id,
        };

        if (selectedRef.current.has(id)) {
          selectedRef.current.delete(id);
          m.setFeatureState(featureState, { selected: false });
        } else {
          if (modeRef.current === "single") {
            selectedRef.current.forEach((_, prevId) => {
              m.setFeatureState(
                { source: "event-area-territory", sourceLayer: "territories", id: prevId },
                { selected: false }
              );
            });
            selectedRef.current.clear();
          }
          selectedRef.current.set(id, {
            geoUnitId: id,
            displayName: props.display_name ?? id,
            unitType: props.unit_type ?? "",
          });
          m.setFeatureState(featureState, { selected: true });
        }

        setSelectedCount(selectedRef.current.size);
        onChangeRef.current(Array.from(selectedRef.current.values()));
      });

      m.on("mouseenter", "event-area-fill", () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", "event-area-fill", () => {
        m.getCanvas().style.cursor = "";
      });
    });

    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, [campaignId]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const filter: maplibregl.FilterSpecification | null = unitType
      ? ["==", ["get", "unit_type"], unitType]
      : null;
    const applyFilter = () => {
      if (!m.getLayer("event-area-fill") || !m.getLayer("event-area-border")) return;
      m.setFilter("event-area-fill", filter);
      m.setFilter("event-area-border", filter);
      selectedRef.current.forEach((area, id) => {
        if (unitType && area.unitType !== unitType) {
          selectedRef.current.delete(id);
          m.setFeatureState(
            { source: "event-area-territory", sourceLayer: "territories", id },
            { selected: false }
          );
        }
      });
      setSelectedCount(selectedRef.current.size);
      onChangeRef.current(Array.from(selectedRef.current.values()));
    };
    if (m.isStyleLoaded()) applyFilter();
    else m.once("load", applyFilter);
  }, [unitType]);

  return (
    <div>
      <div
        ref={containerRef}
        className="w-full h-[280px] rounded-lg overflow-hidden border border-zinc-700/50"
      />
      <p className="text-xs text-zinc-400 mt-1">
        {mode === "single"
          ? "Click a zip code on the map to select the area this event applies to."
          : "Click zip codes on the map to select the area(s) this event applies to."}{" "}
        {selectedCount > 0 ? `${selectedCount} selected.` : "None selected yet."}
      </p>
    </div>
  );
}
