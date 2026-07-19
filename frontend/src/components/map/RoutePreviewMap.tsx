"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const MAP_STYLES = [
  { id: "outdoor", label: "Terrain", icon: "⛰️" },
  { id: "streets", label: "Streets", icon: "🗺️" },
  { id: "hybrid", label: "Satellite", icon: "🛰️" },
] as const;

function styleUrl(id: string) {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

function addRouteLayers(
  m: maplibregl.Map,
  coordinates: [number, number][],
  isEvent: boolean,
  bufferCoordinates?: [number, number][][],
) {
  // Buffer corridor first so the route line/casing render on top of it — same fill/line
  // styling as CampaignMap's cleanup-routes-buffer, for visual parity with the main map.
  m.addSource("route-preview-buffer", {
    type: "geojson",
    data: bufferCoordinates
      ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: bufferCoordinates } }
      : { type: "FeatureCollection", features: [] },
  });
  m.addLayer({
    id: "route-preview-buffer-fill",
    type: "fill",
    source: "route-preview-buffer",
    paint: { "fill-color": "#38bdf8", "fill-opacity": 0.08 },
  });
  m.addLayer({
    id: "route-preview-buffer-line",
    type: "line",
    source: "route-preview-buffer",
    paint: { "line-color": "#38bdf8", "line-width": 1.5, "line-opacity": 0.65 },
  });

  m.addSource("route-preview", {
    type: "geojson",
    data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } },
  });
  // Matches CampaignMap's cleanup-routes-casing/-line exactly (solid, zoom-interpolated
  // width) so a route looks the same on the main map and on this detail page.
  m.addLayer({
    id: "route-preview-casing",
    type: "line",
    source: "route-preview",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 8],
      "line-opacity": 0.9,
    },
  });
  m.addLayer({
    id: "route-preview-line",
    type: "line",
    source: "route-preview",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": isEvent ? "#0284c7" : "#f59e0b",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 5],
    },
  });
  // Directional arrows along the route (Strava-style), rendered as repeating text glyphs
  // rather than a custom icon sprite so no extra image asset needs to be loaded/managed.
  m.addLayer({
    id: "route-preview-arrows",
    type: "symbol",
    source: "route-preview",
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 60,
      "text-field": "▶",
      "text-size": 14,
      "text-rotation-alignment": "map",
      "text-pitch-alignment": "map",
      "text-keep-upright": false,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#78350f",
      "text-halo-color": "#fffbeb",
      "text-halo-width": 1,
    },
  });
  new maplibregl.Marker({ color: "#22c55e" }).setLngLat(coordinates[0]).addTo(m);
  new maplibregl.Marker({ color: "#ef4444" }).setLngLat(coordinates[coordinates.length - 1]).addTo(m);
}

// The logo badge is a fixed-center DOM overlay (not tied to a lnglat), so unlike a
// MapLibre layer it never shrinks on its own as the map zooms out — without this it
// stays full-size and swallows the whole (now visually smaller) route. Scale it down
// at low zoom and back up at high zoom, relative to the zoom fitBounds first settled on.
const LOGO_SCALE_MIN = 0.4;
const LOGO_SCALE_ZOOM_RANGE = 4; // zoom levels below baseline before hitting LOGO_SCALE_MIN

function RouteMap({
  coordinates,
  bufferCoordinates,
  activeMapStyle,
  onStyleChange,
  interactive,
  heightClassName,
  groupLogoUrl,
  isEvent,
  showBuffer,
  onToggleBuffer,
  logoOffset,
  onLogoOffsetChange,
}: {
  coordinates: [number, number][];
  bufferCoordinates?: [number, number][][];
  activeMapStyle: (typeof MAP_STYLES)[number]["id"];
  onStyleChange?: (id: (typeof MAP_STYLES)[number]["id"]) => void;
  interactive: boolean;
  heightClassName: string;
  groupLogoUrl?: string | null;
  isEvent: boolean;
  showBuffer: boolean;
  onToggleBuffer?: () => void;
  logoOffset: { x: number; y: number };
  onLogoOffsetChange: (offset: { x: number; y: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const logoRef = useRef<HTMLDivElement>(null);
  const baseZoomRef = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const applyBufferVisibility = (m: maplibregl.Map, visible: boolean) => {
    const vis = visible ? "visible" : "none";
    if (m.getLayer("route-preview-buffer-fill")) m.setLayoutProperty("route-preview-buffer-fill", "visibility", vis);
    if (m.getLayer("route-preview-buffer-line")) m.setLayoutProperty("route-preview-buffer-line", "visibility", vis);
  };

  const handleLogoPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: logoOffset.x, origY: logoOffset.y };
  };
  const handleLogoPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    onLogoOffsetChange({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  };
  const handleLogoPointerUp = () => {
    dragRef.current = null;
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current || coordinates.length < 2) return;
    const bounds = coordinates.reduce(
      (b, c) => b.extend(c as [number, number]),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
    );

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(activeMapStyle),
      interactive,
      attributionControl: false,
      bounds,
      fitBoundsOptions: { padding: 30 },
    });
    mapRef.current = m;
    if (interactive) m.addControl(new maplibregl.NavigationControl(), "top-right");

    const updateLogoScale = () => {
      if (!logoRef.current) return;
      if (baseZoomRef.current === null) baseZoomRef.current = m.getZoom();
      const dz = m.getZoom() - baseZoomRef.current;
      const scale = dz >= 0 ? 1 : Math.max(LOGO_SCALE_MIN, 1 + dz / LOGO_SCALE_ZOOM_RANGE);
      logoRef.current.style.transform = `scale(${scale})`;
    };

    m.on("load", () => {
      addRouteLayers(m, coordinates, isEvent, bufferCoordinates);
      applyBufferVisibility(m, showBuffer);
      updateLogoScale();
      mapReadyRef.current = true;
    });
    m.on("zoom", updateLogoScale);

    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Style switcher — setStyle wipes sources/layers; re-add the route on style.load
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReadyRef.current) return;
    m.once("style.load", () => {
      addRouteLayers(m, coordinates, isEvent, bufferCoordinates);
      applyBufferVisibility(m, showBuffer);
    });
    m.setStyle(styleUrl(activeMapStyle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMapStyle]);

  // Buffer visibility toggle — flip the layout property rather than re-adding the source
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReadyRef.current) return;
    applyBufferVisibility(m, showBuffer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBuffer]);

  return (
    <div className={`relative w-full ${heightClassName}`}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden border border-zinc-700/50" />
      {groupLogoUrl && (
        <div
          className="absolute top-1/2 left-1/2 touch-none"
          style={{
            transform: `translate(-50%, -50%) translate(${logoOffset.x}px, ${logoOffset.y}px)`,
          }}
        >
          <div
            ref={logoRef}
            onPointerDown={handleLogoPointerDown}
            onPointerMove={handleLogoPointerMove}
            onPointerUp={handleLogoPointerUp}
            className="transition-transform duration-150 ease-out cursor-grab active:cursor-grabbing"
            style={{ transformOrigin: "center" }}
          >
            <div className="w-14 h-14 rounded-full bg-zinc-900/70 backdrop-blur-[1px] shadow-xl flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={groupLogoUrl}
                alt=""
                draggable={false}
                className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-lg bg-zinc-900 pointer-events-none"
              />
            </div>
          </div>
        </div>
      )}
      {onStyleChange && (
        <div className="absolute top-2 left-2 flex flex-col gap-0.5 p-0.5 bg-zinc-900/90 border border-zinc-700/60 rounded-md backdrop-blur-sm shadow-lg">
          {MAP_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onStyleChange(s.id)}
              title={s.label}
              aria-label={s.label}
              className={`w-6 h-6 flex items-center justify-center text-xs leading-none rounded transition-colors ${activeMapStyle === s.id
                ? "bg-zinc-600"
                : "opacity-60 hover:opacity-100 hover:bg-zinc-800"
                }`}
            >
              {s.icon}
            </button>
          ))}
        </div>
      )}
      {onToggleBuffer && bufferCoordinates && (
        <button
          type="button"
          onClick={onToggleBuffer}
          className="absolute bottom-2 left-2 px-2 py-1 text-xs font-medium rounded-md bg-zinc-900/90 border border-zinc-700/60 backdrop-blur-sm shadow-lg text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          {showBuffer ? "Hide zone" : "Show zone"}
        </button>
      )}
    </div>
  );
}

export default function RoutePreviewMap({
  coordinates,
  bufferCoordinates,
  styleId = "outdoor",
  interactive = false,
  heightClassName = "h-[220px]",
  groupLogoUrl = null,
  enlargeable = false,
  isEvent = false,
}: {
  coordinates: [number, number][];
  bufferCoordinates?: [number, number][][];
  styleId?: (typeof MAP_STYLES)[number]["id"];
  interactive?: boolean;
  heightClassName?: string;
  groupLogoUrl?: string | null;
  enlargeable?: boolean;
  isEvent?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeMapStyle, setActiveMapStyle] = useState<(typeof MAP_STYLES)[number]["id"]>(styleId);
  const [showBuffer, setShowBuffer] = useState(true);
  const [logoOffset, setLogoOffset] = useState({ x: 0, y: 0 });

  return (
    <div className="relative">
      <RouteMap
        coordinates={coordinates}
        bufferCoordinates={bufferCoordinates}
        activeMapStyle={activeMapStyle}
        onStyleChange={setActiveMapStyle}
        interactive={interactive}
        heightClassName={heightClassName}
        groupLogoUrl={groupLogoUrl}
        isEvent={isEvent}
        showBuffer={showBuffer}
        onToggleBuffer={() => setShowBuffer((v) => !v)}
        logoOffset={logoOffset}
        onLogoOffsetChange={setLogoOffset}
      />
      {enlargeable && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Enlarge for screenshot"
          className="absolute bottom-2 right-2 w-8 h-8 rounded-md bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-sm transition-colors"
        >
          ⛶
        </button>
      )}
      {expanded && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 gap-3">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="absolute top-4 right-4 text-white text-2xl leading-none hover:text-zinc-300"
            aria-label="Close"
          >
            ×
          </button>
          <div className="w-full max-w-2xl">
            <RouteMap
              coordinates={coordinates}
              bufferCoordinates={bufferCoordinates}
              activeMapStyle={activeMapStyle}
              onStyleChange={setActiveMapStyle}
              interactive
              heightClassName="h-[70vh]"
              groupLogoUrl={groupLogoUrl}
              isEvent={isEvent}
              showBuffer={showBuffer}
              onToggleBuffer={() => setShowBuffer((v) => !v)}
              logoOffset={logoOffset}
              onLogoOffsetChange={setLogoOffset}
            />
          </div>
          <p className="text-xs text-zinc-400">Screenshot this view to share on social media</p>
        </div>
      )}
    </div>
  );
}
