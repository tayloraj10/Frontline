"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

function styleUrl() {
  return `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`;
}

/**
 * Review/edit step for a captured route: one draggable marker per recorded
 * GPS point (to fix stray spikes), tap-to-delete, with an undo stack to walk
 * back an accidental drag or delete. Add-node/reorder is out of scope for v1,
 * this only ever removes or repositions existing points. Mirrors
 * BusinessLocationMapPicker's draggable-marker pattern and RoutePicker's
 * setData()-based line redraw.
 */
export default function RouteNodeEditor({
  coordinates,
  onChange,
  heightClassName = "h-[360px]",
  photos,
  onRemovePhoto,
  onReplacePhoto,
}: {
  coordinates: [number, number][];
  onChange: (coordinates: [number, number][]) => void;
  heightClassName?: string;
  photos?: { lat: number; lng: number; previewUrl: string }[];
  onRemovePhoto?: (index: number) => void;
  onReplacePhoto?: (index: number, file: File) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const photoMarkersRef = useRef<maplibregl.Marker[]>([]);
  const coordsRef = useRef<[number, number][]>(coordinates);
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Snapshots of coordsRef.current taken right before each drag/delete mutation,
  // so a single Undo tap can restore the array from just before that change.
  const historyRef = useRef<[number, number][][]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const [viewingPhotoIndex, setViewingPhotoIndex] = useState<number | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const redrawLine = () => {
    const m = mapRef.current;
    if (!m) return;
    const src = m.getSource("route-node-editor") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const coords = coordsRef.current;
    src.setData({
      type: "FeatureCollection",
      features:
        coords.length >= 2
          ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }]
          : [],
    });
  };

  const pushHistory = () => {
    historyRef.current = [...historyRef.current, coordsRef.current];
    setCanUndo(true);
  };

  const handleUndo = () => {
    const prev = historyRef.current[historyRef.current.length - 1];
    if (!prev) return;
    historyRef.current = historyRef.current.slice(0, -1);
    setCanUndo(historyRef.current.length > 0);
    coordsRef.current = prev;
    redrawLine();
    rebuildMarkers();
    onChangeRef.current(coordsRef.current);
  };

  const rebuildMarkers = () => {
    const m = mapRef.current;
    if (!m) return;
    markersRef.current.forEach((mk) => mk.remove());
    markersRef.current = coordsRef.current.map((coord, index) => {
      const marker = new maplibregl.Marker({ color: "#f59e0b", draggable: true }).setLngLat(coord).addTo(m);

      let beforeDrag: [number, number][] | null = null;
      marker.on("dragstart", () => {
        beforeDrag = coordsRef.current;
      });

      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        if (beforeDrag) {
          historyRef.current = [...historyRef.current, beforeDrag];
          setCanUndo(true);
          beforeDrag = null;
        }
        coordsRef.current = coordsRef.current.map((c, i) => (i === index ? [lng, lat] : c));
        redrawLine();
        onChangeRef.current(coordsRef.current);
      });

      marker.getElement().addEventListener("click", (e) => {
        e.stopPropagation();
        if (coordsRef.current.length <= 2) return; // keep at least 2 points for a valid line
        pushHistory();
        coordsRef.current = coordsRef.current.filter((_, i) => i !== index);
        redrawLine();
        rebuildMarkers();
        onChangeRef.current(coordsRef.current);
      });

      return marker;
    });
  };

  const rebuildPhotoMarkers = () => {
    const m = mapRef.current;
    if (!m) return;
    photoMarkersRef.current.forEach((mk) => mk.remove());
    photoMarkersRef.current = (photosRef.current ?? []).map((photo, index) => {
      const el = document.createElement("div");
      el.style.width = "28px";
      el.style.height = "28px";
      el.style.borderRadius = "9999px";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.5)";
      el.style.backgroundImage = `url(${photo.previewUrl})`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.style.cursor = "pointer";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setViewingPhotoIndex(index);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([photo.lng, photo.lat]).addTo(m);
    });
  };

  useEffect(() => {
    rebuildPhotoMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || coordsRef.current.length === 0) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(),
      center: coordsRef.current[0],
      zoom: 15,
      attributionControl: false,
    });
    mapRef.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");

    m.on("load", () => {
      m.addSource("route-node-editor", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "route-node-editor-casing",
        type: "line",
        source: "route-node-editor",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
      });
      m.addLayer({
        id: "route-node-editor-line",
        type: "line",
        source: "route-node-editor",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f59e0b", "line-width": 4 },
      });
      redrawLine();
      rebuildMarkers();
      rebuildPhotoMarkers();

      const bounds = coordsRef.current.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coordsRef.current[0], coordsRef.current[0]),
      );
      m.fitBounds(bounds, { padding: 60 });
    });

    return () => {
      markersRef.current.forEach((mk) => mk.remove());
      markersRef.current = [];
      photoMarkersRef.current.forEach((mk) => mk.remove());
      photoMarkersRef.current = [];
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewingPhoto = viewingPhotoIndex !== null ? (photos ?? [])[viewingPhotoIndex] : null;

  return (
    <div className={`relative w-full ${heightClassName}`}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden border border-zinc-700/50" />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 max-w-[90%]">
        <div className="px-4 py-2 bg-zinc-900/95 border border-zinc-700 rounded-lg text-xs text-zinc-200 shadow-elevation-3 backdrop-blur-sm text-center">
          Drag a point to fix it, or tap to remove it.
        </div>
        <button
          type="button"
          onClick={handleUndo}
          disabled={!canUndo}
          className="shrink-0 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900/95 text-zinc-200 text-xs font-medium backdrop-blur-sm shadow-elevation-3 transition-[background-color,transform] duration-150 hover:bg-zinc-800 active:scale-[0.94] touch-manipulation disabled:opacity-40 disabled:pointer-events-none"
        >
          ↺ Undo
        </button>
      </div>

      {viewingPhoto && viewingPhotoIndex !== null && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-lg"
          onClick={() => setViewingPhotoIndex(null)}
        >
          <div className="flex flex-col items-center gap-3 max-w-[85%]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewingPhoto.previewUrl}
              alt="Route photo"
              className="max-w-full max-h-[45vh] rounded-lg border border-zinc-700 shadow-elevation-3 object-contain"
            />
            <div className="flex gap-2">
              {onReplacePhoto && (
                <button
                  type="button"
                  onClick={() => replaceInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg border border-zinc-600 bg-zinc-900/95 text-zinc-100 text-xs font-medium backdrop-blur-sm shadow-elevation-3 transition-[background-color,transform] duration-150 hover:bg-zinc-800 active:scale-[0.94] touch-manipulation"
                >
                  Replace
                </button>
              )}
              {onRemovePhoto && (
                <button
                  type="button"
                  onClick={() => {
                    onRemovePhoto(viewingPhotoIndex);
                    setViewingPhotoIndex(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-red-800/60 bg-red-950/90 text-red-200 text-xs font-medium backdrop-blur-sm shadow-elevation-3 transition-[background-color,transform] duration-150 hover:bg-red-900/80 active:scale-[0.94] touch-manipulation"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewingPhotoIndex(null)}
                className="px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-900/95 text-zinc-300 text-xs font-medium backdrop-blur-sm shadow-elevation-3 transition-[background-color,transform] duration-150 hover:bg-zinc-800 active:scale-[0.94] touch-manipulation"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || viewingPhotoIndex === null || !onReplacePhoto) return;
          onReplacePhoto(viewingPhotoIndex, file);
          setViewingPhotoIndex(null);
        }}
      />
    </div>
  );
}
