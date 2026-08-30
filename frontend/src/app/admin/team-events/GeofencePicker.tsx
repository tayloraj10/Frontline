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

export interface GeofenceArea {
  geoUnitId: string;
  displayName: string;
  unitType: string;
}

const UNIT_TYPE_OPTIONS: { value: string; label: string; sourceLayer: string; route: string }[] = [
  { value: "city", label: "City", sourceLayer: "cities", route: "cities" },
  { value: "nyc_borough", label: "NYC Borough", sourceLayer: "nyc_boroughs", route: "nyc-boroughs" },
  { value: "nyc_neighborhood", label: "NYC Neighborhood", sourceLayer: "nyc_neighborhoods", route: "nyc-neighborhoods" },
  {
    value: "philadelphia_neighborhood",
    label: "Philadelphia Neighborhood",
    sourceLayer: "philadelphia_neighborhoods",
    route: "philadelphia-neighborhoods",
  },
  {
    value: "chicago_neighborhood",
    label: "Chicago Neighborhood",
    sourceLayer: "chicago_neighborhoods",
    route: "chicago-neighborhoods",
  },
  { value: "la_neighborhood", label: "LA Neighborhood", sourceLayer: "la_neighborhoods", route: "la-neighborhoods" },
];

export default function GeofencePicker({
  onChange,
  initialUnitType,
  initialSelected,
}: {
  onChange: (areas: GeofenceArea[]) => void;
  initialUnitType?: string | null;
  initialSelected?: GeofenceArea[];
}) {
  const [unitType, setUnitType] = useState(
    UNIT_TYPE_OPTIONS.find((o) => o.value === initialUnitType)?.value ?? UNIT_TYPE_OPTIONS[0].value
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedRef = useRef<Map<string, GeofenceArea>>(new Map());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialSelectedRef = useRef(initialSelected);
  const [selected, setSelected] = useState<GeofenceArea[]>(initialSelected ?? []);

  const option = UNIT_TYPE_OPTIONS.find((o) => o.value === unitType) ?? UNIT_TYPE_OPTIONS[0];

  useEffect(() => {
    if (!containerRef.current) return;

    const initial = initialSelectedRef.current ?? [];
    selectedRef.current = new Map(initial.map((a) => [a.geoUnitId, a]));
    setSelected(initial);

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      bounds: CONTINENTAL_US_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      attributionControl: false,
    });
    mapRef.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");

    const tileUrl = `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/tiles/${option.route}/{z}/{x}/{y}.mvt`;
    const sourceId = "geofence-picker-source";
    const sourceLayer = option.sourceLayer;

    m.on("load", () => {
      m.addSource(sourceId, {
        type: "vector",
        tiles: [tileUrl],
        minzoom: 0,
        maxzoom: 14,
        promoteId: "geo_unit_id",
      });

      m.addLayer({
        id: "geofence-picker-fill",
        type: "fill",
        source: sourceId,
        "source-layer": sourceLayer,
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
        id: "geofence-picker-border",
        type: "line",
        source: sourceId,
        "source-layer": sourceLayer,
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

      for (const area of selectedRef.current.values()) {
        m.setFeatureState({ source: sourceId, sourceLayer, id: area.geoUnitId }, { selected: true });
      }

      m.on("click", "geofence-picker-fill", (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.id === undefined) return;
        const id = String(feature.id);
        const props = feature.properties as { display_name?: string };

        const featureState = { source: sourceId, sourceLayer, id: feature.id };

        if (selectedRef.current.has(id)) {
          selectedRef.current.delete(id);
          m.setFeatureState(featureState, { selected: false });
        } else {
          selectedRef.current.set(id, {
            geoUnitId: id,
            displayName: props.display_name ?? id,
            unitType,
          });
          m.setFeatureState(featureState, { selected: true });
        }

        const areas = Array.from(selectedRef.current.values());
        setSelected(areas);
        onChangeRef.current(areas);
      });

      m.on("mouseenter", "geofence-picker-fill", () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", "geofence-picker-fill", () => {
        m.getCanvas().style.cursor = "";
      });
    });

    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, [unitType, option.route, option.sourceLayer]);

  return (
    <div>
      <select
        value={unitType}
        onChange={(e) => setUnitType(e.target.value)}
        className="mb-2 w-full rounded-lg border border-zinc-700/50 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100"
      >
        {UNIT_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div
        ref={containerRef}
        className="w-full h-[280px] rounded-lg overflow-hidden border border-zinc-700/50 shadow-elevation-1"
      />
      <p className="text-xs text-zinc-400 mt-1">
        Click areas on the map to assign them as this team&apos;s geofence.{" "}
        {selected.length > 0
          ? `Selected: ${selected.map((a) => a.displayName).join(", ")}.`
          : "None selected yet."}
      </p>
    </div>
  );
}
