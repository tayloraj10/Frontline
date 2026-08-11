"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl(id: string) {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

type GeoLevel = "borough" | "neighborhood" | "zip";

interface ChildUnit {
  geo_unit_id: string;
  unit_type: string;
  unit_id: string;
  display_name: string | null;
  total_value: number;
  contribution_count: number;
  unique_contributors: number;
  unique_groups: number;
  small_bags: number;
  large_bags: number;
  pounds: number;
}

const LEVEL_TILE_INFO: Record<GeoLevel, { path: string; sourceLayer: string }> = {
  borough: { path: "nyc-boroughs", sourceLayer: "nyc_boroughs" },
  neighborhood: { path: "nyc-neighborhoods", sourceLayer: "nyc_neighborhoods" },
  zip: { path: "", sourceLayer: "territories" },
};

// Emerald ramp, low → high activity.
const COLOR_RAMP = ["#1f2937", "#14532d", "#166534", "#15803d", "#22c55e", "#4ade80"];

// Gold / silver / bronze, matching the leaderboard list's RankBadge colors.
const RANK_COLORS = ["#facc15", "#d4d4d8", "#d97706"];

function colorForRank(fracRank: number): string {
  const idx = Math.min(COLOR_RAMP.length - 1, Math.floor(fracRank * COLOR_RAMP.length));
  return COLOR_RAMP[idx];
}

function top3(units: ChildUnit[]): ChildUnit[] {
  return [...units].sort((a, b) => b.total_value - a.total_value).slice(0, 3);
}

function buildChoroplethExpr(units: ChildUnit[]): unknown[] | string {
  const withValue = units.filter((c) => c.total_value > 0);
  // A `match` expression needs at least one label/output pair besides the
  // fallback — with no unit having any activity (e.g. an empty time range),
  // fall back to a flat color instead of an under-sized expression.
  if (withValue.length === 0) return "#27272a";
  // Only units that actually have activity are eligible for a rank color — a
  // 0-point unit should never look like it "won" a top-3 spot via tiebreak.
  const topRankColor = new Map(top3(withValue).map((child, i) => [child.geo_unit_id, RANK_COLORS[i]]));
  const sorted = [...withValue].sort((a, b) => a.total_value - b.total_value);
  const matchExpr: unknown[] = ["match", ["get", "geo_unit_id"]];
  sorted.forEach((child, i) => {
    const fracRank = sorted.length > 1 ? i / (sorted.length - 1) : 1;
    const color = topRankColor.get(child.geo_unit_id) ?? colorForRank(fracRank);
    matchExpr.push(child.geo_unit_id, color);
  });
  matchExpr.push("#27272a");
  return matchExpr;
}

const SOURCE_ID = "geo-stats-map-source";
const FILL_LAYER_ID = "geo-stats-map-fill";
const LINE_LAYER_ID = "geo-stats-map-line";
const OUTLINE_SOURCE_ID = "geo-stats-focus-outline-source";
const OUTLINE_LAYER_ID = "geo-stats-focus-outline-line";

export default function GeoStatsMap({
  level,
  campaignId,
  fastapiUrl,
  units,
  focusBbox,
  focusBoundary,
  onDrill,
}: {
  level: GeoLevel;
  campaignId: string;
  fastapiUrl: string;
  units: ChildUnit[];
  focusBbox: [number, number, number, number] | null;
  focusBoundary: GeoJSON.Geometry | null;
  onDrill: (child: ChildUnit) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const unitsRef = useRef<ChildUnit[]>(units);
  const onDrillRef = useRef(onDrill);
  const hoveredIdRef = useRef<string | null>(null);
  const tooltipRef = useRef<maplibregl.Popup | null>(null);
  const sourceLayerRef = useRef<string>(LEVEL_TILE_INFO[level].sourceLayer);

  unitsRef.current = units;
  onDrillRef.current = onDrill;

  const top3Key = useMemo(() => top3(units).map((c) => c.geo_unit_id).join(","), [units]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl("outdoor"),
      center: [-73.98, 40.72],
      zoom: 10,
      attributionControl: false,
    });
    mapRef.current = map;

    tooltipRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 8,
    });

    map.on("click", FILL_LAYER_ID, (e) => {
      const geoUnitId = e.features?.[0]?.properties?.geo_unit_id as string | undefined;
      if (!geoUnitId) return;
      const child = unitsRef.current.find((c) => c.geo_unit_id === geoUnitId);
      if (child) onDrillRef.current(child);
    });
    map.on("mouseenter", FILL_LAYER_ID, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", FILL_LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
      if (hoveredIdRef.current !== null) {
        map.setFeatureState(
          { source: SOURCE_ID, sourceLayer: sourceLayerRef.current, id: hoveredIdRef.current },
          { hover: false }
        );
        hoveredIdRef.current = null;
      }
      tooltipRef.current?.remove();
    });
    map.on("mousemove", FILL_LAYER_ID, (e) => {
      const feature = e.features?.[0];
      const id = feature?.id;
      const displayName = feature?.properties?.display_name as string | undefined;
      if (displayName) {
        tooltipRef.current?.setLngLat(e.lngLat).setText(displayName).addTo(map);
      } else {
        tooltipRef.current?.remove();
      }
      if (id === undefined || id === hoveredIdRef.current) return;
      if (hoveredIdRef.current !== null) {
        map.setFeatureState(
          { source: SOURCE_ID, sourceLayer: sourceLayerRef.current, id: hoveredIdRef.current },
          { hover: false }
        );
      }
      hoveredIdRef.current = String(id);
      map.setFeatureState({ source: SOURCE_ID, sourceLayer: sourceLayerRef.current, id }, { hover: true });
    });

    return () => {
      tooltipRef.current?.remove();
      tooltipRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild the source/layers whenever the drill level (or campaign) changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function setup() {
      if (!map) return;
      if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
      if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

      const info = LEVEL_TILE_INFO[level];
      sourceLayerRef.current = info.sourceLayer;
      const tileUrl =
        level === "zip"
          ? `${fastapiUrl}/api/tiles/${campaignId}/{z}/{x}/{y}.mvt`
          : `${fastapiUrl}/api/tiles/${info.path}/{z}/{x}/{y}.mvt`;

      map.addSource(SOURCE_ID, {
        type: "vector",
        tiles: [tileUrl],
        promoteId: "geo_unit_id",
        minzoom: 0,
        maxzoom: 16,
      });

      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        "source-layer": info.sourceLayer,
        paint: {
          "fill-color": "#27272a",
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.9, 0.7],
        },
      });
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        "source-layer": info.sourceLayer,
        paint: { "line-color": "#09090b", "line-width": 1 },
      });

      // Keep the focus-neighborhood outline (if present) rendered above the choropleth.
      if (map.getLayer(OUTLINE_LAYER_ID)) map.moveLayer(OUTLINE_LAYER_ID);

      applyChoropleth();
    }

    function applyChoropleth() {
      if (!map || !map.getLayer(FILL_LAYER_ID)) return;
      map.setPaintProperty(FILL_LAYER_ID, "fill-color", buildChoroplethExpr(unitsRef.current) as string);
    }

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once("load", setup);
    }
  }, [level, campaignId, fastapiUrl]);

  // Re-color when units data refreshes (interval/focus change) without rebuilding layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(FILL_LAYER_ID)) return;
    map.setPaintProperty(FILL_LAYER_ID, "fill-color", buildChoroplethExpr(units) as string);
  }, [units]);

  // Fit to encompass the top-3 units' combined bbox whenever the top-3 set changes;
  // fall back to the focused geo unit's own bbox, then the NYC-wide default.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ids = top3Key ? top3Key.split(",") : [];
    if (ids.length === 0) {
      if (focusBbox) {
        map.fitBounds(
          [
            [focusBbox[0], focusBbox[1]],
            [focusBbox[2], focusBbox[3]],
          ],
          { padding: 24, duration: 500 }
        );
      } else {
        map.flyTo({ center: [-73.98, 40.72], zoom: 10, duration: 500 });
      }
      return;
    }
    const controller = new AbortController();
    fetch(`${fastapiUrl}/api/geo-units/bbox?ids=${encodeURIComponent(ids.join(","))}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json) return;
        const [minLng, minLat, maxLng, maxLat] = json.bbox as [number, number, number, number];
        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          { padding: 48, duration: 500 }
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [top3Key, focusBbox, fastapiUrl]);

  // Outline the focused neighborhood so it's clear which one you're inside while
  // viewing its child zip codes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function apply() {
      if (!map) return;
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: focusBoundary ? [{ type: "Feature", properties: {}, geometry: focusBoundary }] : [],
      };
      const source = map.getSource(OUTLINE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
        return;
      }
      map.addSource(OUTLINE_SOURCE_ID, { type: "geojson", data });
      map.addLayer({
        id: OUTLINE_LAYER_ID,
        type: "line",
        source: OUTLINE_SOURCE_ID,
        paint: { "line-color": "#f4f4f5", "line-width": 2.5, "line-dasharray": [2, 1.5] },
      });
    }

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [focusBoundary]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[320px] rounded-xl overflow-hidden border border-zinc-800"
    />
  );
}
