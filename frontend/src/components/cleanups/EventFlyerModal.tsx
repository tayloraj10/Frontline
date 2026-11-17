"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import BodyPortal from "@/components/ui/BodyPortal";
import SocialIcon from "@/components/ui/SocialIcon";
import { createClient } from "@/lib/supabase/client";
import { downloadImage, shareImage } from "@/lib/share";
import type { CleanupEventDetailData } from "@/lib/cleanupEvents";
import {
  FLYER_MAP_ASPECT,
  FLYER_RECTS,
  FLYER_PALETTES,
  canvasToBlob,
  formatFlyerDate,
  handleFromLink,
  renderEventFlyer,
  type FlyerPalette,
  type LogoCorner,
} from "@/lib/eventFlyer";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const EARTH_RADIUS_METERS = 6371000;

const MAP_STYLES = [
  { id: "outdoor", label: "Terrain" },
  { id: "streets", label: "Streets" },
  { id: "hybrid", label: "Satellite" },
] as const;
type MapStyleId = (typeof MAP_STYLES)[number]["id"];

const PLATFORMS: { key: string; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
  { key: "youtube", label: "YouTube" },
  { key: "twitter", label: "X" },
  { key: "website", label: "Website" },
];

const LOGO_CORNERS: { id: LogoCorner; label: string; title: string }[] = [
  { id: "off", label: "Off", title: "Hide logo" },
  { id: "tl", label: "↖", title: "Top left" },
  { id: "tr", label: "↗", title: "Top right" },
  { id: "bl", label: "↙", title: "Bottom left" },
  { id: "br", label: "↘", title: "Bottom right" },
  { id: "center", label: "●", title: "Center" },
];

function styleUrl(id: string) {
  return `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`;
}

function circlePolygon(lat: number, lng: number, radiusMeters: number, steps = 48): [number, number][] {
  const latRad = (lat * Math.PI) / 180;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    coords.push([
      lng + (dx / (EARTH_RADIUS_METERS * Math.cos(latRad))) * (180 / Math.PI),
      lat + (dy / EARTH_RADIUS_METERS) * (180 / Math.PI),
    ]);
  }
  return coords;
}

const labelCls = "block text-xs font-semibold text-zinc-400 mb-1.5";
const inputCls =
  "w-full min-h-11 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500";
const chipBase =
  "min-h-11 px-3 rounded-full text-sm font-semibold border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] touch-manipulation";
const chipOn = "bg-zinc-100 text-zinc-900 border-zinc-100";
const chipOff = "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 active:bg-zinc-700";

const THEME_STORAGE_KEY = "frontline:flyer-theme";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Hex text field that stays editable while typing and only commits a valid #rrggbb value. */
function HexInput({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [typed, setTyped] = useState<string | null>(null);
  const draft = typed ?? value;
  const setDraft = setTyped;
  const valid = HEX_RE.test(draft);
  return (
    <input
      aria-label={`${label} hex code`}
      value={draft}
      maxLength={7}
      spellCheck={false}
      onChange={(e) => {
        let v = e.target.value.trim();
        if (v && !v.startsWith("#")) v = `#${v}`;
        setDraft(v);
        if (HEX_RE.test(v)) onCommit(v.toLowerCase());
      }}
      onBlur={() => setTyped(null)}
      className={`w-[5.5rem] min-h-9 rounded-lg bg-zinc-900 border px-2 text-xs font-mono text-center text-zinc-100 ${valid ? "border-zinc-700" : "border-red-500"}`}
    />
  );
}

function loadSavedTheme(): { paletteId?: string; custom?: FlyerPalette } {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { paletteId?: string; custom?: Partial<FlyerPalette> };
    const c = parsed.custom;
    const customOk =
      !!c && (["bg", "cardA", "cardB", "cardC", "text"] as const).every((k) => HEX_RE.test(String(c[k])));
    const idOk = parsed.paletteId === "custom" ? customOk : FLYER_PALETTES.some((p) => p.id === parsed.paletteId);
    return {
      paletteId: idOk ? parsed.paletteId : undefined,
      custom: customOk ? ({ ...(c as FlyerPalette), id: "custom", label: "Custom" }) : undefined,
    };
  } catch {
    return {};
  }
}

function collectCoords(node: unknown, out: [number, number][]) {
  if (!Array.isArray(node)) return;
  if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
    out.push([node[0], node[1]]);
    return;
  }
  for (const n of node) collectCoords(n, out);
}

/** Default framing: the route plus its check-in zone, or the check-in circle for point events. */
function defaultBounds(event: CleanupEventDetailData): maplibregl.LngLatBounds | null {
  const pts: [number, number][] = [];
  const route = event.route?.coordinates ?? null;
  if (route && route.length >= 2) {
    collectCoords(route, pts);
    if (event.route_buffer) collectCoords((event.route_buffer as { coordinates?: unknown }).coordinates, pts);
  } else if (event.check_in_radius_meters) {
    pts.push(...circlePolygon(event.lat, event.lng, event.check_in_radius_meters));
  }
  if (pts.length < 2) return null;
  return pts.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(pts[0], pts[0]));
}

/**
 * Route events start one zoom level past "route plus check-in zone", but never so far in that part of
 * the route falls outside the frame. The check-in zone is allowed to be cropped.
 */
function routeCamera(m: maplibregl.Map, event: CleanupEventDetailData, padding: number) {
  const coords = event.route?.coordinates ?? null;
  if (!coords || coords.length < 2) return null;
  const pts: [number, number][] = [];
  collectCoords(coords, pts);
  const routeBounds = pts.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(pts[0], pts[0]));
  const zoneBounds = defaultBounds(event);
  const routeCam = m.cameraForBounds(routeBounds, { padding });
  const zoneCam = zoneBounds ? m.cameraForBounds(zoneBounds, { padding }) : undefined;
  if (!routeCam || !zoneCam || routeCam.zoom === undefined || zoneCam.zoom === undefined) return null;
  return { center: routeCam.center, zoom: Math.min(zoneCam.zoom + 1, routeCam.zoom) };
}

/** Roomier than the event page map so the whole zone is visible on the flyer. */
function framePadding(el: HTMLElement) {
  return Math.max(24, Math.min(90, Math.floor(Math.min(el.clientWidth, el.clientHeight || 140) / 6)));
}

const PIN_PATH =
  "M27,13.5C27,19.07 20.25,27 14.75,34.5C14.375,35.02 13.625,35.02 13.25,34.5C7.75,27 0,19.07 0,13.5C0,6.04 6.04,0 13.5,0C20.96,0 27,6.04 27,13.5Z";

/** The maplibre default Marker teardrop, drawn with its tip at (x, y). */
function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, scale: number) {
  ctx.save();
  ctx.translate(x - 13.5 * scale, y - 35 * scale);
  ctx.scale(scale, scale);
  const path = new Path2D(PIN_PATH);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke(path);
  ctx.beginPath();
  ctx.arc(13.5, 13.5, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

export default function EventFlyerModal({
  event,
  onClose,
}: {
  event: CleanupEventDetailData;
  onClose: () => void;
}) {
  const { dateLine, timeLine } = useMemo(() => formatFlyerDate(event.scheduled_start), [event.scheduled_start]);
  const cityState = [event.city, event.state].filter(Boolean).join(", ");
  // Street address leads; city/zip sit underneath. No street address means the organizer must enter one.
  const defaultVenue = event.address_line1 ?? "";
  const defaultAddress = [cityState, event.postal_code].filter(Boolean).join(" ");
  const cohosts = useMemo(() => event.cohost_groups ?? [], [event.cohost_groups]);
  const partnerLine = cohosts.length > 0 ? `in partnership with ${cohosts.map((c) => c.group_name).join(" & ")}` : "";
  const logoUrls = useMemo(
    () => [event.group_logo_url, ...cohosts.map((c) => c.group_logo_url)].filter((u): u is string => !!u),
    [event.group_logo_url, cohosts],
  );

  // Text
  const [title, setTitle] = useState(event.group_name);
  const [venue, setVenue] = useState(defaultVenue);
  const [address, setAddress] = useState(defaultAddress);
  const [meetNote, setMeetNote] = useState(event.title);
  const [meetDetails, setMeetDetails] = useState(event.meetup_details ?? "");
  const [details, setDetails] = useState(event.description ?? "");

  // Look
  // The modal only mounts after a click, so reading localStorage in the initializer is safe
  const [saved] = useState(loadSavedTheme);
  const [paletteId, setPaletteId] = useState(saved.paletteId ?? FLYER_PALETTES[0].id);
  const [custom, setCustom] = useState<FlyerPalette>(
    saved.custom ?? { ...FLYER_PALETTES[0], id: "custom", label: "Custom" },
  );
  const [logoCorner, setLogoCorner] = useState<LogoCorner>("off");

  // Social handle
  const [socialLinks, setSocialLinks] = useState<Record<string, string | null> | null>(null);
  const [platform, setPlatform] = useState<string>("");

  // Map
  const [mapStyle, setMapStyle] = useState<MapStyleId>("outdoor");
  const [showZone, setShowZone] = useState(true);
  const [showQr, setShowQr] = useState(true);
  const [mapVersion, setMapVersion] = useState(0);
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapImageRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const showZoneRef = useRef(showZone);
  const logoCornerRef = useRef(logoCorner);
  const snapshotRef = useRef<(() => void) | null>(null);

  // Output
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const palette = paletteId === "custom" ? custom : (FLYER_PALETTES.find((p) => p.id === paletteId) ?? FLYER_PALETTES[0]);
  const missingAddress = venue.trim() === "";
  const missingNotes = [
    missingAddress && "Street address: the \u201cMeet at\u201d section is left off the flyer.",
    meetDetails.trim() === "" && "Meetup details: say exactly where to meet so people can find you.",
    details.trim() === "" && "Description: a generic message fills that card.",
  ].filter((n): n is string => !!n);
  const availablePlatforms = PLATFORMS.filter((p) => !!handleFromLink(p.key, socialLinks?.[p.key]));
  const handle = platform ? handleFromLink(platform, socialLinks?.[platform]) : "";

  // Remember the last theme and custom colors on this device
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ paletteId, custom }));
    } catch {
      // storage unavailable: nothing to persist to
    }
  }, [paletteId, custom]);

  // Load the group's saved social links so the organizer can pick which one to show
  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("groups")
      .select("social_links")
      .eq("id", event.group_id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        const links = (data?.social_links ?? null) as Record<string, string | null> | null;
        setSocialLinks(links);
        const first = PLATFORMS.find((p) => !!handleFromLink(p.key, links?.[p.key]));
        if (first) setPlatform(first.key);
      });
    return () => {
      cancelled = true;
    };
  }, [event.group_id]);

  // Lock page scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Live framing map. Rebuilt on style change; camera is carried over so zoom/pan survive.
  useEffect(() => {
    const el = mapElRef.current;
    if (!el || !MAPTILER_KEY) return;
    const route = event.route?.coordinates ?? null;
    const hasRoute = !!route && route.length >= 2;
    const point: [number, number] = [event.lng, event.lat];

    const fitPadding = framePadding(el);
    const startBounds = defaultBounds(event);
    const m = new maplibregl.Map({
      container: el,
      style: styleUrl(mapStyle),
      interactive: true,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      ...(cameraRef.current
        ? { center: cameraRef.current.center, zoom: cameraRef.current.zoom }
        : startBounds
          ? { bounds: startBounds, fitBoundsOptions: { padding: fitPadding } }
          : { center: point, zoom: 15 }),
    });
    mapRef.current = m;
    if (!cameraRef.current) {
      const cam = routeCamera(m, event, fitPadding);
      if (cam) m.jumpTo(cam);
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const snapshot = () => {
      const src = m.getCanvas();
      if (!src.width || !src.height) return;
      const c = document.createElement("canvas");
      c.width = src.width;
      c.height = src.height;
      const cctx = c.getContext("2d");
      if (!cctx) return;
      cctx.drawImage(src, 0, 0);
      // DOM markers are not in a WebGL capture, so draw the same teardrop pins the event page uses
      const ratio = src.width / (el.clientWidth || src.width);
      const pins: Array<{ ll: [number, number]; color: string }> = hasRoute
        ? [
            { ll: route![0] as [number, number], color: "#22c55e" },
            { ll: route![route!.length - 1] as [number, number], color: "#ef4444" },
          ]
        : logoCornerRef.current !== "center" || logoUrls.length === 0
          ? [{ ll: point as [number, number], color: "#ef4444" }]
          : [];
      for (const pin of pins) {
        const pt = m.project(pin.ll);
        drawPin(cctx, pt.x * ratio, pt.y * ratio, pin.color, ratio);
      }
      mapImageRef.current = c;
      setMapVersion((v) => v + 1);
    };
    const scheduleSnapshot = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(snapshot, 120);
    };
    snapshotRef.current = scheduleSnapshot;

    m.on("load", () => {
      const zoneData: GeoJSON.Feature | GeoJSON.FeatureCollection =
        hasRoute && event.route_buffer
          ? { type: "Feature", properties: {}, geometry: event.route_buffer }
          : !hasRoute && event.check_in_radius_meters
            ? {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [circlePolygon(event.lat, event.lng, event.check_in_radius_meters)],
              },
            }
            : { type: "FeatureCollection", features: [] };
      const vis = showZoneRef.current ? "visible" : "none";
      // Same layers and styling as RoutePreviewMap on the event page (static: no comet/pulse
      // animation, so the map settles to idle and can be captured).
      m.addSource("flyer-zone", { type: "geojson", data: zoneData });
      m.addLayer({
        id: "flyer-zone-fill",
        type: "fill",
        source: "flyer-zone",
        layout: { visibility: vis },
        paint: { "fill-color": "#38bdf8", "fill-opacity": 0.08 },
      });
      m.addLayer({
        id: "flyer-zone-line",
        type: "line",
        source: "flyer-zone",
        layout: { visibility: vis },
        paint: { "line-color": "#38bdf8", "line-width": 1.5, "line-opacity": 0.65 },
      });
      if (hasRoute) {
        m.addSource("flyer-route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route! } },
        });
        m.addLayer({
          id: "flyer-route-glow",
          type: "line",
          source: "flyer-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#38bdf8",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 9, 16, 20],
            "line-blur": 6,
            "line-opacity": 0.4,
          },
        });
        m.addLayer({
          id: "flyer-route-casing",
          type: "line",
          source: "flyer-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 8],
            "line-opacity": 0.9,
          },
        });
        m.addLayer({
          id: "flyer-route-line",
          type: "line",
          source: "flyer-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0284c7", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 5] },
        });
        m.addLayer({
          id: "flyer-route-arrows",
          type: "symbol",
          source: "flyer-route",
          layout: {
            "symbol-placement": "line",
            "symbol-spacing": 26,
            "text-field": "▶",
            "text-size": 14,
            "text-rotation-alignment": "map",
            "text-pitch-alignment": "map",
            "text-keep-upright": false,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: { "text-color": "#0c4a6e", "text-halo-color": "#ecfeff", "text-halo-width": 1 },
        });
      }
      scheduleSnapshot();
    });
    m.on("idle", scheduleSnapshot);

    return () => {
      if (timer) clearTimeout(timer);
      const c = m.getCenter();
      cameraRef.current = { center: [c.lng, c.lat], zoom: m.getZoom() };
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle]);

  function resetMap() {
    const m = mapRef.current;
    const el = mapElRef.current;
    if (!m || !el) return;
    cameraRef.current = null;
    const bounds = defaultBounds(event);
    const cam = routeCamera(m, event, framePadding(el));
    if (cam) {
      m.jumpTo(cam);
    } else if (bounds) {
      m.fitBounds(bounds, { padding: framePadding(el), duration: 0 });
    } else {
      m.jumpTo({ center: [event.lng, event.lat], zoom: 15 });
    }
  }

  // A centered logo replaces the pin on point events: redraw the map snapshot when it changes
  useEffect(() => {
    logoCornerRef.current = logoCorner;
    snapshotRef.current?.();
  }, [logoCorner]);

  // Zone toggle flips layer visibility in place
  useEffect(() => {
    showZoneRef.current = showZone;
    const m = mapRef.current;
    if (!m) return;
    const vis = showZone ? "visible" : "none";
    for (const id of ["flyer-zone-fill", "flyer-zone-line"]) {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", vis);
    }
  }, [showZone]);

  // Re-render the flyer whenever any option (or the map frame) changes
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const canvas = await renderEventFlyer({
          palette,
          title,
          meetLabel: "Meet at",
          venue,
          address,
          meetNote,
          meetDetails,
          details,
          dateLine,
          timeLine,
          handle,
          handlePlatform: handle ? platform : undefined,
          mapImage: mapImageRef.current,
          logoUrls,
          logoCorner,
          partnerLine,
          logoRing: event.route ? "#ffffff" : "#38bdf8",
          eventUrl: showQr ? `${window.location.origin}/cleanup-events/${event.id}` : undefined,
        });
        const blob = await canvasToBlob(canvas);
        if (cancelled || !blob) return;
        blobRef.current = blob;
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setError(null);
      } catch {
        if (!cancelled) setError("Could not render the flyer. Try again.");
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [palette, title, venue, address, meetNote, meetDetails, details, dateLine, timeLine, handle, platform, logoCorner, mapVersion, logoUrls, partnerLine, event.route, showQr]);

  useEffect(() => {
    return () => {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const filename = `${event.group_slug}-event-flyer.png`;
  const shareOpts = { title: event.title, text: `Join ${event.group_name} for ${event.title}!` };

  async function handleDownload() {
    if (!blobRef.current) return;
    setBusy("download");
    try {
      await downloadImage(blobRef.current, filename, shareOpts);
    } catch {
      setError("Download failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (!blobRef.current) return;
    setBusy("share");
    try {
      await shareImage(blobRef.current, filename, shareOpts);
    } catch {
      // user dismissing the share sheet throws; not an error worth surfacing
    } finally {
      setBusy(null);
    }
  }

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center">
        <div className="w-full sm:max-w-5xl max-h-[100dvh] sm:max-h-[92vh] bg-zinc-950 sm:rounded-2xl border border-zinc-800 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
            <h2 className="font-display font-extrabold text-lg text-zinc-100">Event flyer</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-11 h-11 flex items-center justify-center text-2xl leading-none text-zinc-300 hover:text-white active:text-white touch-manipulation"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 grid gap-5 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
            {/* Preview + export */}
            <div className="space-y-3 md:sticky md:top-0">
              <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900" style={{ aspectRatio: "1080 / 1350" }}>
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Flyer preview" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-zinc-500">Rendering...</div>
                )}
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              {missingNotes.length > 0 && (
                <div role="note" className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/90">
                  <p className="font-medium text-amber-200">Not filled in yet (optional)</p>
                  <ul className="mt-1 space-y-0.5 list-disc pl-4 text-amber-200/70">
                    {missingNotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!previewUrl || busy !== null}
                  className="flex-1 min-h-11 rounded-full bg-emerald-500 text-zinc-950 text-sm font-bold disabled:opacity-50 active:scale-[0.97] transition-transform duration-150 touch-manipulation"
                >
                  {busy === "download" ? "Saving..." : "Download"}
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={!previewUrl || busy !== null}
                  className="flex-1 min-h-11 rounded-full bg-zinc-800 text-zinc-100 text-sm font-bold disabled:opacity-50 active:scale-[0.97] transition-transform duration-150 touch-manipulation"
                >
                  {busy === "share" ? "Sharing..." : "Share"}
                </button>
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-5 min-w-0">
              <section>
                <span className={labelCls}>Colors</span>
                <div className="flex flex-wrap gap-2">
                  {FLYER_PALETTES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPaletteId(p.id)}
                      aria-label={p.label}
                      aria-pressed={p.id === paletteId}
                      className={`flex items-center gap-2 min-h-11 pl-2 pr-3 rounded-full border text-xs font-semibold touch-manipulation active:scale-[0.97] transition-transform duration-150 ${p.id === paletteId ? "border-zinc-100 text-zinc-100" : "border-zinc-700 text-zinc-400"}`}
                    >
                      <span className="flex -space-x-1.5">
                        {[p.bg, p.cardA, p.cardB].map((c, i) => (
                          <span key={i} className="w-5 h-5 rounded-full border border-zinc-600" style={{ background: c }} />
                        ))}
                      </span>
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (paletteId !== "custom") setCustom({ ...palette, id: "custom", label: "Custom" });
                      setPaletteId("custom");
                    }}
                    aria-pressed={paletteId === "custom"}
                    className={`flex items-center gap-2 min-h-11 px-3 rounded-full border text-xs font-semibold touch-manipulation active:scale-[0.97] transition-transform duration-150 ${paletteId === "custom" ? "border-zinc-100 text-zinc-100" : "border-zinc-700 text-zinc-400"}`}
                  >
                    Custom
                  </button>
                </div>
                {paletteId === "custom" && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {(
                      [
                        ["bg", "Background"],
                        ["cardA", "Card 1"],
                        ["cardB", "Card 2"],
                        ["cardC", "Card 3"],
                        ["text", "Text"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="flex flex-col items-center gap-1 text-[11px] text-zinc-400">
                        <input
                          type="color"
                          aria-label={label}
                          value={custom[key]}
                          onChange={(e) => setCustom((c) => ({ ...c, [key]: e.target.value }))}
                          className="w-11 h-11 rounded-lg border border-zinc-700 bg-transparent p-0.5 cursor-pointer"
                        />
                        <HexInput value={custom[key]} label={label} onCommit={(v) => setCustom((c) => ({ ...c, [key]: v }))} />
                        {label}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <span className={labelCls}>Social handle on flyer</span>
                {availablePlatforms.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Add Instagram, TikTok, or other links in your group settings to show a handle here.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPlatform("")}
                      className={`${chipBase} ${platform === "" ? chipOn : chipOff}`}
                    >
                      None
                    </button>
                    {availablePlatforms.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPlatform(p.key)}
                        className={`${chipBase} inline-flex items-center gap-1.5 ${platform === p.key ? chipOn : chipOff}`}
                      >
                        <SocialIcon platform={p.key} className="w-4 h-4" />
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
                {handle && <p className="mt-1.5 text-xs text-zinc-500">Shows as {handle}</p>}
              </section>

              <section className="space-y-3">
                <span className={labelCls}>Text</span>
                <div>
                  <label className={labelCls} htmlFor="flyer-title">Title</label>
                  <input id="flyer-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="flyer-venue">Meeting address</label>
                  <input id="flyer-venue" placeholder="e.g. 123 Main St" className={`${inputCls} ${missingAddress ? "!border-amber-400" : ""}`} value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={80} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="flyer-address">City / zip</label>
                  <input id="flyer-address" className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={120} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="flyer-meet">Event title line</label>
                  <textarea id="flyer-meet" className={inputCls} rows={2} value={meetNote} onChange={(e) => setMeetNote(e.target.value)} maxLength={140} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="flyer-meetdetails">Meeting details (optional)</label>
                  <textarea
                    id="flyer-meetdetails"
                    placeholder="e.g. Meet by the bagel shop on the corner. Look for the green shirts."
                    className={`${inputCls} ${meetDetails.trim() === "" ? "!border-amber-400/60" : ""}`}
                    rows={2}
                    value={meetDetails}
                    onChange={(e) => setMeetDetails(e.target.value)}
                    maxLength={140}
                  />
                  {meetDetails.trim() === "" && (
                    <p className="mt-1 text-xs text-amber-300">
                      Tip: say exactly where to meet so people can find you. Not required.
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelCls} htmlFor="flyer-details">Details</label>
                  <textarea id="flyer-details" className={inputCls} rows={4} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={400} />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => setShowQr((v) => !v)}
                    aria-pressed={showQr}
                    className={`${chipBase} ${showQr ? chipOn : chipOff}`}
                  >
                    RSVP QR code: {showQr ? "On" : "Off"}
                  </button>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-zinc-400">Map</span>
                  <div className="flex gap-1">
                    {MAP_STYLES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setMapStyle(s.id)}
                        className={`px-2.5 min-h-9 rounded-full text-xs font-semibold border touch-manipulation ${mapStyle === s.id ? chipOn : chipOff}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {MAPTILER_KEY ? (
                  <div className="relative mx-auto" style={{ width: "min(100%, 340px)", aspectRatio: String(FLYER_MAP_ASPECT), containerType: "inline-size" }}>
                    {/* maplibre's CSS forces position:relative on its container, so give it a sized wrapper */}
                    <div className="absolute inset-0 rounded-xl overflow-hidden border border-zinc-700">
                      <div ref={mapElRef} className="w-full h-full" />
                    </div>
                    {logoUrls.length > 0 && logoCorner !== "off" && (() => {
                      // Mirrors the logo row drawn onto the flyer, scaled to this map's width
                      const w = FLYER_RECTS.map.w;
                      const n = logoUrls.length;
                      const size = n > 2 ? 72 : n > 1 ? 80 : 92;
                      const inset = (18 / w) * 100;
                      const sizePct = (size / w) * 100;
                      const pos: React.CSSProperties = {
                        top: logoCorner === "tl" || logoCorner === "tr" ? `${inset}%` : logoCorner === "center" ? "50%" : undefined,
                        bottom: logoCorner === "bl" || logoCorner === "br" ? `${inset}%` : undefined,
                        left: logoCorner === "tl" || logoCorner === "bl" ? `${inset}%` : logoCorner === "center" ? "50%" : undefined,
                        right: logoCorner === "tr" || logoCorner === "br" ? `${inset}%` : undefined,
                        transform: logoCorner === "center" ? "translate(-50%, -50%)" : undefined,
                      };
                      return (
                        <div className="absolute flex pointer-events-none" style={pos}>
                          {logoUrls.map((u, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={u + i}
                              src={u}
                              alt=""
                              className="rounded-full object-cover shadow-lg"
                              style={{
                                width: `calc(${sizePct}cqw)`,
                                aspectRatio: "1",
                                marginLeft: i === 0 ? 0 : `calc(${-sizePct * 0.28}cqw)`,
                                border: `3px solid ${event.route ? "#ffffff" : "#38bdf8"}`,
                              }}
                            />
                          ))}
                        </div>
                      );
                    })()}
                    <div className="absolute top-2 right-2 flex flex-col rounded-lg overflow-hidden border border-zinc-700/70 bg-zinc-900/90">
                      <button
                        type="button"
                        onClick={() => mapRef.current?.zoomIn()}
                        aria-label="Zoom in"
                        className="w-10 h-10 text-lg text-zinc-100 active:bg-zinc-700 touch-manipulation"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => mapRef.current?.zoomOut()}
                        aria-label="Zoom out"
                        className="w-10 h-10 text-lg text-zinc-100 border-t border-zinc-700 active:bg-zinc-700 touch-manipulation"
                      >
                        −
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">Map preview unavailable (no map key configured).</p>
                )}
                <p className="mt-1.5 text-xs text-zinc-500">Drag and zoom the map to frame the flyer.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={resetMap}
                    className={`${chipBase} ${chipOff}`}
                  >
                    Reset map
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowZone((v) => !v)}
                    aria-pressed={showZone}
                    className={`${chipBase} ${showZone ? chipOn : chipOff}`}
                  >
                    {event.route ? "Check-in zone" : "Check-in radius"}: {showZone ? "On" : "Off"}
                  </button>
                </div>
                {logoUrls.length > 0 && (
                  <div className="mt-3">
                    <span className={labelCls}>{logoUrls.length > 1 ? "Group logos position" : "Group logo position"}</span>
                    <div className="flex flex-wrap gap-2">
                      {LOGO_CORNERS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          title={c.title}
                          aria-label={c.title}
                          onClick={() => setLogoCorner(c.id)}
                          className={`${chipBase} min-w-11 ${logoCorner === c.id ? chipOn : chipOff}`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
