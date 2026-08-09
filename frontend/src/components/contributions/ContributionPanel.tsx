"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Camera } from "@capacitor/camera";
import type { MediaResult } from "@capacitor/camera";
import { isNativePlatform } from "@/lib/capacitor";
import { createClient } from "@/lib/supabase/client";
import { useGameSettings, SettingValue } from "@/lib/gameSettings";
import { refreshUserPoints } from "@/lib/userPoints";
import { formatPoints } from "@/lib/formatPoints";
import { createCleanupEvent } from "@/lib/cleanupEvents";
import { getIntersectingGeoUnits, type IntersectingGeoUnit, type RouteLineString } from "@/lib/cleanupRoutes";
import AddressAutocomplete from "@/app/admin/AddressAutocomplete";
import CohostGroupPicker from "@/components/cleanups/CohostGroupPicker";
import Lightbox from "@/components/Lightbox";
import IconButton from "@/components/ui/IconButton";

const MiniMapPreview = dynamic(() => import("@/components/map/MiniMapPreview"), {
  ssr: false,
  loading: () => <div className="w-full h-[100px] rounded-lg bg-zinc-800 animate-pulse" />,
});

const RoutePreviewMap = dynamic(() => import("@/components/map/RoutePreviewMap"), {
  ssr: false,
  loading: () => <div className="w-full h-[140px] rounded-lg bg-zinc-800 animate-pulse" />,
});

interface Coords {
  latitude: number;
  longitude: number;
}

// Matches the hex bloom wave duration in CampaignMap.tsx (1.3s) plus a short buffer,
// so the success modal doesn't cover the map before the animation finishes.
const BLOOM_ANIMATION_MS = 1500;

function cleanupValue(smallBags: number, largeBags: number, smallBagValue: number, largeBagValue: number): number {
  return smallBags * smallBagValue + largeBags * largeBagValue;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed?.detail) && typeof parsed.detail[0]?.msg === "string") {
      return parsed.detail[0].msg.replace(/^Value error,\s*/, "");
    }
  } catch {
    // not JSON, fall through to generic fallback
  }
  return fallback;
}

const MAP_STYLES = [
  { id: "outdoor", label: "Terrain" },
  { id: "streets", label: "Streets" },
  { id: "hybrid", label: "Satellite" },
] as const;

const CONTRIBUTION_LOCATION_NOUN: Record<string, string> = {
  cleanup: "cleanup",
  photo: "photo",
  registration: "registration",
  advocacy: "action",
  civic_action: "civic action",
  unfollow: "unfollow",
  solarpunk_action: "action",
};

const PANEL_BUTTON: Record<string, { icon: string; label: string }> = {
  cleanup: { icon: "🗑️", label: "Log Cleanup" },
  photo: { icon: "📷", label: "Submit Photo" },
  registration: { icon: "🗳️", label: "Register" },
  advocacy: { icon: "✊", label: "Take Action" },
  civic_action: { icon: "🗽", label: "Log Civic Action" },
  unfollow: { icon: "🧠", label: "Log Unfollow" },
  solarpunk_action: { icon: "🌿", label: "Log Action" },
  solarpunk_photo: { icon: "📸", label: "Spot It" },
};

const MODAL_CONFIG: Record<string, {
  title: string;
  successClaimed: string;
  successUnclaimed: string;
}> = {
  cleanup: {
    title: "Log Cleanup",
    successClaimed: "Cleanup logged!",
    successUnclaimed: "Cleanup logged!",
  },
  photo: {
    title: "Submit Photo",
    successClaimed: "Photo on the map!",
    successUnclaimed: "Photo submitted!",
  },
  registration: {
    title: "Register",
    successClaimed: "Registration logged!",
    successUnclaimed: "Registration logged!",
  },
  advocacy: {
    title: "Take Action",
    successClaimed: "Action logged!",
    successUnclaimed: "Action logged!",
  },
  civic_action: {
    title: "Log Civic Action",
    successClaimed: "Action logged! State progress updated.",
    successUnclaimed: "Action logged!",
  },
  unfollow: {
    title: "Log Unfollow",
    successClaimed: "Unfollow logged! You're on the map.",
    successUnclaimed: "Unfollow logged!",
  },
  solarpunk_action: {
    title: "Log Solarpunk Action",
    successClaimed: "Action logged! Your hex is blooming 🌱",
    successUnclaimed: "Action logged! 🌱",
  },
  solarpunk_photo: {
    title: "Spot It",
    successClaimed: "Photo added to the bloom map! 🌿",
    successUnclaimed: "Photo logged! 🌿",
  },
};

const CIVIC_ACTIONS: { key: string; icon: string; label: string }[] = [
  { key: "register_independent", icon: "🗳️", label: "Register as Independent" },
  { key: "town_hall", icon: "🏛️", label: "Attend a Town Hall" },
  { key: "contact_representative", icon: "📬", label: "Contact Your Rep" },
  { key: "volunteer", icon: "🤝", label: "Volunteer for Civic Org" },
  { key: "visit_landmark", icon: "🗽", label: "Visit a Landmark" },
  { key: "attend_protest", icon: "✊", label: "Attend a Protest" },
  { key: "read_founding_document", icon: "📜", label: "Read a Founding Document" },
];

const SOLARPUNK_ACTIONS: {
  category: string;
  icon: string;
  actions: ({ key: string; label: string; points: number } | { key: string; label: string; link: string })[];
}[] = [
    {
      category: "Energy", icon: "⚡",
      actions: [
        { key: "unplug_electronics", label: "Unplugged unused electronics/chargers when not in use", points: 5 },
        { key: "solar_charger", label: "Used a solar charger for your devices", points: 8 },
        { key: "led_lighting", label: "Switched all lighting to LEDs", points: 10 },
        { key: "energy_audit", label: "Completed a home energy audit", points: 14 },
        { key: "weatherize", label: "Weatherstripped, air-sealed, or upgraded insulation", points: 22 },
        { key: "green_energy", label: "Switched to a green energy tariff/provider", points: 26 },
        { key: "solar_panels", label: "Installed solar panels, or joined a community solar subscription", points: 55 },
      ],
    },
    {
      category: "Food", icon: "🌱",
      actions: [
        { key: "foraged", label: "Foraged or wildcrafted food", points: 6 },
        { key: "plant_based_week", label: "Ate plant-based meals for a full week", points: 10 },
        { key: "saved_seeds", label: "Saved seeds for next season's planting", points: 12 },
        { key: "composted", label: "Started a compost bin", points: 15 },
        { key: "grow_food", label: "Grew your own fruits, vegetables, or herbs for a season", points: 22 },
        { key: "csa_coop", label: "Joined a CSA or food co-op", points: 28 },
        { key: "community_garden", label: "Started or joined a community garden", points: 38 },
      ],
    },
    {
      category: "Transport", icon: "🚲",
      actions: [
        { key: "walk_bike_trip", label: "Walked or biked instead of driving for a trip", points: 5 },
        { key: "carpool", label: "Carpooled or rideshared instead of driving alone", points: 8 },
        { key: "transit_day", label: "Used public transit instead of driving for a day", points: 12 },
        { key: "bike_commute_week", label: "Biked or walked as your commute for a week", points: 18 },
        { key: "car_free_week", label: "Went car-free for a week", points: 26 },
        { key: "transit_month", label: "Used public transit as your primary commute for a month", points: 34 },
        { key: "ev_switch", label: "Replaced a car with an e-bike or EV for regular use", points: 50 },
      ],
    },
    {
      category: "Community", icon: "🤝",
      actions: [
        { key: "help_neighbor", label: "Helped a neighbor with a tangible task (yard work, errands, repairs, childcare)", points: 5 },
        { key: "tool_library", label: "Used or donated to a tool library", points: 8 },
        { key: "repair_cafe", label: "Attended a repair café", points: 12 },
        { key: "mutual_aid", label: "Participated in a mutual aid network (gave or received support)", points: 16 },
        { key: "skill_share", label: "Hosted a skill share", points: 22 },
        { key: "organize_repair_drive", label: "Organized a repair café or mutual aid drive", points: 32 },
        { key: "cooperative", label: "Joined or helped start a cooperative", points: 45 },
      ],
    },
    {
      category: "Nature", icon: "🌳",
      actions: [
        { key: "trash_war_link", label: "Picked up litter or ran a cleanup? Log it in Trash War for credit", link: "/campaigns/trash-war?ref=solarpunk" },
        { key: "bird_house", label: "Built or hung a bird, bee, or bat house", points: 8 },
        { key: "plant_natives", label: "Planted native plants or trees (yard, container, or public space)", points: 16 },
        { key: "remove_invasives", label: "Removed invasive plant species from a natural area", points: 20 },
        { key: "rewild_lawn", label: "Left part of a lawn unmowed or rewilded it with native plants", points: 24 },
        { key: "rain_barrel", label: "Installed a rain barrel or greywater system", points: 34 },
        { key: "habitat_restoration", label: "Led a habitat, wetland, or trail restoration project", points: 45 },
      ],
    },
    {
      category: "Consumption", icon: "♻️",
      actions: [
        { key: "reusable", label: "Brought your own bag, cup, or container instead of using disposable ones", points: 5 },
        { key: "repair_item", label: "Repaired something instead of replacing it", points: 8 },
        { key: "secondhand", label: "Bought something secondhand instead of new", points: 10 },
        { key: "plastic_free_week", label: "Went a full week avoiding single-use plastic and packaging", points: 16 },
        { key: "clothing_swap", label: "Organized or attended a clothing/goods swap", points: 20 },
        { key: "zero_waste_month", label: "Went a full month without single-use plastic or disposable packaging (groceries, takeout, shopping)", points: 28 },
        { key: "zero_waste_initiative", label: "Organized a community-wide zero-waste or repair initiative", points: 38 },
      ],
    },
    {
      category: "Advocacy", icon: "✊",
      actions: [
        { key: "petition", label: "Signed or shared a petition or campaign", points: 5 },
        { key: "contact_official", label: "Contacted an elected official", points: 10 },
        { key: "wrote_article", label: "Wrote about solarpunk values (post, letter, article)", points: 12 },
        { key: "attend_council", label: "Attended a city council or town hall meeting", points: 16 },
        { key: "taught_class", label: "Taught a sustainability workshop or class", points: 24 },
        { key: "organized_event", label: "Organized a community sustainability event (workshop series, fundraiser, tree-planting day)", points: 34 },
        { key: "sustained_campaign", label: "Helped lead a sustained local advocacy campaign or initiative (months-long organizing effort)", points: 48 },
      ],
    },
  ];

interface ContributionPanelProps {
  campaignId: string;
  campaignContributionType: string;
  userId: string | null;
  userGroups?: { id: string; name: string; image_url?: string | null; isAdmin?: boolean }[];
  onEnterPinPicker: (coords: Coords, constrained?: boolean, pinPickerLabel?: string) => void;
  pinPickerActive: boolean;
  placedPinCoords: Coords | null;
  onEnterRoutePicker?: () => void;
  routePickerActive?: boolean;
  placedRouteVertices?: [number, number][] | null;
  onContributionSubmitted?: (lat: number | null, lng: number | null, value: number, photoUrl?: string, resolvedReportId?: string, newRoute?: { id: string; route: RouteLineString }, isGroupEvent?: boolean) => void;
  onReportSubmitted?: (lat: number, lng: number, severity: string, photoUrl?: string) => void;
  onRouteAdded?: (route: { id: string; route: RouteLineString }) => void;
  userLocation?: Coords | null;
  locationError?: number | null;
  requestLocation?: () => boolean;
  activeMapStyle?: string;
  onStyleChange?: (id: string) => void;
  pendingCleanupEventId?: string | null;
  onPendingCleanupEventConsumed?: () => void;
  nearbyCleanupEvent?: {
    id: string;
    title: string;
    group_id: string;
    cohost_groups?: { group_id: string; group_name: string; group_slug: string; group_logo_url: string | null }[];
    logging_mode?: "organizer_total" | "individual";
  } | null;
  clickedReport?: ClickedReport | null;
  onClickedReportConsumed?: () => void;
  onClaimReportUpdated?: (reportId: string, patch: Partial<ClickedReport>) => void;
  onClaimReportResolved?: (reportId: string) => void;
  myActiveClaimReport?: ClickedReport | null;
}

// Trimmed shape of ProblemReportMapData needed by the claim flow — avoids importing the
// full CampaignPageClient type (and its unrelated fields) into this file.
interface ClickedReport {
  id: string;
  severity: string;
  reported_at: string;
  photo_url?: string | null;
  latitude: number;
  longitude: number;
  status: string;
  claimed_by_user_id: string | null;
  claim_before_deadline_at: string | null;
  claim_after_deadline_at: string | null;
  flag_count: number;
  unit_type: string | null;
}

const METERS_TO_FEET = 3.28084;
const CLAIM_RADIUS_EARTH_METERS = 6371000;

function formatHotspotDistance(distanceM: number, unitType: string | null): string {
  return unitType === "uk_postcode_district"
    ? `${Math.round(distanceM)}m`
    : `${Math.round(distanceM * METERS_TO_FEET)}ft`;
}

function claimDistanceMeters(a: Coords, lat: number, lng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat - a.latitude);
  const dLng = toRad(lng - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * CLAIM_RADIUS_EARTH_METERS * Math.asin(Math.sqrt(h));
}

function claimRadiusMeters(unitType: string | null, ukMeters: number, usMeters: number): number {
  return unitType === "uk_postcode_district" ? ukMeters : usMeters;
}

// ─── GPS hook ────────────────────────────────────────────────────────────────

function useGPS(
  requestLocation: (() => boolean) | undefined,
  liveCoords: Coords | null | undefined,
  liveErrorCode: number | null | undefined,
) {
  // The map's GeolocateControl (CampaignMap) is the single geolocation source for the
  // whole app — it owns the one continuous watchPosition(). Rather than mirroring its
  // liveCoords/liveErrorCode into local state via effects (which fights React's
  // set-state-in-effect rule and adds a render of lag), status/coords/errorCode are
  // derived directly from the live props each render; `loading` and `manualErrorCode`
  // are the only local state, and both are set exclusively from event handlers
  // (capture/reset) or the timeout callback, never from an effect body.
  const [loading, setLoading] = useState(false);
  const [manualErrorCode, setManualErrorCode] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };
  useEffect(() => clearTimer, []);

  const coords = liveCoords ?? null;
  const errorCode = liveErrorCode ?? manualErrorCode;
  const status: "idle" | "loading" | "success" | "error" = liveCoords
    ? "success"
    : liveErrorCode != null || manualErrorCode !== null
      ? "error"
      : loading
        ? "loading"
        : "idle";

  const capture = () => {
    if (status === "loading" || liveCoords) return;
    if (typeof navigator !== "undefined" && !navigator.geolocation) {
      setManualErrorCode(0);
      return;
    }
    setManualErrorCode(null);
    setLoading(true);
    clearTimer();

    // requestLocation() can return false transiently — CampaignMap (and its
    // GeolocateControl) loads via next/dynamic and may not have registered its
    // trigger yet when this panel mounts. Retry briefly instead of immediately
    // reporting an error for what's usually just a mount race.
    const attempt = (retriesLeft: number) => {
      if (requestLocation?.()) {
        timeoutRef.current = setTimeout(() => {
          setLoading(false);
          setManualErrorCode(3);
        }, 12000);
        return;
      }
      if (retriesLeft <= 0) {
        setLoading(false);
        setManualErrorCode(4);
        return;
      }
      timeoutRef.current = setTimeout(() => attempt(retriesLeft - 1), 250);
    };
    attempt(16);
  };

  const reset = () => {
    clearTimer();
    setLoading(false);
    setManualErrorCode(null);
  };

  return { coords, status, errorCode, capture, reset };
}

// ─── Presign + upload to R2 ──────────────────────────────────────────────────

async function uploadToR2(file: File): Promise<string> {
  const params = new URLSearchParams({ filename: file.name, content_type: file.type });
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/upload/presign?${params}`,
  );
  if (!res.ok) throw new Error("Failed to get upload URL");
  const { upload_url, public_url } = (await res.json()) as {
    upload_url: string;
    public_url: string;
  };

  const put = await fetch(upload_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error("Photo upload failed");

  return public_url;
}

// ─── GPS status indicator ─────────────────────────────────────────────────────

const GPS_ERROR_MSG: Record<number, string> = {
  0: "Location requires HTTPS — use localhost or deploy with SSL",
  1: "Location blocked — allow it in your browser/OS settings",
  2: "Location signal unavailable",
  3: "Location timed out",
  4: "Map is still loading — try again in a moment",
};

function GpsIndicator({
  status,
  coords,
  errorCode,
  onRetry,
}: {
  status: "idle" | "loading" | "success" | "error";
  coords: Coords | null;
  errorCode: number | null;
  onRetry: () => void;
}) {
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-zinc-400 text-sm">
        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
        Capturing location…
      </div>
    );
  }
  if (status === "success" && coords) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-emerald-400">
          {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
        </span>
      </div>
    );
  }
  if (status === "error") {
    const msg = (errorCode !== null && GPS_ERROR_MSG[errorCode]) || "Location unavailable";
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <span className="text-red-400">{msg}</span>
        </div>
        <button onClick={onRetry} className="self-start text-zinc-400 underline hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150 text-xs ml-4">
          Try again
        </button>
      </div>
    );
  }
  return null;
}

// ─── Camera capture ───────────────────────────────────────────────────────────

// Native camera/gallery results come back as a webPath (or file uri as a
// fallback) rather than a File, but uploadToR2 needs a real File, so fetch
// it back through the WebView's registered scheme handler and re-wrap it.
async function mediaResultToFile(result: MediaResult, index = 0): Promise<File> {
  const src = result.webPath ?? result.uri;
  if (!src) throw new Error("Photo capture returned no file");
  const res = await fetch(src);
  const blob = await res.blob();
  const format = result.metadata?.format?.toLowerCase();
  const ext = format === "png" ? "png" : "jpg";
  return new File([blob], `photo-${Date.now()}-${index}.${ext}`, {
    type: blob.type || (ext === "png" ? "image/png" : "image/jpeg"),
  });
}

function CameraModal({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia
      ? "Camera not supported on this browser — use gallery instead."
      : null,
  );

  useEffect(() => {
    if (error) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setReady(true);
      })
      .catch(() => setError("Camera unavailable — check permissions or use gallery instead."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
        onClose();
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center gap-4 p-4">
      {error ? (
        <>
          <p className="text-red-400 text-sm text-center max-w-xs">{error}</p>
          <button onClick={onClose} className="text-zinc-400 text-sm underline">
            Close
          </button>
        </>
      ) : (
        <>
          <video ref={videoRef} playsInline muted className="w-full max-w-md rounded-lg bg-black" />
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-300 text-sm hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
            >
              Cancel
            </button>
            <button
              onClick={capture}
              disabled={!ready}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-500 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation"
            >
              📸 Capture
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PhotoCaptureInput({
  multiple,
  onFilesSelected,
}: {
  multiple: boolean;
  onFilesSelected: (files: File[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);

  // On native iOS/Android, use the Capacitor plugin for a real native camera
  // and gallery picker — the getUserMedia/<input type=file> paths below are
  // web-only fallbacks (WKWebView doesn't support getUserMedia, and routing
  // through the plain file input's "Take Photo" action sheet option crashed
  // the app before NSCameraUsageDescription was added to Info.plist).
  const handleTakePhoto = async () => {
    if (!isNativePlatform()) {
      setShowCamera(true);
      return;
    }
    try {
      const result = await Camera.takePhoto({ quality: 90 });
      onFilesSelected([await mediaResultToFile(result)]);
    } catch {
      // User cancelled the native camera sheet — nothing to do.
    }
  };

  const handleChooseFromGallery = async () => {
    if (!isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const { results } = await Camera.chooseFromGallery({
        allowMultipleSelection: multiple,
        limit: multiple ? 0 : 1,
      });
      const files = await Promise.all(results.map((r, i) => mediaResultToFile(r, i)));
      if (files.length) onFilesSelected(files);
    } catch {
      // User cancelled the native gallery picker — nothing to do.
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleTakePhoto}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 text-xs font-medium hover:border-zinc-500 hover:text-zinc-100 active:border-zinc-500 active:text-zinc-100 active:scale-[0.97] transition-[background-color,border-color,transform] duration-150 touch-manipulation"
        >
          📷 Take Photo
        </button>
        <button
          type="button"
          onClick={handleChooseFromGallery}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 text-xs font-medium hover:border-zinc-500 hover:text-zinc-100 active:border-zinc-500 active:text-zinc-100 active:scale-[0.97] transition-[background-color,border-color,transform] duration-150 touch-manipulation"
        >
          🖼️ Choose from Gallery
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={(e) => {
          onFilesSelected(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
        className="hidden"
      />
      {showCamera && (
        <CameraModal onCapture={(file) => onFilesSelected([file])} onClose={() => setShowCamera(false)} />
      )}
    </>
  );
}

// ─── Contribute modal ─────────────────────────────────────────────────────────

function ContributeModal({
  campaignId,
  campaignContributionType,
  userId,
  userGroups,
  gps,
  overrideCoords,
  onEnterPinPicker,
  onEnterRoutePicker,
  routeOverride,
  onClose,
  onContributionSubmitted,
  activeMapStyle,
  nearbyEvent,
  claimedReportId,
  prefillPhotoUrls,
}: {
  campaignId: string;
  campaignContributionType: string;
  userId: string | null;
  userGroups: { id: string; name: string; image_url?: string | null }[];
  gps: ReturnType<typeof useGPS>;
  overrideCoords: Coords | null;
  onEnterPinPicker: () => void;
  onEnterRoutePicker: () => void;
  routeOverride: RouteLineString | null;
  onClose: () => void;
  onContributionSubmitted?: (lat: number | null, lng: number | null, value: number, photoUrl?: string, resolvedReportId?: string, newRoute?: { id: string; route: RouteLineString }, isGroupEvent?: boolean) => void;
  activeMapStyle?: string;
  nearbyEvent?: {
    id: string;
    title: string;
    group_id: string;
    cohost_groups?: { group_id: string; group_name: string; group_slug: string; group_logo_url: string | null }[];
    logging_mode?: "organizer_total" | "individual";
  } | null;
  // Set when arriving from the claim-a-report challenge flow: the report is already
  // resolved server-side by that point, so the proximity nearby-hotspot checkbox below
  // doesn't apply — this is a different report, already claimed and completed.
  claimedReportId?: string | null;
  // Before/after photos already captured (and uploaded to R2) during the claim challenge —
  // prefilled here so the user isn't asked to retake/reselect photos they just took.
  prefillPhotoUrls?: string[];
}) {
  const pathname = usePathname();
  const isCleanup = campaignContributionType === "cleanup";
  const isPhoto = campaignContributionType === "photo";
  const isCivicAction = campaignContributionType === "civic_action";
  const isUnfollow = campaignContributionType === "unfollow";
  const needsLocation = isCleanup || isPhoto || isUnfollow;
  const showPhoto = isCleanup || isPhoto || isCivicAction;

  const config = MODAL_CONFIG[campaignContributionType] ?? MODAL_CONFIG.cleanup;

  const { values: gameSettings, loading: settingsLoading } = useGameSettings([
    "small_bag_value",
    "large_bag_value",
    "claim_challenge_multiplier",
    "trash_war_solarpunk_credit",
  ] as const);
  const bagValuesReady = gameSettings.small_bag_value !== undefined && gameSettings.large_bag_value !== undefined;

  const [fromSolarpunk] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("ref") === "solarpunk";
  });

  const [smallBags, setSmallBags] = useState("1");
  const [largeBags, setLargeBags] = useState("0");
  const smallBagsNum = Number(smallBags) || 0;
  const largeBagsNum = Number(largeBags) || 0;
  const [pounds, setPounds] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>(() => prefillPhotoUrls ?? []);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [contributeMode, setContributeMode] = useState<"point" | "route">("point");
  const [route, setRoute] = useState<RouteLineString | null>(null);
  const [intersectingUnits, setIntersectingUnits] = useState<IntersectingGeoUnit[]>([]);
  const [selectedRouteGeoUnitId, setSelectedRouteGeoUnitId] = useState<string | null>(null);
  const [loadingIntersecting, setLoadingIntersecting] = useState(false);

  // A freshly finished route arrives via routeOverride (set by the parent once the map's
  // route-picker reports "Finish route") — look up which zips it crosses so the user can
  // pick exactly one to credit, mirroring the nearby-hotspot lookup pattern below.
  useEffect(() => {
    if (!routeOverride) return;
    setRoute(routeOverride);
    setSelectedRouteGeoUnitId(null);
    setLoadingIntersecting(true);
    getIntersectingGeoUnits({ campaignId, route: routeOverride })
      .then((units) => {
        setIntersectingUnits(units);
        if (units.length === 1) setSelectedRouteGeoUnitId(units[0].geo_unit_id);
      })
      .catch(() => setIntersectingUnits([]))
      .finally(() => setLoadingIntersecting(false));
  }, [routeOverride, campaignId]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("frontline:contrib:group");
      if (stored === "__individual__") return null;
      if (stored && userGroups.some((g) => g.id === stored)) return stored;
    }
    return userGroups.length === 1 ? userGroups[0].id : null;
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "outside" | null>(null);
  const [hotspotCleared, setHotspotCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nearbyReport, setNearbyReport] = useState<{ id: string; distance_m: number; unit_type: string | null } | null>(null);
  const [resolveHotspot, setResolveHotspot] = useState(true);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [activeMultiplier, setActiveMultiplier] = useState<{ multiplier: number; title: string } | null>(null);
  const [appliedMultiplier, setAppliedMultiplier] = useState<{ multiplier: number; title: string } | null>(null);
  const [valueFlash, setValueFlash] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  // Mirrors the nearbyReport claim checkbox below, but for proximity-detected events: the
  // user is opted in by default (matches how being physically at an event implies intent
  // to contribute to it) and can uncheck to log a separate, unrelated cleanup instead.
  const [useNearbyEvent, setUseNearbyEvent] = useState(true);
  useEffect(() => setUseNearbyEvent(true), [nearbyEvent?.id]);

  // A proximity-detected nearby event the user has opted into via the checkbox below.
  const effectiveEventId = useNearbyEvent ? nearbyEvent?.id ?? null : null;
  const isEventMode = isCleanup && Boolean(effectiveEventId);

  // When logging toward a co-hosted event, default the credit-group pill to whichever
  // host group the user belongs to, preferring the primary host over a co-host —
  // mirrors the backend's _group_for_credit preference order used for organizer-logged
  // contributions. Only fires if the user actually belongs to a host group; otherwise
  // leaves whatever default (localStorage / single-group) was already selected.
  useEffect(() => {
    if (!isEventMode || !nearbyEvent) return;
    const hostGroupIds = [nearbyEvent.group_id, ...(nearbyEvent.cohost_groups?.map((g) => g.group_id) ?? [])];
    const preferredGroupId = hostGroupIds.find((id) => userGroups.some((g) => g.id === id));
    if (preferredGroupId) setSelectedGroupId(preferredGroupId);
  }, [isEventMode, nearbyEvent, userGroups]);

  const isRouteMode = isCleanup && contributeMode === "route";

  // Route mode's multiplier comes from whichever zip the user has chosen to credit, using
  // the per-zip active_multiplier data returned alongside the intersecting-zips lookup —
  // never from submitCoords, which in route mode reflects a stale GPS/pin location that may
  // be nowhere near the drawn route.
  const selectedRouteMultiplier = isRouteMode
    ? intersectingUnits.find((u) => u.geo_unit_id === selectedRouteGeoUnitId)?.active_multiplier ?? null
    : null;

  // Scoring never applies a hotspot bonus to an event-linked contribution — only the
  // display banner below uses raw activeMultiplier so it can still show it informationally.
  // Route mode ignores the point-based activeMultiplier entirely (stale GPS/pin location)
  // in favor of selectedRouteMultiplier, computed above from the chosen zip.
  const effectiveMultiplier = effectiveEventId ? null : isRouteMode ? selectedRouteMultiplier : activeMultiplier;

  const submitCoords = overrideCoords ?? gps.coords;
  const baseValue = isCleanup && bagValuesReady
    ? cleanupValue(smallBagsNum, largeBagsNum, gameSettings.small_bag_value!, gameSettings.large_bag_value!)
    : 0;
  // Mirrors record_contribution: the claim-challenge bonus and an active hotspot
  // multiplier don't stack — take whichever is larger, not their product.
  const challengeMultiplier = isCleanup && claimedReportId ? gameSettings.claim_challenge_multiplier ?? 1 : 1;
  const combinedMultiplier = Math.max(effectiveMultiplier?.multiplier ?? 1, challengeMultiplier);
  const finalValue = baseValue * combinedMultiplier;

  // Flash the territory-value number whenever a hotspot bonus kicks it up, so the
  // extra points are legible as an event, not just a bigger static number.
  const prevFinalValueRef = useRef(finalValue);
  useEffect(() => {
    if (effectiveMultiplier && prevFinalValueRef.current !== finalValue) {
      setValueFlash(true);
      const t = setTimeout(() => setValueFlash(false), 400);
      prevFinalValueRef.current = finalValue;
      return () => clearTimeout(t);
    }
    prevFinalValueRef.current = finalValue;
  }, [finalValue, effectiveMultiplier]);

  // Offer to claim a nearby reported hotspot as cleaned up, without assuming it — the
  // user decides whether this cleanup is for that report or just a separate one.
  // Point-mode only — route mode has no single GPS/pin location to key this off of, and
  // is handled instead by the per-zip active_multiplier data on intersectingUnits below.
  useEffect(() => {
    if (!isCleanup || isRouteMode || !submitCoords || claimedReportId) {
      setNearbyReport(null);
      return;
    }
    const controller = new AbortController();
    fetch(
      `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/nearby-hotspot?campaign_id=${campaignId}&lat=${submitCoords.latitude}&lng=${submitCoords.longitude}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setNearbyReport(data?.nearby_report ?? null))
      .catch(() => { });
    return () => controller.abort();
  }, [isCleanup, isRouteMode, campaignId, submitCoords?.latitude, submitCoords?.longitude, claimedReportId]);

  // Check whether the submit location is inside an active boss-spawn hotspot, so the
  // dialog can show the same score multiplier that /contributions/submit will apply.
  // Fetched regardless of event linkage so a hotspot can still be surfaced informationally
  // alongside an event banner; scoring itself still zeroes this out via effectiveMultiplier
  // below (group cleanup events never carry a bonus multiplier, mirroring
  // apply_multiplier=cleanup_event_id is None server-side). Point-mode only — see isRouteMode
  // note above; route mode's multiplier comes from the selected zip's active_multiplier.
  useEffect(() => {
    if (!isCleanup || isRouteMode || !submitCoords) {
      setActiveMultiplier(null);
      return;
    }
    const controller = new AbortController();
    fetch(
      `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/events/campaign/${campaignId}/active-multiplier?lat=${submitCoords.latitude}&lng=${submitCoords.longitude}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setActiveMultiplier(data?.active ? { multiplier: data.multiplier, title: data.title } : null))
      .catch(() => { });
    return () => controller.abort();
  }, [isCleanup, isRouteMode, campaignId, submitCoords?.latitude, submitCoords?.longitude]);

  useEffect(() => {
    setResolveHotspot(true);
  }, [nearbyReport?.id]);

  useEffect(() => {
    const urls = photos.map((p) => URL.createObjectURL(p));
    setPhotoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const canSubmit = (() => {
    if (submitting) return false;
    if (isCleanup && !bagValuesReady) return false;
    if (isRouteMode) {
      if (!route || !selectedRouteGeoUnitId) return false;
    } else if ((isCleanup || isPhoto) && !submitCoords) return false;
    if (isCleanup && (smallBagsNum < 0 || largeBagsNum < 0 || Number(pounds || 0) < 0)) return false;
    if (isCleanup && smallBagsNum + largeBagsNum <= 0) return false;
    if (isPhoto && photos.length === 0) return false;
    if (isCivicAction && !selectedAction) return false;
    if (isUnfollow && !notes.trim()) return false;
    if (isCleanup && nearbyEvent && useNearbyEvent && nearbyEvent.logging_mode === "organizer_total") return false;
    return true;
  })();

  const handleSubmit = async () => {
    if (!canSubmit || !userId) return;
    setSubmitting(true);
    setError(null);
    // Capture whether a hotspot bonus was active right now, before the async submit
    // resolves, so the success screen's celebration matches what was actually scored.
    setAppliedMultiplier(isCleanup ? effectiveMultiplier : null);

    try {
      const newlyUploadedUrls = photos.length > 0 ? await Promise.all(photos.map((p) => uploadToR2(p))) : [];
      const photoUrls = [...existingPhotoUrls, ...newlyUploadedUrls];

      // canSubmit already requires bagValuesReady for cleanups, so these are guaranteed
      // defined by the time handleSubmit can run.
      const value = isCleanup
        ? cleanupValue(smallBagsNum, largeBagsNum, gameSettings.small_bag_value!, gameSettings.large_bag_value!)
        : 1;
      const computedNotes = isCivicAction ? selectedAction : (notes.trim() || null);

      const body: Record<string, unknown> = {
        campaign_id: campaignId,
        user_id: userId,
        group_id: selectedGroupId,
        contribution_type: campaignContributionType,
        value,
        photo_url: photoUrls[0] ?? null,
        notes: computedNotes,
      };

      if (isCleanup) {
        body.small_bags = smallBagsNum;
        body.large_bags = largeBagsNum;
        if (photoUrls.length > 1) body.photo_urls = photoUrls;
        if (pounds.trim()) body.pounds = Number(pounds);
        if (nearbyReport && resolveHotspot) body.resolve_report_id = nearbyReport.id;
        if (claimedReportId) body.claimed_report_id = claimedReportId;
        if (fromSolarpunk) body.from_solarpunk_redirect = true;
      }

      if (isRouteMode && route && selectedRouteGeoUnitId) {
        body.route = route;
        body.route_geo_unit_id = selectedRouteGeoUnitId;
      } else if (submitCoords) {
        body.latitude = submitCoords.latitude;
        body.longitude = submitCoords.longitude;
      }

      if (effectiveEventId) body.cleanup_event_id = effectiveEventId;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { claimed_territory: boolean; hotspot_cleared?: boolean; cleanup_id?: string };

      onContributionSubmitted?.(
        submitCoords?.latitude ?? null,
        submitCoords?.longitude ?? null,
        value,
        photoUrls[0] ?? undefined,
        data.hotspot_cleared && nearbyReport ? nearbyReport.id : undefined,
        isRouteMode && route && data.cleanup_id ? { id: data.cleanup_id, route } : undefined,
        Boolean(effectiveEventId),
      );
      setHotspotCleared(Boolean(data.hotspot_cleared));
      setResult((isPhoto || data.claimed_territory) ? "success" : "outside");
      // Re-read the authoritative balance (rather than computing the delta client-side,
      // which would need to duplicate the trigger's multiplier/hotspot/event-mode logic)
      // so the header badge updates instantly instead of waiting for a page refresh.
      refreshUserPoints(userId);
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (result === "success" && appliedMultiplier) {
      const t = setTimeout(() => setCelebrate(true), 50);
      return () => clearTimeout(t);
    }
    setCelebrate(false);
  }, [result, appliedMultiplier]);

  if (result) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4">
          <span className="text-4xl">
            {result === "success"
              ? isPhoto ? "🌿" : isCivicAction ? "🗽" : isUnfollow ? "🧠" : "🎉"
              : "✅"}
          </span>
          <p className="text-zinc-100 font-semibold text-center">
            {result === "success" ? config.successClaimed : config.successUnclaimed}
          </p>
          {isCleanup && claimedReportId && (
            <p className={`text-sm font-semibold text-center ${challengeMultiplier >= (appliedMultiplier?.multiplier ?? 1) ? "text-violet-300" : "text-violet-500/50 line-through"}`}>
              🎯 Challenge bonus: <SettingValue value={gameSettings.claim_challenge_multiplier} loading={settingsLoading} />× score
              {challengeMultiplier >= (appliedMultiplier?.multiplier ?? 1) ? " applied!" : " (not applied — hotspot bonus was bigger)"}
            </p>
          )}
          {isCleanup && appliedMultiplier && (
            <p
              className={`text-sm font-semibold text-center transition-all duration-500 ${appliedMultiplier.multiplier > challengeMultiplier
                  ? `text-orange-300 ${celebrate ? "opacity-100 scale-100" : "opacity-0 scale-75"}`
                  : "text-orange-500/50 line-through"
                }`}
            >
              <span className="inline-block animate-bounce">🔥</span>{" "}
              +{appliedMultiplier.multiplier}× hotspot bonus
              {appliedMultiplier.multiplier > challengeMultiplier ? " applied!" : claimedReportId ? " (not applied — challenge bonus was bigger)" : " applied!"}
            </p>
          )}
          {isCleanup && hotspotCleared && (
            <p className="text-sm text-orange-400 font-semibold text-center">🔥 Hotspot cleared!</p>
          )}
          {isCleanup && isEventMode && (
            <p className="text-sm text-sky-400 font-semibold text-center">📅 Counted toward the event</p>
          )}
          {isCleanup && fromSolarpunk && (
            <>
              <p className="text-xs text-lime-400 text-center">+<SettingValue value={gameSettings.trash_war_solarpunk_credit} loading={settingsLoading} /> Solarpunk bloom points earned 🌱</p>
              <Link
                href="/campaigns/solarpunk"
                className="mt-1 text-sm text-lime-400 hover:text-lime-300 active:text-lime-300 transition-colors duration-150 font-medium"
              >
                🌱 Check out Solarpunk →
              </Link>
            </>
          )}
          <button onClick={onClose} className="mt-2 text-sm text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150">
            Close
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title={config.title}
      onClose={onClose}
      glow={isEventMode ? "blue" : isCleanup && Boolean(activeMultiplier) ? "orange" : false}
    >
      <div className="flex flex-col gap-4">

        {isCleanup && claimedReportId && (
          <div className="flex flex-col gap-1.5 px-3 py-2 rounded-lg border border-violet-800/60 bg-violet-950/30 text-xs text-violet-300">
            <div className="flex items-center gap-2">
              <span className="text-base shrink-0">🎯</span>
              <span>Challenge complete — {effectiveMultiplier ? "two bonuses are eligible" : "this cleanup earns a score bonus"}:</span>
            </div>
            <div className="flex flex-col gap-1 pl-6">
              <span className={challengeMultiplier >= (effectiveMultiplier?.multiplier ?? 1) ? "font-bold text-violet-200" : "text-violet-400/60 line-through"}>
                {gameSettings.claim_challenge_multiplier ?? challengeMultiplier}× challenge bonus
                {challengeMultiplier >= (effectiveMultiplier?.multiplier ?? 1) && " (applied)"}
              </span>
              {effectiveMultiplier && (
                <span className={effectiveMultiplier.multiplier > challengeMultiplier ? "font-bold text-orange-300" : "text-orange-400/50 line-through"}>
                  {effectiveMultiplier.multiplier}× hotspot bonus
                  {effectiveMultiplier.multiplier > challengeMultiplier && " (applied)"}
                </span>
              )}
            </div>
            {effectiveMultiplier && (
              <span className="pl-6 text-violet-400/70">Only the larger bonus applies — they don&apos;t stack.</span>
            )}
          </div>
        )}

        {isCleanup && nearbyEvent && nearbyEvent.logging_mode === "organizer_total" ? (
          <label className="flex items-start gap-2 min-h-11 px-3 py-2 rounded-lg border border-amber-700/60 bg-amber-950/30 text-xs text-amber-300 cursor-pointer">
            <input
              type="checkbox"
              checked={useNearbyEvent}
              onChange={(e) => setUseNearbyEvent(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>
              ⚠️ You&apos;re at the event{" "}
              <span className="font-semibold text-amber-200">{nearbyEvent.title}</span>. The organizer logs one team
              total for everyone at the end. Self-logging here won&apos;t count toward it.
              <span className="block text-amber-400/70 mt-0.5">
                Uncheck this to log a separate, unrelated cleanup instead. Submitting is disabled while this stays checked.
              </span>
            </span>
          </label>
        ) : isCleanup && nearbyEvent && (
          <label className="flex items-start gap-2 min-h-11 px-3 py-2 rounded-lg border border-sky-800/60 bg-sky-950/30 text-xs text-sky-300 cursor-pointer">
            <input
              type="checkbox"
              checked={useNearbyEvent}
              onChange={(e) => setUseNearbyEvent(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>
              📍 You&apos;re in range of the event{" "}
              <span className="font-semibold text-sky-200">{nearbyEvent.title}</span>. Count this toward it?
              <span className="block text-sky-400/70 mt-0.5">No bonus multiplier applies to event cleanups. Uncheck to log separately.</span>
            </span>
          </label>
        )}

        {isCleanup && activeMultiplier && (
          effectiveEventId ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-orange-800/60 bg-orange-950/30 text-xs text-orange-300">
              <span className="text-base shrink-0">🔥</span>
              <span>
                A <span className="font-bold text-orange-200">{activeMultiplier.multiplier}×</span> hotspot is also active here, but event cleanups don&apos;t earn a bonus multiplier.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-orange-800/60 bg-orange-950/30 text-xs text-orange-300">
              <span className="text-base shrink-0">🔥</span>
              <span>
                Hotspot active — cleanups here earn a{" "}
                <span className="font-bold text-orange-200">{activeMultiplier.multiplier}×</span> score multiplier.
              </span>
            </div>
          )
        )}

        {/* Account handle — unfollow only (required) */}
        {isUnfollow && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Account you unfollowed (required)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="@handle or account name"
              className="w-full min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
          </div>
        )}

        {/* Point / Route toggle — cleanup only */}
        {isCleanup && (
          <div>
            <p className="text-xs text-zinc-500 mb-1.5">How are you logging this?</p>
            <div className="flex items-center gap-1 p-1 bg-zinc-800/60 border border-zinc-700 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setContributeMode("point")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${contributeMode === "point"
                  ? "bg-zinc-600 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-200 active:text-zinc-200"
                  }`}
              >
                📍 Point
              </button>
              <button
                type="button"
                onClick={() => setContributeMode("route")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${contributeMode === "route"
                  ? "bg-zinc-600 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-200 active:text-zinc-200"
                  }`}
              >
                🛤️ Route
                <span
                  title="This feature should work but is still being tested."
                  className="text-xs text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5 font-normal cursor-help"
                >
                  Beta
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Location section */}
        {needsLocation && !isRouteMode && (
          <div>
            <p className="text-xs text-zinc-500 mb-1.5">
              {isUnfollow ? "Your location (optional — helps build the global heatmap)" : "Your location"}
            </p>
            <GpsIndicator
              status={gps.status}
              coords={gps.coords}
              errorCode={gps.errorCode}
              onRetry={gps.capture}
            />
            {overrideCoords && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                Adjusted: {overrideCoords.latitude.toFixed(5)}, {overrideCoords.longitude.toFixed(5)}
              </div>
            )}
            {gps.status === "success" && gps.coords && (
              <button
                onClick={onEnterPinPicker}
                className="mt-1.5 text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline"
              >
                {overrideCoords ? "Reposition on map" : "Place pin on map"}
              </button>
            )}
          </div>
        )}

        {needsLocation && !isRouteMode && submitCoords && (
          <MiniMapPreview lat={submitCoords.latitude} lng={submitCoords.longitude} styleId={activeMapStyle} />
        )}

        {isRouteMode && (
          <div>
            {!route ? (
              <button
                type="button"
                onClick={onEnterRoutePicker}
                className="w-full py-2.5 rounded-lg border border-dashed border-zinc-700 text-zinc-400 text-sm hover:border-zinc-500 hover:text-zinc-200 active:border-zinc-500 active:text-zinc-200 active:scale-[0.98] transition-[background-color,border-color,transform] duration-150 touch-manipulation"
              >
                🛤️ Draw route on map
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    Route drawn ({route.coordinates.length} node{route.coordinates.length === 1 ? "" : "s"})
                  </span>
                  <button
                    type="button"
                    onClick={onEnterRoutePicker}
                    className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline"
                  >
                    Redraw
                  </button>
                </div>
                <RoutePreviewMap coordinates={route.coordinates} heightClassName="h-[140px]" />
                {loadingIntersecting ? (
                  <p className="text-xs text-zinc-500">Finding zips along your route…</p>
                ) : intersectingUnits.length === 0 ? (
                  <p className="text-xs text-orange-400">This route doesn&apos;t cross any known zips — try drawing within the campaign area.</p>
                ) : (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5">Credit which zip?</p>
                    <div className="flex flex-wrap gap-1.5">
                      {intersectingUnits.map((u) => (
                        <button
                          key={u.geo_unit_id}
                          type="button"
                          onClick={() => setSelectedRouteGeoUnitId(u.geo_unit_id)}
                          title={u.active_multiplier ? `${u.active_multiplier.title} · ${u.active_multiplier.multiplier}x` : undefined}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${selectedRouteGeoUnitId === u.geo_unit_id
                            ? "bg-emerald-900/60 border-emerald-600 text-emerald-300"
                            : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.95]"
                            }`}
                        >
                          {u.display_name}
                          {u.active_multiplier && (
                            <span className="text-amber-400">🔥{u.active_multiplier.multiplier}x</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isCleanup && nearbyReport && (
          <label className="flex items-start gap-2 min-h-11 px-3 py-2 rounded-lg border border-orange-800/60 bg-orange-950/30 text-xs text-orange-300 cursor-pointer">
            <input
              type="checkbox"
              checked={resolveHotspot}
              onChange={(e) => setResolveHotspot(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>
              🔥 There&apos;s a trash report ~{formatHotspotDistance(nearbyReport.distance_m, nearbyReport.unit_type)} away. Mark it as cleaned up?
              <span className="block text-orange-400/70 mt-0.5">Uncheck if this is a separate cleanup.</span>
            </span>
          </label>
        )}

        {/* Cross-credit notice — only shown when arriving via the Solarpunk campaign's link */}
        {isCleanup && fromSolarpunk && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-lime-800/60 bg-lime-950/30 text-xs text-lime-300">
            <span className="text-base shrink-0">🌱</span>
            <span>
              This also earns your{" "}
              <Link href="/campaigns/solarpunk" className="underline font-semibold hover:text-lime-200 active:text-lime-200 transition-colors duration-150">
                Solarpunk
              </Link>{" "}
              hex +8 bloom points.
            </span>
          </div>
        )}

        {/* Group selection */}
        {userGroups.length > 0 && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Contributing as</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => { setSelectedGroupId(null); localStorage.setItem("frontline:contrib:group", "__individual__"); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedGroupId === null
                  ? "bg-zinc-700 border-zinc-500 text-zinc-100"
                  : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.95]"
                  }`}
              >
                Individual
              </button>
              {userGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setSelectedGroupId(g.id); localStorage.setItem("frontline:contrib:group", g.id); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedGroupId === g.id
                    ? "bg-emerald-900/60 border-emerald-600 text-emerald-300"
                    : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.95]"
                    }`}
                >
                  {g.image_url ? (
                    <img src={g.image_url} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full bg-zinc-700 text-[7px] flex items-center justify-center font-bold shrink-0">
                      {g.name[0].toUpperCase()}
                    </span>
                  )}
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bags count (cleanup only) */}
        {isCleanup && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Bags collected</label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0">
              <label className="text-[11px] text-zinc-600">Small bags</label>
              <label className="text-[11px] text-zinc-600">Large bags</label>
              <p className="text-[11px] text-zinc-700 mb-1">(about a grocery bag)</p>
              <p className="text-[11px] text-zinc-700 mb-1">(about a kitchen trash bag)</p>
              <input
                type="number"
                min={0}
                value={smallBags}
                onChange={(e) => setSmallBags(e.target.value.replace(/^0+(?=\d)/, ""))}
                className="w-full min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
              />
              <input
                type="number"
                min={0}
                value={largeBags}
                onChange={(e) => setLargeBags(e.target.value.replace(/^0+(?=\d)/, ""))}
                className="w-full min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Total points:{" "}
              {!bagValuesReady ? (
                <SettingValue value={undefined} loading={settingsLoading} />
              ) : (
                <>
                  {combinedMultiplier > 1 && (
                    <span className="line-through text-zinc-600 mr-1.5">{formatPoints(baseValue)}</span>
                  )}
                  <span
                    className={`text-lg font-bold inline-block transition-transform duration-300 ${combinedMultiplier > 1 ? "text-orange-400" : "text-emerald-400"
                      } ${valueFlash ? "scale-125" : "scale-100"}`}
                  >
                    {formatPoints(finalValue)}
                  </span>
                  {combinedMultiplier > 1 ? (
                    <span className="ml-1 text-orange-400/80">
                      ({combinedMultiplier}× {challengeMultiplier >= (effectiveMultiplier?.multiplier ?? 1) ? "challenge" : "hotspot"} multiplier applied)
                    </span>
                  ) : (
                    <span className="ml-1 text-zinc-600">(large bags count {gameSettings.large_bag_value!}x)</span>
                  )}
                </>
              )}
            </p>
            <div className="mt-3">
              <label className={`block text-[11px] mb-1 ${isEventMode && !pounds.trim() ? "text-amber-400" : "text-zinc-600"}`}>
                Pounds cleaned up (optional){isEventMode && !pounds.trim() ? " — helps the event's total!" : ""}
              </label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={pounds}
                onChange={(e) => setPounds(e.target.value)}
                placeholder="e.g. 25"
                className={`w-full min-h-11 bg-zinc-800 border rounded-lg px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600 ${isEventMode && !pounds.trim() ? "border-amber-600/60" : "border-zinc-700"
                  }`}
              />
            </div>
          </div>
        )}

        {/* Civic action selector */}
        {isCivicAction && (
          <div>
            <label className="block text-xs text-zinc-500 mb-2">Select your action (required)</label>
            <div className="grid grid-cols-2 gap-2">
              {CIVIC_ACTIONS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setSelectedAction(a.key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-xs font-medium transition-colors ${selectedAction === a.key
                    ? "bg-blue-900/60 border-blue-500 text-blue-200"
                    : "bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 active:border-zinc-500 active:text-zinc-300 active:scale-[0.97]"
                    }`}
                >
                  <span className="text-base shrink-0">{a.icon}</span>
                  <span className="leading-tight">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Photo */}
        {showPhoto && (
          <div>
            <label className={`block text-xs mb-1.5 ${isEventMode && photos.length === 0 && existingPhotoUrls.length === 0 ? "text-amber-400" : "text-zinc-500"}`}>
              {isCleanup ? "Photos" : "Photo"} {isPhoto ? "(required)" : "(optional)"}
              {isEventMode && photos.length === 0 && existingPhotoUrls.length === 0 ? " — helps the event's gallery!" : ""}
            </label>
            <PhotoCaptureInput
              multiple={isCleanup}
              onFilesSelected={(files) =>
                setPhotos((prev) => (isCleanup ? [...prev, ...files] : files))
              }
            />
            {(existingPhotoUrls.length > 0 || photoPreviews.length > 0) && (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {existingPhotoUrls.map((url, i) => (
                  <div key={url} className="relative w-28 h-28 rounded-lg overflow-hidden border border-zinc-700 shrink-0 group">
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover cursor-zoom-in"
                      onClick={() => setLightboxIndex(i)}
                    />
                    <span className="pointer-events-none absolute bottom-1 right-1 text-[10px] text-white/80 bg-black/60 rounded px-1.5 py-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      🔍
                    </span>
                    <IconButton
                      onClick={() => setExistingPhotoUrls((prev) => prev.filter((_, idx) => idx !== i))}
                      size="sm"
                      className="absolute top-0 right-0 bg-black/70 text-white text-xs leading-none rounded-bl rounded-tr-lg"
                      aria-label="Remove photo"
                    >
                      ×
                    </IconButton>
                  </div>
                ))}
                {photoPreviews.map((url, i) => (
                  <div key={url} className="relative w-28 h-28 rounded-lg overflow-hidden border border-zinc-700 shrink-0 group">
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover cursor-zoom-in"
                      onClick={() => setLightboxIndex(existingPhotoUrls.length + i)}
                    />
                    <span className="pointer-events-none absolute bottom-1 right-1 text-[10px] text-white/80 bg-black/60 rounded px-1.5 py-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      🔍
                    </span>
                    <IconButton
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      size="sm"
                      className="absolute top-0 right-0 bg-black/70 text-white text-xs leading-none rounded-bl rounded-tr-lg"
                      aria-label="Remove photo"
                    >
                      ×
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
            {lightboxIndex !== null && (
              <Lightbox
                images={[...existingPhotoUrls, ...photoPreviews]}
                index={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
                onNavigate={setLightboxIndex}
              />
            )}
          </div>
        )}

        {/* Notes / Caption — not shown for civic_action or unfollow (notes field used internally) */}
        {!isCivicAction && !isUnfollow && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">
              {isPhoto ? "Caption" : "Notes"} (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={
                isCleanup
                  ? "e.g. Found a mattress near the park entrance"
                  : isPhoto
                    ? "Add a caption…"
                    : campaignContributionType === "registration"
                      ? "e.g. Registered at county clerk office"
                      : "e.g. Attended city council meeting"
              }
              className="w-full min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm resize-none focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
          >
            Cancel
          </button>
          {userId ? (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-500 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          ) : (
            <Link
              href={`/login?next=${pathname}`}
              className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-500 active:scale-[0.97] text-white text-sm font-semibold text-center transition-[background-color,transform] duration-150 touch-manipulation"
            >
              Sign in to submit
            </Link>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Report modal ─────────────────────────────────────────────────────────────

function ReportModal({
  campaignId,
  userId,
  gps,
  overrideCoords,
  onEnterPinPicker,
  onClose,
  activeMapStyle,
  onReportSubmitted,
}: {
  campaignId: string;
  userId: string | null;
  gps: ReturnType<typeof useGPS>;
  overrideCoords: Coords | null;
  onEnterPinPicker: () => void;
  onClose: () => void;
  activeMapStyle?: string;
  onReportSubmitted?: (lat: number, lng: number, severity: string, photoUrl?: string) => void;
}) {
  const pathname = usePathname();
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [hotspotTriggered, setHotspotTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { values: gameSettings, loading: settingsLoading } = useGameSettings(["trash_report_value"] as const);

  useEffect(() => { if (gps.status === "idle") gps.capture(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const submitCoords = overrideCoords ?? gps.coords;

  const handleSubmit = async () => {
    if (!submitCoords || !photo || !userId) return;
    setSubmitting(true);
    setError(null);
    try {
      const photoUrl = await uploadToR2(photo);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/problem-reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaign_id: campaignId,
            submitted_by_user_id: userId,
            photo_url: photoUrl,
            latitude: submitCoords.latitude,
            longitude: submitCoords.longitude,
            severity,
          }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      onReportSubmitted?.(submitCoords.latitude, submitCoords.longitude, severity, photoUrl);
      setHotspotTriggered(!!result.hotspot_triggered);
      setDone(true);
      refreshUserPoints(userId);
    } catch {
      setError("Report failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4">
          <span className="text-4xl">{hotspotTriggered ? "🔥" : "📍"}</span>
          <p className="text-zinc-100 font-semibold text-center">
            {hotspotTriggered
              ? "Report submitted! Your report just pushed this area over the threshold — a Hotspot has spawned!"
              : "Report submitted! If enough reports come in, a Hotspot will spawn."}
          </p>
          <button onClick={onClose} className="mt-2 text-sm text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150">
            Close
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Report Trash" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs text-zinc-500 mb-1.5">Trash location</p>
          <GpsIndicator
            status={gps.status}
            coords={gps.coords}
            errorCode={gps.errorCode}
            onRetry={gps.capture}
          />
          {overrideCoords && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              Pinned: {overrideCoords.latitude.toFixed(5)}, {overrideCoords.longitude.toFixed(5)}
            </div>
          )}
          {gps.status === "success" && gps.coords && (
            <button
              onClick={onEnterPinPicker}
              className="mt-1.5 text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline"
            >
              {overrideCoords ? "Reposition pin on map" : "Place pin on map"}
            </button>
          )}
        </div>

        {submitCoords && (
          <MiniMapPreview lat={submitCoords.latitude} lng={submitCoords.longitude} styleId={activeMapStyle} />
        )}

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Photo (required)</label>
          <PhotoCaptureInput multiple={false} onFilesSelected={(files) => setPhoto(files[0] ?? null)} />
          {photoPreview && (
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-zinc-700 shrink-0">
                <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                <IconButton
                  onClick={() => setPhoto(null)}
                  size="sm"
                  className="absolute top-0 right-0 bg-black/70 text-white text-[10px] leading-none rounded-bl rounded-tr-lg"
                  aria-label="Remove photo"
                >
                  ×
                </IconButton>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Severity</label>
          <div className="flex gap-2">
            {(["low", "medium", "high"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${severity === s
                  ? s === "high"
                    ? "bg-red-900/60 border-red-600 text-red-300"
                    : s === "medium"
                      ? "bg-yellow-900/60 border-yellow-600 text-yellow-300"
                      : "bg-zinc-700 border-zinc-500 text-zinc-200"
                  : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.95]"
                  }`}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">{SEVERITY_DESCRIPTIONS[severity]}</p>
        </div>

        <p className="text-xs text-zinc-500">
          Points earned:{" "}
          {gameSettings.trash_report_value === undefined ? (
            <SettingValue value={undefined} loading={settingsLoading} />
          ) : (
            <span className="text-lg font-bold text-emerald-400">{formatPoints(gameSettings.trash_report_value)}</span>
          )}
        </p>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
          >
            Cancel
          </button>
          {userId ? (
            <button
              onClick={handleSubmit}
              disabled={!submitCoords || !photo || submitting}
              className="flex-1 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 active:bg-orange-500 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation"
            >
              {submitting ? "Submitting…" : "Report"}
            </button>
          ) : (
            <Link
              href={`/login?next=${pathname}`}
              className="flex-1 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 active:bg-orange-500 active:scale-[0.97] text-white text-sm font-semibold text-center transition-[background-color,transform] duration-150 touch-manipulation"
            >
              Sign in to report
            </Link>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Claim-a-report challenge mode ────────────────────────────────────────────

function claimAfterWindowMinutes(severity: string, windows: Record<string, number>): number {
  return windows[severity] ?? windows.medium;
}

// Shown under the severity picker on report creation. Pick the tier that matches how
// long the clean-up will actually take, since that's the window a claimant gets to
// submit an after photo (windows come from the claim_after_window_minutes_* settings).
const SEVERITY_DESCRIPTIONS: Record<"low" | "medium" | "high", string> = {
  low: "A few scattered items — a quick grab-and-go.",
  medium: "A noticeable pile or small dump site.",
  high: "A large dump, bulky items, or hazardous material.",
};
function severityDescription(severity: string, afterWindow: number): string {
  const base = SEVERITY_DESCRIPTIONS[severity as "low" | "medium" | "high"] ?? SEVERITY_DESCRIPTIONS.medium;
  return `${base} ${afterWindow} min to clean up once claimed.`;
}

const SEVERITY_META: Record<string, { label: string; icon: string; classes: string }> = {
  low: { label: "Low severity", icon: "🟢", classes: "border-emerald-800/60 bg-emerald-950/30 text-emerald-300" },
  medium: { label: "Medium severity", icon: "🟠", classes: "border-amber-800/60 bg-amber-950/30 text-amber-300" },
  high: { label: "High severity", icon: "🔴", classes: "border-red-800/60 bg-red-950/30 text-red-300" },
};
function severityMeta(severity: string) {
  return SEVERITY_META[severity] ?? SEVERITY_META.medium;
}

// Live mm:ss countdown to a deadline timestamp — ticks locally rather than re-fetching,
// since the backend uses a check-on-read expiry pattern (no push/websocket for this).
function useCountdownLabel(deadline: string | null): { label: string; expired: boolean } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return { label: "", expired: false };
  const diffMs = new Date(deadline).getTime() - now;
  if (diffMs <= 0) return { label: "0:00", expired: true };
  const totalSec = Math.floor(diffMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return { label: `${m}:${s.toString().padStart(2, "0")}`, expired: false };
}

function ClaimReportModal({
  report,
  userId,
  gps,
  onClose,
  activeMapStyle,
  onClaimUpdated,
  onClaimResolved,
  onStartChallengeContribution,
  myActiveClaimReport,
  onViewActiveClaim,
}: {
  report: ClickedReport;
  userId: string | null;
  gps: ReturnType<typeof useGPS>;
  onClose: () => void;
  activeMapStyle?: string;
  onClaimUpdated: (reportId: string, patch: Partial<ClickedReport>) => void;
  onClaimResolved: (reportId: string) => void;
  onStartChallengeContribution: (reportId: string, coords: Coords, photoUrls: string[]) => void;
  myActiveClaimReport?: ClickedReport | null;
  onViewActiveClaim?: () => void;
}) {
  const pathname = usePathname();
  const [localReport, setLocalReport] = useState(report);
  useEffect(() => setLocalReport(report), [report]);

  const { values: gameSettings, loading: settingsLoading } = useGameSettings([
    "claim_proximity_meters_uk",
    "claim_proximity_meters_us",
    "claim_before_window_minutes",
    "claim_after_window_minutes_low",
    "claim_after_window_minutes_medium",
    "claim_after_window_minutes_high",
    "claim_challenge_multiplier",
    "flag_auto_hide_threshold",
  ] as const);
  const proximityReady = gameSettings.claim_proximity_meters_uk !== undefined && gameSettings.claim_proximity_meters_us !== undefined;
  // Gates the unclaimed "open" offer screen below — every one of these numbers is part of
  // the deal the user is agreeing to (windows, radius, bonus), so don't show that screen
  // with any of them missing or defaulted.
  const claimSettingsReady =
    proximityReady &&
    gameSettings.claim_before_window_minutes !== undefined &&
    gameSettings.claim_after_window_minutes_low !== undefined &&
    gameSettings.claim_after_window_minutes_medium !== undefined &&
    gameSettings.claim_after_window_minutes_high !== undefined &&
    gameSettings.claim_challenge_multiplier !== undefined &&
    gameSettings.flag_auto_hide_threshold !== undefined;
  const afterWindowMinutesBySeverity = {
    low: gameSettings.claim_after_window_minutes_low,
    medium: gameSettings.claim_after_window_minutes_medium,
    high: gameSettings.claim_after_window_minutes_high,
  } as Record<"low" | "medium" | "high", number>;

  useEffect(() => { if (gps.status === "idle") gps.capture(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [flagState, setFlagState] = useState<"idle" | "submitting" | "done">("idle");
  const [flagError, setFlagError] = useState<string | null>(null);
  const [beforePhotoUrl, setBeforePhotoUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [reportPhotoLightboxOpen, setReportPhotoLightboxOpen] = useState(false);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const isMine = !!userId && localReport.claimed_by_user_id === userId;
  const beforeCountdown = useCountdownLabel(isMine ? localReport.claim_before_deadline_at : null);
  const afterCountdown = useCountdownLabel(isMine ? localReport.claim_after_deadline_at : null);
  const blockedByOtherClaim = !!myActiveClaimReport && myActiveClaimReport.id !== localReport.id;

  // Mirrors the backend's ST_DWithin check in _assert_within_claim_radius — gating the
  // photo upload client-side too so users don't waste an upload on a submission the
  // server will reject anyway.
  const radiusMeters = proximityReady
    ? claimRadiusMeters(localReport.unit_type, gameSettings.claim_proximity_meters_uk!, gameSettings.claim_proximity_meters_us!)
    : null;
  const distanceToReport = gps.coords ? claimDistanceMeters(gps.coords, localReport.latitude, localReport.longitude) : null;
  const withinClaimRadius = radiusMeters !== null && distanceToReport !== null && distanceToReport <= radiusMeters;

  // The backend only reverts an expired claim to "open" when it's touched by a later
  // request (check-on-read, not a cron job) — so if the user just sits on this modal
  // past the deadline, reflect that locally right away rather than waiting for the next
  // network round trip. This also clears them out of the "one active claim" slot so they
  // can immediately claim something else.
  useEffect(() => {
    if (!isMine) return;
    if (beforeCountdown.expired || afterCountdown.expired) {
      const patch: Partial<ClickedReport> = {
        status: "open",
        claimed_by_user_id: null,
        claim_before_deadline_at: null,
        claim_after_deadline_at: null,
      };
      setLocalReport((r) => ({ ...r, ...patch }));
      onClaimUpdated(localReport.id, patch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beforeCountdown.expired, afterCountdown.expired, isMine]);

  const handleClaim = async () => {
    if (!userId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/problem-reports/${localReport.id}/claim`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        },
      );
      if (!res.ok) {
        let detail: string | null = null;
        try {
          detail = ((await res.json()) as { detail?: string })?.detail ?? null;
        } catch {
          // response body wasn't JSON — fall through to the generic messages below
        }
        if (res.status === 429) throw new Error(detail ?? "You must wait before reclaiming this report.");
        if (res.status === 409) throw new Error(detail ?? "This report was just claimed by someone else.");
        throw new Error("Failed to claim report.");
      }
      const data = (await res.json()) as { claim_before_deadline_at: string };
      const patch: Partial<ClickedReport> = {
        status: "scheduled",
        claimed_by_user_id: userId,
        claim_before_deadline_at: data.claim_before_deadline_at,
      };
      setLocalReport((r) => ({ ...r, ...patch }));
      onClaimUpdated(localReport.id, patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to claim report.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBeforePhoto = async () => {
    if (!userId || !photo) return;
    if (!gps.coords) {
      setError("We need your location to confirm you're at the report — enable location and try again.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const photoUrl = await uploadToR2(photo);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/problem-reports/${localReport.id}/claim/before-photo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            photo_url: photoUrl,
            latitude: gps.coords.latitude,
            longitude: gps.coords.longitude,
          }),
        },
      );
      if (!res.ok) {
        if (res.status === 403) throw new Error("You need to be at the report's location to submit this photo.");
        throw new Error("Claim is not active or has expired.");
      }
      const data = (await res.json()) as { claim_after_deadline_at: string };
      const patch: Partial<ClickedReport> = {
        status: "in_progress",
        claim_before_deadline_at: null,
        claim_after_deadline_at: data.claim_after_deadline_at,
      };
      setLocalReport((r) => ({ ...r, ...patch }));
      onClaimUpdated(localReport.id, patch);
      setBeforePhotoUrl(photoUrl);
      setPhoto(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit photo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAfterPhoto = async () => {
    if (!userId || !photo) return;
    if (!gps.coords) {
      setError("We need your location to confirm you're at the report — enable location and try again.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const photoUrl = await uploadToR2(photo);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/problem-reports/${localReport.id}/claim/after-photo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            photo_url: photoUrl,
            latitude: gps.coords.latitude,
            longitude: gps.coords.longitude,
          }),
        },
      );
      if (!res.ok) {
        if (res.status === 403) throw new Error("You need to be at the report's location to submit this photo.");
        throw new Error("Claim is not active or has expired.");
      }
      onClaimResolved(localReport.id);
      onStartChallengeContribution(
        localReport.id,
        { latitude: localReport.latitude, longitude: localReport.longitude },
        [beforePhotoUrl, photoUrl].filter((url): url is string => !!url),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit photo.");
      setSubmitting(false);
    }
  };

  // Voluntary back-out — frees the report for someone else instead of letting the timer
  // run out. Reuses onClaimUpdated's "revert to open" patch shape, same as auto-expiry.
  const handleRelease = async () => {
    if (!userId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/problem-reports/${localReport.id}/claim/release`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        },
      );
      if (!res.ok) throw new Error("Failed to release this claim.");
      const patch: Partial<ClickedReport> = {
        status: "open",
        claimed_by_user_id: null,
        claim_before_deadline_at: null,
        claim_after_deadline_at: null,
      };
      onClaimUpdated(localReport.id, patch);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to release this claim.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFlag = async () => {
    if (!userId) return;
    setFlagState("submitting");
    setFlagError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/problem-reports/${localReport.id}/flag`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        },
      );
      if (!res.ok) throw new Error("Failed to flag this report.");
      const data = (await res.json()) as { flag_count: number; auto_hidden: boolean };
      if (data.auto_hidden) {
        onClaimResolved(localReport.id);
        onClose();
        return;
      }
      const patch: Partial<ClickedReport> = { flag_count: data.flag_count };
      setLocalReport((r) => ({ ...r, ...patch }));
      onClaimUpdated(localReport.id, patch);
      setFlagState("done");
    } catch (e) {
      setFlagError(e instanceof Error ? e.message : "Failed to flag this report.");
      setFlagState("idle");
    }
  };

  const severity = severityMeta(localReport.severity);
  const severityBadge = (
    <div className={`self-start flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold capitalize ${severity.classes}`}>
      <span>{severity.icon}</span>
      <span>{severity.label}</span>
    </div>
  );
  const reportPhotoBlock = localReport.photo_url ? (
    <div
      className="relative w-full h-40 rounded-lg overflow-hidden border border-zinc-700 shrink-0 group cursor-zoom-in"
      onClick={() => setReportPhotoLightboxOpen(true)}
    >
      <img src={localReport.photo_url} alt="Reported trash" className="w-full h-full object-cover" />
      <span className="pointer-events-none absolute bottom-1 right-1 text-[10px] text-white/80 bg-black/60 rounded px-1.5 py-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        🔍 Enlarge
      </span>
    </div>
  ) : null;
  const reportPhotoLightbox = reportPhotoLightboxOpen && localReport.photo_url && (
    <Lightbox
      images={[localReport.photo_url]}
      index={0}
      onClose={() => setReportPhotoLightboxOpen(false)}
      onNavigate={() => {}}
    />
  );

  const flagControl = (
    <div className="pt-1 text-center">
      {flagState === "done" ? (
        <p className="text-xs text-zinc-500">Thanks — this report has been flagged for review.</p>
      ) : (
        <button
          onClick={handleFlag}
          disabled={flagState === "submitting"}
          className="text-xs text-zinc-500 hover:text-red-400 active:text-red-400 transition-colors duration-150 disabled:active:text-zinc-500 underline disabled:opacity-40"
          title={
            gameSettings.flag_auto_hide_threshold !== undefined
              ? `If ${gameSettings.flag_auto_hide_threshold} people flag this report as inaccurate, it will be automatically removed from the map.`
              : undefined
          }
        >
          {flagState === "submitting" ? "Flagging…" : "🚩 Report this as inaccurate"}
        </button>
      )}
      {localReport.flag_count > 0 && (
        <p
          className="text-xs text-zinc-600 mt-1"
          title={
            gameSettings.flag_auto_hide_threshold !== undefined
              ? `If ${gameSettings.flag_auto_hide_threshold} people flag this report as inaccurate, it will be automatically removed from the map.`
              : undefined
          }
        >
          {localReport.flag_count} of <SettingValue value={gameSettings.flag_auto_hide_threshold} loading={settingsLoading} /> flags needed to remove this report
        </p>
      )}
      {flagError && <p className="text-red-400 text-xs mt-1">{flagError}</p>}
    </div>
  );

  if (!userId) {
    return (
      <ModalShell title="Claim This Report" badge="Beta" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4">
          <span className="text-4xl">🎯</span>
          <p className="text-zinc-100 text-sm text-center">Sign in to claim this report and earn a <SettingValue value={gameSettings.claim_challenge_multiplier} loading={settingsLoading} />× challenge bonus.</p>
          <Link
            href={`/login?next=${pathname}`}
            className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-500 active:scale-[0.97] text-white text-sm font-semibold text-center transition-[background-color,transform] duration-150 touch-manipulation"
          >
            Sign in
          </Link>
        </div>
      </ModalShell>
    );
  }

  // Claimed by someone else — read-only info state.
  if (localReport.claimed_by_user_id && !isMine) {
    return (
      <ModalShell title="Report Claimed" badge="Beta" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4">
          {severityBadge}
          {reportPhotoBlock}
          <span className="text-4xl">🔒</span>
          <p className="text-zinc-100 text-sm text-center">
            Someone else is already working this report. If they don&apos;t finish in time, it&apos;ll reopen for anyone to claim.
          </p>
          <button onClick={onClose} className="mt-1 text-sm text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150">
            Close
          </button>
          {flagControl}
        </div>
        {reportPhotoLightbox}
      </ModalShell>
    );
  }

  // Unclaimed, but the user already has a different claim in progress — challenge mode is
  // one-at-a-time, so point them at their existing claim instead of offering a new one.
  if (localReport.status === "open" && blockedByOtherClaim) {
    return (
      <ModalShell title="Claim This Report" badge="Beta" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4">
          <span className="text-4xl">⛔</span>
          <p className="text-zinc-100 text-sm text-center">
            You already have an active claim in progress. Finish it — or let its timer run out — before claiming another report.
          </p>
          <button
            onClick={onViewActiveClaim}
            className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-500 active:scale-[0.97] text-white text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation"
          >
            View my active claim
          </button>
          <button onClick={onClose} className="text-sm text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150">
            Close
          </button>
        </div>
      </ModalShell>
    );
  }

  // Unclaimed — offer the claim action. Every number on this screen (windows, radius,
  // bonus) is part of the deal the user is agreeing to, so don't offer the claim at all
  // until they're all loaded — a stale/default number here could talk someone into a
  // time-boxed challenge on terms that don't match what the server will actually enforce.
  if (localReport.status === "open" && !claimSettingsReady) {
    return (
      <ModalShell title="Claim This Report" badge="Beta" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-8">
          <span className="w-6 h-6 border-2 border-zinc-600 border-t-violet-500 rounded-full animate-spin" />
          <p className="text-xs text-zinc-500">
            {settingsLoading ? "Loading challenge settings…" : "Couldn't load challenge settings — try again."}
          </p>
        </div>
      </ModalShell>
    );
  }
  if (localReport.status === "open") {
    const afterWindow = claimAfterWindowMinutes(localReport.severity, afterWindowMinutesBySeverity);
    return (
      <ModalShell title="Claim This Report" badge="Beta" onClose={onClose}>
        <div className="flex flex-col gap-4">
          {severityBadge}
          <p className="-mt-3 text-xs text-zinc-500">{severityDescription(localReport.severity, afterWindow)}</p>
          {reportPhotoBlock}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-800/60 bg-violet-950/30 text-xs text-violet-300">
            <span className="text-base shrink-0">🎯</span>
            <span>
              Claim it to start the challenge: arrive with a before photo, then clean it up for an after photo.
              Complete both in time for a <span className="font-bold text-violet-200">{gameSettings.claim_challenge_multiplier!}×</span> score bonus.
            </span>
          </div>
          <div className="flex flex-col gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-900/60 text-xs text-zinc-300">
            <div className="flex items-center gap-2">
              <span className="shrink-0">⏱️</span>
              <span>
                Arrive & submit before photo: <span className="font-semibold text-zinc-100">{gameSettings.claim_before_window_minutes!} min</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0">🧹</span>
              <span>
                Clean up & submit after photo: <span className="font-semibold text-zinc-100">{afterWindow} min</span>
              </span>
            </div>
          </div>
          <MiniMapPreview lat={localReport.latitude} lng={localReport.longitude} styleId={activeMapStyle} interactive />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
            >
              Cancel
            </button>
            <button
              onClick={handleClaim}
              disabled={submitting}
              className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-500 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation"
            >
              {submitting ? "Claiming…" : "🎯 Claim"}
            </button>
          </div>
          {flagControl}
        </div>
        {reportPhotoLightbox}
      </ModalShell>
    );
  }

  // Claimed by me, awaiting before-photo.
  if (localReport.status === "scheduled") {
    return (
      <ModalShell title="Get There & Snap a Before Photo" badge="Beta" onClose={onClose}>
        <div className="flex flex-col gap-4">
          {severityBadge}
          {reportPhotoBlock}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${beforeCountdown.expired
            ? "border-red-800/60 bg-red-950/30 text-red-300"
            : "border-violet-800/60 bg-violet-950/30 text-violet-300"
            }`}>
            <span className="text-base shrink-0">⏱️</span>
            <span>
              {beforeCountdown.expired
                ? "Time's up — this claim has expired. Close and reclaim if it's still available."
                : <>Time left to arrive: <span className="font-bold">{beforeCountdown.label}</span></>}
            </span>
          </div>
          <MiniMapPreview lat={localReport.latitude} lng={localReport.longitude} styleId={activeMapStyle} interactive />
          {!withinClaimRadius && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-800/60 bg-amber-950/30 text-xs text-amber-300">
              <span className="text-base shrink-0">📍</span>
              <span>
                {radiusMeters === null
                  ? "Loading claim settings…"
                  : distanceToReport === null
                    ? "Waiting for your location to confirm you're at the report…"
                    : <>You&apos;re ~{formatHotspotDistance(distanceToReport, localReport.unit_type)} away — get within {formatHotspotDistance(radiusMeters, localReport.unit_type)} to submit a photo.</>}
              </span>
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Before photo (required)</label>
            {withinClaimRadius ? (
              <>
                <PhotoCaptureInput multiple={false} onFilesSelected={(files) => setPhoto(files[0] ?? null)} />
                {photoPreview && (
                  <div className="mt-2 flex justify-center">
                    <div className="relative w-40 h-40 rounded-lg overflow-hidden border border-zinc-700 shrink-0 group">
                      <img
                        src={photoPreview}
                        alt=""
                        className="w-full h-full object-cover cursor-zoom-in"
                        onClick={() => setLightboxOpen(true)}
                      />
                      <span className="pointer-events-none absolute bottom-1 right-1 text-[10px] text-white/80 bg-black/60 rounded px-1.5 py-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        🔍 Enlarge
                      </span>
                      <IconButton
                        onClick={() => setPhoto(null)}
                        size="sm"
                        className="absolute top-0 right-0 bg-black/70 text-white text-xs leading-none rounded-bl rounded-tr-lg"
                        aria-label="Remove photo"
                      >
                        ×
                      </IconButton>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-700 px-3 py-4 text-center text-xs text-zinc-500">
                Get closer to the report location to enable the camera.
              </div>
            )}
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
            >
              Cancel
            </button>
            <button
              onClick={handleBeforePhoto}
              disabled={!photo || submitting || beforeCountdown.expired || !withinClaimRadius}
              className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-500 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation"
            >
              {submitting ? "Submitting…" : "Submit before photo"}
            </button>
          </div>
          <button
            onClick={handleRelease}
            disabled={submitting}
            className="text-xs text-zinc-500 hover:text-red-400 active:text-red-400 transition-colors duration-150 disabled:active:text-zinc-500 underline disabled:opacity-40 text-center"
          >
            Back out of this claim
          </button>
          {flagControl}
        </div>
        {lightboxOpen && photoPreview && (
          <Lightbox images={[photoPreview]} index={0} onClose={() => setLightboxOpen(false)} onNavigate={() => {}} />
        )}
        {reportPhotoLightbox}
      </ModalShell>
    );
  }

  // Claimed by me, before-photo submitted, awaiting after-photo.
  return (
    <ModalShell title="Clean It Up & Snap an After Photo" badge="Beta" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {severityBadge}
        {reportPhotoBlock}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${afterCountdown.expired
          ? "border-red-800/60 bg-red-950/30 text-red-300"
          : "border-violet-800/60 bg-violet-950/30 text-violet-300"
          }`}>
          <span className="text-base shrink-0">⏱️</span>
          <span>
            {afterCountdown.expired
              ? "Time's up — this claim has expired. Close and reclaim if it's still available."
              : <>Time left to finish: <span className="font-bold">{afterCountdown.label}</span></>}
          </span>
        </div>
        <MiniMapPreview lat={localReport.latitude} lng={localReport.longitude} styleId={activeMapStyle} interactive />
        {!withinClaimRadius && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-800/60 bg-amber-950/30 text-xs text-amber-300">
            <span className="text-base shrink-0">📍</span>
            <span>
              {radiusMeters === null
                ? "Loading claim settings…"
                : distanceToReport === null
                  ? "Waiting for your location to confirm you're at the report…"
                  : <>You&apos;re ~{formatHotspotDistance(distanceToReport, localReport.unit_type)} away — get within {formatHotspotDistance(radiusMeters, localReport.unit_type)} to submit a photo.</>}
            </span>
          </div>
        )}
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">After photo (required)</label>
          {withinClaimRadius ? (
            <>
              <PhotoCaptureInput multiple={false} onFilesSelected={(files) => setPhoto(files[0] ?? null)} />
              {photoPreview && (
                <div className="mt-2 flex justify-center">
                  <div className="relative w-40 h-40 rounded-lg overflow-hidden border border-zinc-700 shrink-0 group">
                    <img
                      src={photoPreview}
                      alt=""
                      className="w-full h-full object-cover cursor-zoom-in"
                      onClick={() => setLightboxOpen(true)}
                    />
                    <span className="pointer-events-none absolute bottom-1 right-1 text-[10px] text-white/80 bg-black/60 rounded px-1.5 py-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      🔍 Enlarge
                    </span>
                    <IconButton
                      onClick={() => setPhoto(null)}
                      size="sm"
                      className="absolute top-0 right-0 bg-black/70 text-white text-xs leading-none rounded-bl rounded-tr-lg"
                      aria-label="Remove photo"
                    >
                      ×
                    </IconButton>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-700 px-3 py-4 text-center text-xs text-zinc-500">
              Get closer to the report location to enable the camera.
            </div>
          )}
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
          >
            Cancel
          </button>
          <button
            onClick={handleAfterPhoto}
            disabled={!photo || submitting || afterCountdown.expired || !withinClaimRadius}
            className="flex-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-500 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation leading-tight"
          >
            {submitting ? (
              "Submitting…"
            ) : (
              <span className="flex flex-col items-center">
                <span>Submit after photo</span>
                <span className="text-[11px] font-normal opacity-90">
                  (<SettingValue value={gameSettings.claim_challenge_multiplier} loading={settingsLoading} />× bonus)
                </span>
              </span>
            )}
          </button>
        </div>
        <button
          onClick={handleRelease}
          disabled={submitting}
          className="text-xs text-zinc-500 hover:text-red-400 active:text-red-400 transition-colors duration-150 disabled:active:text-zinc-500 underline disabled:opacity-40 text-center"
        >
          Back out of this claim
        </button>
        {flagControl}
      </div>
      {lightboxOpen && photoPreview && (
        <Lightbox images={[photoPreview]} index={0} onClose={() => setLightboxOpen(false)} onNavigate={() => {}} />
      )}
      {reportPhotoLightbox}
    </ModalShell>
  );
}

// Persistent running timer for the user's one active claim, visible on the map even while
// the claim modal itself is closed — tapping it reopens the modal to submit the next photo.
function ActiveClaimBadge({
  claim,
  onClick,
  onExpired,
}: {
  claim: ClickedReport;
  onClick: () => void;
  onExpired: (reportId: string) => void;
}) {
  const isScheduled = claim.status === "scheduled";
  const countdown = useCountdownLabel(isScheduled ? claim.claim_before_deadline_at : claim.claim_after_deadline_at);

  useEffect(() => {
    if (countdown.expired) onExpired(claim.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown.expired]);

  return (
    <button
      onClick={onClick}
      className={`absolute top-[5.5rem] sm:top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium backdrop-blur-sm shadow-elevation-3 transition-[background-color,transform] duration-150 active:scale-[0.96] touch-manipulation ${
        countdown.expired
          ? "border-red-800/60 bg-red-950/80 text-red-300 hover:bg-red-900/80 active:bg-red-900/80 active:scale-[0.97]"
          : "border-violet-800/60 bg-violet-950/80 text-violet-200 hover:bg-violet-900/80 active:bg-violet-900/80 active:scale-[0.97]"
      }`}
    >
      <span className="text-sm">🎯</span>
      <span>
        {countdown.expired ? (
          "Claim expired — tap to view"
        ) : isScheduled ? (
          <>Arrive by <span className="font-bold tabular-nums">{countdown.label}</span></>
        ) : (
          <>Clean up by <span className="font-bold tabular-nums">{countdown.label}</span></>
        )}
      </span>
    </button>
  );
}

// ─── Host cleanup event modal ─────────────────────────────────────────────────

function HostEventModal({
  campaignId,
  userId,
  adminGroups,
  gps,
  overrideCoords,
  onEnterPinPicker,
  onEnterRoutePicker,
  routeOverride,
  onClose,
  activeMapStyle,
  onRouteAdded,
}: {
  campaignId: string;
  userId: string;
  adminGroups: { id: string; name: string }[];
  gps: ReturnType<typeof useGPS>;
  overrideCoords: Coords | null;
  onEnterPinPicker: (coords: Coords) => void;
  onEnterRoutePicker: () => void;
  routeOverride: RouteLineString | null;
  onClose: () => void;
  activeMapStyle?: string;
  onRouteAdded?: (route: { id: string; route: RouteLineString }) => void;
}) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(adminGroups[0]?.id ?? "");
  const [cohostGroupIds, setCohostGroupIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; join_code: string } | null>(null);
  const [addressValue, setAddressValue] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [addressCoords, setAddressCoords] = useState<Coords | null>(null);
  const [maxAttendees, setMaxAttendees] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [route, setRoute] = useState<RouteLineString | null>(null);
  const [loggingMode, setLoggingMode] = useState<"organizer_total" | "individual">("organizer_total");

  // A freshly finished route arrives via routeOverride once the map's route picker reports
  // "Finish route" — this is a purely decorative/pre-planning route for the event listing
  // (e.g. for groups to screenshot and post to social media ahead of time), so unlike
  // ContributeModal's route mode there's no zip-crediting step: the event's location pin
  // still determines geo_unit_id.
  useEffect(() => {
    if (!routeOverride) return;
    setRoute(routeOverride);
  }, [routeOverride]);

  useEffect(() => { if (gps.status === "idle") gps.capture(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // With a route drawn, the location field is hidden (see `{!route && ...}` below) and the
  // route's own first node is the meeting point — falling back to overrideCoords/addressCoords/
  // gps.coords here would silently use a stale or unrelated location (e.g. wherever the
  // organizer's GPS was standing), disconnected from the route they actually drew.
  const routeStart = route?.coordinates?.[0] ?? null;
  const submitCoords = routeStart
    ? { latitude: routeStart[1], longitude: routeStart[0] }
    : overrideCoords ?? addressCoords ?? gps.coords;
  const endBeforeStart = !!scheduledEnd && !!scheduledStart && new Date(scheduledEnd) <= new Date(scheduledStart);
  const canSubmit = !!groupId && !!title.trim() && !!scheduledStart && !!submitCoords && !endBeforeStart;

  const handleSubmit = async () => {
    if (!canSubmit || !submitCoords) return;
    if (endBeforeStart) {
      setError("End time can't be before the start time — pick a later time.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createCleanupEvent({
        campaignId,
        groupId,
        organizerUserId: userId,
        title,
        description,
        imageFile,
        scheduledStart: new Date(scheduledStart).toISOString(),
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
        latitude: submitCoords.latitude,
        longitude: submitCoords.longitude,
        addressLine1: !route && addressValue.trim() ? addressValue.trim() : null,
        city: !route && addressCity.trim() ? addressCity.trim() : null,
        state: !route && addressState.trim() ? addressState.trim() : null,
        postalCode: !route && addressPostalCode.trim() ? addressPostalCode.trim() : null,
        country: !route && addressCountry.trim() ? addressCountry.trim() : null,
        maxAttendees: maxAttendees.trim() ? Number(maxAttendees) : null,
        externalLink: externalLink.trim() || null,
        route,
        cohostGroupIds,
        loggingMode,
      });
      setCreated(result);
      if (route) onRouteAdded?.({ id: result.id, route });
      router.refresh();
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't create the event. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4">
          <span className="text-4xl">📅</span>
          <p className="text-zinc-100 font-semibold text-center">Event created!</p>
          <p className="text-zinc-500 text-xs text-center">
            Join code <span className="font-mono text-zinc-300">{created.join_code}</span> — share it so attendees can check in without GPS.
          </p>
          <div className="flex gap-2 w-full mt-1">
            <Link
              href={`/cleanup-events/${created.id}`}
              className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm text-center hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
            >
              View event
            </Link>
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 active:bg-sky-400 active:scale-[0.97] text-sky-950 text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation"
            >
              Done
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Host Cleanup Event" badge="Beta" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {adminGroups.length > 1 && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Hosting group</label>
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setCohostGroupIds((prev) => prev.filter((id) => id !== e.target.value));
              }}
              className="w-full min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm"
            >
              {adminGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        {groupId && (
          <CohostGroupPicker
            primaryGroupId={groupId}
            value={cohostGroupIds}
            onChange={setCohostGroupIds}
          />
        )}

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Saturday shoreline cleanup"
            className="w-full min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm placeholder:text-zinc-600"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm placeholder:text-zinc-600 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Starts</label>
          <input
            type="datetime-local"
            value={scheduledStart}
            onChange={(e) => setScheduledStart(e.target.value)}
            className="w-full min-w-0 min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm"
          />
          <p className="mt-1 text-[11px] text-zinc-600">Tap outside the calendar to confirm your selection.</p>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Ends (optional)</label>
          <input
            type="datetime-local"
            value={scheduledEnd}
            min={scheduledStart || undefined}
            onChange={(e) => setScheduledEnd(e.target.value)}
            aria-invalid={endBeforeStart}
            className="w-full min-w-0 min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm"
          />
          {!scheduledEnd && (
            <p className="mt-1 text-[11px] text-zinc-600">If left blank, check-in stays open until 2 hours after the start time.</p>
          )}
          {endBeforeStart && (
            <p className="mt-1 text-[11px] text-red-400">
              That end time is before the start time ({new Date(scheduledStart).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}). Pick an end time after the start.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">How should cleanups get logged?</label>
          <select
            value={loggingMode}
            onChange={(e) => setLoggingMode(e.target.value as "organizer_total" | "individual")}
            className="w-full min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm"
          >
            <option value="organizer_total">Organizer logs team total (recommended)</option>
            <option value="individual">Attendees self-log individually</option>
          </select>
          <p className="mt-1 text-xs text-zinc-400">
            {loggingMode === "organizer_total"
              ? "You enter the combined haul once everyone's done; points get split across attendees."
              : "Attendees self-log from the map near the event; no team total needed."}
          </p>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">RSVP limit (optional)</label>
          <input
            type="number"
            min={1}
            value={maxAttendees}
            onChange={(e) => setMaxAttendees(e.target.value.replace(/^0+(?=\d)/, ""))}
            placeholder="No limit"
            className="w-full min-w-0 min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm placeholder:text-zinc-600"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Event link (optional)</label>
          <input
            type="url"
            value={externalLink}
            onChange={(e) => setExternalLink(e.target.value)}
            placeholder="https://... (site, waiver form, sign-up sheet)"
            className="w-full min-w-0 min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm placeholder:text-zinc-600"
          />
        </div>

        {!route && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Street address</label>
            <AddressAutocomplete
              value={addressValue}
              onChange={setAddressValue}
              onSelect={(s) => {
                setAddressValue(s.addressLine1);
                setAddressCity(s.city);
                setAddressState(s.state);
                setAddressPostalCode(s.postalCode);
                setAddressCountry(s.country);
                setAddressCoords({ latitude: s.lat, longitude: s.lng });
              }}
              placeholder="Search for an address..."
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">City</label>
                <input
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  className="w-full min-w-0 min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">State</label>
                <input
                  value={addressState}
                  onChange={(e) => setAddressState(e.target.value)}
                  className="w-full min-w-0 min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Postal code</label>
                <input
                  value={addressPostalCode}
                  onChange={(e) => setAddressPostalCode(e.target.value)}
                  className="w-full min-w-0 min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Country</label>
                <input
                  value={addressCountry}
                  onChange={(e) => setAddressCountry(e.target.value)}
                  className="w-full min-w-0 min-h-11 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm"
                />
              </div>
            </div>
            {!overrideCoords && !addressCoords && (
              <GpsIndicator
                status={gps.status}
                coords={gps.coords}
                errorCode={gps.errorCode}
                onRetry={gps.capture}
              />
            )}
            {overrideCoords ? (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                Pinned: {overrideCoords.latitude.toFixed(5)}, {overrideCoords.longitude.toFixed(5)}
              </div>
            ) : addressCoords ? (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                Address set: {addressCoords.latitude.toFixed(5)}, {addressCoords.longitude.toFixed(5)}
              </div>
            ) : null}
            {submitCoords && (
              <button
                onClick={() => onEnterPinPicker(submitCoords)}
                className="mt-1.5 text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline"
              >
                {overrideCoords ? "Reposition pin on map" : "Fine-tune pin on map"}
              </button>
            )}
            {submitCoords && (
              <MiniMapPreview lat={submitCoords.latitude} lng={submitCoords.longitude} styleId={activeMapStyle} interactive />
            )}
          </div>
        )}

        {route && (
          <button
            type="button"
            onClick={() => setRoute(null)}
            className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline"
          >
            Use a single pin instead
          </button>
        )}

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5 flex items-center gap-1.5">
            Pre-planned route (optional)
            <span
              title="This feature should work but is still being tested."
              className="text-xs text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5 font-normal cursor-help"
            >
              Beta
            </span>
          </label>
          {!route ? (
            <button
              type="button"
              onClick={onEnterRoutePicker}
              className="w-full py-2.5 rounded-lg border border-dashed border-zinc-700 text-zinc-400 text-sm hover:border-zinc-500 hover:text-zinc-200 active:border-zinc-500 active:text-zinc-200 active:scale-[0.98] transition-[background-color,border-color,transform] duration-150 touch-manipulation"
            >
              🛤️ Draw route on map
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  Route drawn ({route.coordinates.length} node{route.coordinates.length === 1 ? "" : "s"})
                </span>
                <button
                  type="button"
                  onClick={onEnterRoutePicker}
                  className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline"
                >
                  Redraw
                </button>
              </div>
              <RoutePreviewMap coordinates={route.coordinates} heightClassName="h-[140px]" />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Photo (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600 active:file:bg-zinc-600 transition-colors duration-150"
          />
          {imagePreview && (
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-zinc-700 shrink-0">
                <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                <IconButton
                  onClick={() => setImageFile(null)}
                  size="sm"
                  className="absolute top-0 right-0 bg-black/70 text-white text-[10px] leading-none rounded-bl rounded-tr-lg"
                  aria-label="Remove photo"
                >
                  ×
                </IconButton>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="flex-1 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 active:bg-sky-400 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed text-sky-950 text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation"
          >
            {submitting ? "Creating…" : "Create Event"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Solarpunk action modal ───────────────────────────────────────────────────

function SolarpunkActionModal({
  campaignId,
  userId,
  userGroups,
  gps,
  overrideCoords,
  onEnterPinPicker,
  onClose,
  onContributionSubmitted,
  activeMapStyle,
}: {
  campaignId: string;
  userId: string | null;
  userGroups: { id: string; name: string; image_url?: string | null }[];
  gps: ReturnType<typeof useGPS>;
  overrideCoords: Coords | null;
  onEnterPinPicker: () => void;
  onClose: () => void;
  onContributionSubmitted?: (lat: number | null, lng: number | null, value: number, photoUrl?: string) => void;
  activeMapStyle?: string;
}) {
  const pathname = usePathname();
  const [selectedCategoryIdx, setSelectedCategoryIdx] = useState<number | null>(null);
  const [selectedAction, setSelectedAction] = useState<{ key: string; label: string; points: number } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("frontline:contrib:group");
      if (stored === "__individual__") return null;
      if (stored && userGroups.some((g) => g.id === stored)) return stored;
    }
    return userGroups.length === 1 ? userGroups[0].id : null;
  });
  const [submitting, setSubmitting] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [result, setResult] = useState<"success" | "outside" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitCoords = overrideCoords ?? gps.coords;
  const canSubmit = !submitting && !!selectedAction && !!submitCoords;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedAction || !userId) return;
    setSubmitting(true);
    setError(null);
    try {
      let photoUrl: string | null = null;
      if (photo) photoUrl = await uploadToR2(photo);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaign_id: campaignId,
            user_id: userId,
            group_id: selectedGroupId,
            contribution_type: "solarpunk_action",
            value: selectedAction.points,
            photo_url: photoUrl,
            notes: selectedAction.key,
            latitude: submitCoords!.latitude,
            longitude: submitCoords!.longitude,
          }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { claimed_territory: boolean };
      onContributionSubmitted?.(submitCoords!.latitude, submitCoords!.longitude, selectedAction.points, photoUrl ?? undefined);
      setAnimating(true);
      setTimeout(() => {
        setAnimating(false);
        setResult(data.claimed_territory ? "success" : "outside");
      }, BLOOM_ANIMATION_MS);
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (animating) return null;

  if (result) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4">
          <span className="text-4xl">🌱</span>
          <p className="text-zinc-100 font-semibold text-center">
            {result === "success"
              ? `+${selectedAction?.points ?? 0} bloom points! Your hex is growing.`
              : "Action logged! 🌱"}
          </p>
          <button onClick={onClose} className="mt-2 text-sm text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150">Close</button>
        </div>
      </ModalShell>
    );
  }

  const activeCat = selectedCategoryIdx !== null ? SOLARPUNK_ACTIONS[selectedCategoryIdx] : null;

  return (
    <ModalShell title="Log Solarpunk Action" onClose={onClose}>
      <div className="flex flex-col gap-4">

        {/* Location */}
        <div>
          <p className="text-xs text-zinc-500 mb-1.5">Your location (required)</p>
          <GpsIndicator status={gps.status} coords={gps.coords} errorCode={gps.errorCode} onRetry={gps.capture} />
          {overrideCoords && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              Pinned: {overrideCoords.latitude.toFixed(5)}, {overrideCoords.longitude.toFixed(5)}
            </div>
          )}
          {gps.status === "success" && gps.coords && (
            <button onClick={onEnterPinPicker} className="mt-1.5 text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline">
              {overrideCoords ? "Reposition on map" : "Place pin on map"}
            </button>
          )}
        </div>

        {submitCoords && (
          <MiniMapPreview lat={submitCoords.latitude} lng={submitCoords.longitude} styleId={activeMapStyle} />
        )}

        {/* Category picker */}
        <div>
          <label className="block text-xs text-zinc-500 mb-2">Category</label>
          <div className="grid grid-cols-4 gap-1.5">
            {SOLARPUNK_ACTIONS.map((cat, i) => (
              <button
                key={cat.category}
                type="button"
                onClick={() => { setSelectedCategoryIdx(i); setSelectedAction(null); }}
                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border text-xs font-medium transition-colors ${selectedCategoryIdx === i
                  ? "bg-lime-900/60 border-lime-600 text-lime-300"
                  : "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 active:border-zinc-500 active:text-zinc-300 active:scale-[0.97]"
                  }`}
              >
                <span className="text-base">{cat.icon}</span>
                <span className="leading-tight text-center">{cat.category}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action picker */}
        {activeCat && (
          <div>
            <label className="block text-xs text-zinc-500 mb-2">Action</label>
            <div className="flex flex-col gap-1.5">
              {activeCat.actions.map((a) =>
                "link" in a ? (
                  <Link
                    key={a.key}
                    href={a.link}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-emerald-600 bg-emerald-950/50 text-xs font-semibold text-left text-emerald-300 hover:bg-emerald-900/60 hover:border-emerald-500 active:bg-emerald-900/60 active:border-emerald-500 active:scale-[0.97] transition-[background-color,border-color,transform] duration-150 touch-manipulation"
                  >
                    <span className="text-base shrink-0">🗑️</span>
                    <span className="flex-1">{a.label}</span>
                    <span className="shrink-0 text-emerald-400">→</span>
                  </Link>
                ) : (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setSelectedAction(a)}
                    className={`flex items-center justify-between min-h-11 px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-left ${selectedAction?.key === a.key
                      ? "bg-lime-900/60 border-lime-600 text-lime-200"
                      : "bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 active:border-zinc-500 active:text-zinc-200 active:scale-[0.97]"
                      }`}
                  >
                    <span>{a.label}</span>
                    <span className={`ml-2 shrink-0 font-bold ${selectedAction?.key === a.key ? "text-lime-400" : "text-zinc-600"}`}>
                      +{a.points}pts
                    </span>
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Group */}
        {userGroups.length > 0 && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Contributing as</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => { setSelectedGroupId(null); localStorage.setItem("frontline:contrib:group", "__individual__"); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedGroupId === null ? "bg-zinc-700 border-zinc-500 text-zinc-100" : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.95]"}`}
              >Individual</button>
              {userGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setSelectedGroupId(g.id); localStorage.setItem("frontline:contrib:group", g.id); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedGroupId === g.id ? "bg-lime-900/60 border-lime-600 text-lime-300" : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.95]"}`}
                >
                  {g.image_url ? (
                    <img src={g.image_url} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full bg-zinc-700 text-[7px] flex items-center justify-center font-bold shrink-0">
                      {g.name[0].toUpperCase()}
                    </span>
                  )}
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Optional photo */}
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Photo (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600 active:file:bg-zinc-600 transition-colors duration-150"
          />
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation">
            Cancel
          </button>
          {userId ? (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-2 rounded-lg bg-lime-700 hover:bg-lime-600 active:bg-lime-600 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation"
            >
              {submitting ? "Submitting…" : selectedAction ? `Submit (+${selectedAction.points} pts)` : "Submit"}
            </button>
          ) : (
            <Link
              href={`/login?next=${pathname}`}
              className="flex-1 py-2 rounded-lg bg-lime-700 hover:bg-lime-600 active:bg-lime-600 active:scale-[0.97] text-white text-sm font-semibold text-center transition-[background-color,transform] duration-150 touch-manipulation"
            >
              {selectedAction ? `Sign in to log (+${selectedAction.points} pts)` : "Sign in to log"}
            </Link>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Solarpunk photo modal ────────────────────────────────────────────────────

function SolarpunkPhotoModal({
  campaignId,
  userId,
  userGroups,
  gps,
  overrideCoords,
  onEnterPinPicker,
  onClose,
  onContributionSubmitted,
  activeMapStyle,
}: {
  campaignId: string;
  userId: string | null;
  userGroups: { id: string; name: string; image_url?: string | null }[];
  gps: ReturnType<typeof useGPS>;
  overrideCoords: Coords | null;
  onEnterPinPicker: () => void;
  onClose: () => void;
  onContributionSubmitted?: (lat: number | null, lng: number | null, value: number, photoUrl?: string) => void;
  activeMapStyle?: string;
}) {
  const pathname = usePathname();
  const [photo, setPhoto] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("frontline:contrib:group");
      if (stored === "__individual__") return null;
      if (stored && userGroups.some((g) => g.id === stored)) return stored;
    }
    return userGroups.length === 1 ? userGroups[0].id : null;
  });
  const [submitting, setSubmitting] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [result, setResult] = useState<"success" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitCoords = overrideCoords ?? gps.coords;
  const canSubmit = !submitting && !!photo && !!submitCoords;

  const handleSubmit = async () => {
    if (!canSubmit || !photo || !userId) return;
    setSubmitting(true);
    setError(null);
    try {
      const photoUrl = await uploadToR2(photo);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaign_id: campaignId,
            user_id: userId,
            group_id: selectedGroupId,
            contribution_type: "solarpunk_photo",
            value: 2,
            photo_url: photoUrl,
            notes: notes.trim() || null,
            latitude: submitCoords!.latitude,
            longitude: submitCoords!.longitude,
          }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      onContributionSubmitted?.(submitCoords!.latitude, submitCoords!.longitude, 2, photoUrl);
      setAnimating(true);
      setTimeout(() => {
        setAnimating(false);
        setResult("success");
      }, BLOOM_ANIMATION_MS);
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (animating) return null;

  if (result) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4">
          <span className="text-4xl">🌿</span>
          <p className="text-zinc-100 font-semibold text-center">Photo added to the bloom map!</p>
          <button onClick={onClose} className="mt-2 text-sm text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150">Close</button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Spot It — Photograph the Future" onClose={onClose}>
      <div className="flex flex-col gap-4">

        {/* Location */}
        <div>
          <p className="text-xs text-zinc-500 mb-1.5">Your location (required)</p>
          <GpsIndicator status={gps.status} coords={gps.coords} errorCode={gps.errorCode} onRetry={gps.capture} />
          {overrideCoords && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              Pinned: {overrideCoords.latitude.toFixed(5)}, {overrideCoords.longitude.toFixed(5)}
            </div>
          )}
          {gps.status === "success" && gps.coords && (
            <button onClick={onEnterPinPicker} className="mt-1.5 text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 underline">
              {overrideCoords ? "Reposition on map" : "Place pin on map"}
            </button>
          )}
        </div>

        {submitCoords && (
          <MiniMapPreview lat={submitCoords.latitude} lng={submitCoords.longitude} styleId={activeMapStyle} />
        )}

        {/* Photo */}
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Photo (required) — something solarpunk you spotted</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600 active:file:bg-zinc-600 transition-colors duration-150"
          />
        </div>

        {/* Caption */}
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Caption (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Describe what makes this solarpunk…"
            className="w-full min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm resize-none focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
        </div>

        {/* Group */}
        {userGroups.length > 0 && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Contributing as</label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => { setSelectedGroupId(null); localStorage.setItem("frontline:contrib:group", "__individual__"); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedGroupId === null ? "bg-zinc-700 border-zinc-500 text-zinc-100" : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.95]"}`}>
                Individual
              </button>
              {userGroups.map((g) => (
                <button key={g.id} type="button" onClick={() => { setSelectedGroupId(g.id); localStorage.setItem("frontline:contrib:group", g.id); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedGroupId === g.id ? "bg-lime-900/60 border-lime-600 text-lime-300" : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 active:border-zinc-500 active:scale-[0.95]"}`}>
                  {g.image_url ? (
                    <img src={g.image_url} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full bg-zinc-700 text-[7px] flex items-center justify-center font-bold shrink-0">
                      {g.name[0].toUpperCase()}
                    </span>
                  )}
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation">
            Cancel
          </button>
          {userId ? (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-2 rounded-lg bg-lime-700 hover:bg-lime-600 active:bg-lime-600 active:scale-[0.97] disabled:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation"
            >
              {submitting ? "Uploading…" : "Submit (+2 pts)"}
            </button>
          ) : (
            <Link
              href={`/login?next=${pathname}`}
              className="flex-1 py-2 rounded-lg bg-lime-700 hover:bg-lime-600 active:bg-lime-600 active:scale-[0.97] text-white text-sm font-semibold text-center transition-[background-color,transform] duration-150 touch-manipulation"
            >
              Sign in to submit (+2 pts)
            </Link>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

// ─── All actions overview modal ──────────────────────────────────────────────

function AllActionsModal({
  onClose,
  onLogAction,
}: {
  onClose: () => void;
  onLogAction: () => void;
}) {
  return (
    <ModalShell title="All Solarpunk Actions" onClose={onClose}>
      <div className="flex flex-col gap-5">
        {SOLARPUNK_ACTIONS.map((cat) => (
          <div key={cat.category}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-base">{cat.icon}</span>
              <span className="text-xs font-semibold text-zinc-300">{cat.category}</span>
            </div>
            <div className="flex flex-col gap-1">
              {cat.actions.map((a) =>
                "link" in a ? (
                  <Link
                    key={a.key}
                    href={a.link}
                    onClick={onClose}
                    className="flex items-center gap-2 min-h-11 px-3 py-2 rounded-lg border-2 border-emerald-600 bg-emerald-950/50 text-xs font-semibold text-left text-emerald-300 hover:bg-emerald-900/60 hover:border-emerald-500 active:bg-emerald-900/60 active:border-emerald-500 active:scale-[0.97] transition-[background-color,border-color,transform] duration-150 touch-manipulation"
                  >
                    <span className="text-base shrink-0">🗑️</span>
                    <span className="flex-1">{a.label}</span>
                    <span className="shrink-0 text-emerald-400">→</span>
                  </Link>
                ) : (
                  <div
                    key={a.key}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-800/40 text-xs text-zinc-400"
                  >
                    <span>{a.label}</span>
                    <span className="ml-2 shrink-0 font-bold text-zinc-500">+{a.points}pts</span>
                  </div>
                )
              )}
            </div>
          </div>
        ))}

        <button
          onClick={onLogAction}
          className="py-2 rounded-lg bg-lime-700 hover:bg-lime-600 active:bg-lime-600 active:scale-[0.97] text-white text-sm font-semibold transition-[background-color,transform] duration-150 touch-manipulation"
        >
          Log an Action
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function ModalShell({
  title,
  badge,
  onClose,
  children,
  glow,
}: {
  title?: string;
  badge?: string;
  onClose: () => void;
  children: React.ReactNode;
  glow?: "orange" | "blue" | false;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-sm">
        {glow && (
          <div
            className={`absolute -inset-1 rounded-xl blur-md animate-pulse pointer-events-none ${glow === "blue" ? "bg-sky-500/50" : "bg-orange-500/50"
              }`}
          />
        )}
        <div
          className={`relative w-full bg-zinc-900 border rounded-xl shadow-2xl flex flex-col max-h-[75vh] sm:max-h-[90vh] ${glow === "blue" ? "border-sky-600/70" : glow === "orange" ? "border-orange-600/70" : "border-zinc-800"
            }`}
        >
          {title && (
            <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-zinc-100 font-semibold text-base">{title}</h2>
                {badge && (
                  <span
                    title="This feature should work but is still being tested."
                    className="text-[10px] text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5 shrink-0 cursor-help"
                  >
                    {badge}
                  </span>
                )}
              </div>
              <IconButton onClick={onClose} size="sm" className="-mr-1.5 text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150 text-lg leading-none" aria-label="Close">
                ×
              </IconButton>
            </div>
          )}
          <div className={`overflow-y-auto ${title ? "px-5 pb-5" : "p-5"}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function ContributionPanel({
  campaignId,
  campaignContributionType,
  userId,
  userGroups = [],
  onEnterPinPicker,
  pinPickerActive,
  placedPinCoords,
  onEnterRoutePicker,
  routePickerActive,
  placedRouteVertices,
  onContributionSubmitted,
  onReportSubmitted,
  onRouteAdded,
  userLocation,
  locationError,
  requestLocation,
  activeMapStyle,
  onStyleChange,
  pendingCleanupEventId,
  onPendingCleanupEventConsumed,
  nearbyCleanupEvent,
  clickedReport,
  onClickedReportConsumed,
  onClaimReportUpdated,
  onClaimReportResolved,
  myActiveClaimReport,
}: ContributionPanelProps) {
  const isSolarpunk = campaignContributionType === "solarpunk_action";

  const gps = useGPS(requestLocation, userLocation, locationError);
  const [mode, setMode] = useState<"contribute" | "report" | "solarpunk_photo" | "all_actions" | "host_event" | "claim" | null>(null);
  const [contributeOverrideCoords, setContributeOverrideCoords] = useState<Coords | null>(null);
  const [solarpunkPhotoOverrideCoords, setSolarpunkPhotoOverrideCoords] = useState<Coords | null>(null);
  const [reportOverrideCoords, setReportOverrideCoords] = useState<Coords | null>(null);
  const [hostEventOverrideCoords, setHostEventOverrideCoords] = useState<Coords | null>(null);
  const [logHostExpanded, setLogHostExpanded] = useState(false);
  const [contributeRouteOverride, setContributeRouteOverride] = useState<RouteLineString | null>(null);
  const [hostEventRouteOverride, setHostEventRouteOverride] = useState<RouteLineString | null>(null);
  const [activeClaimReport, setActiveClaimReport] = useState<ClickedReport | null>(null);
  const [claimedReportIdForContribute, setClaimedReportIdForContribute] = useState<string | null>(null);
  const [claimedPhotoUrlsForContribute, setClaimedPhotoUrlsForContribute] = useState<string[]>([]);
  const prevPinPickerActiveRef = useRef(false);
  const prevRoutePickerActiveRef = useRef(false);

  // If a claim challenge's Log Cleanup step gets canceled/dismissed, the report was already
  // marked resolved server-side by the after-photo step (before the cleanup contribution is
  // actually logged), so it drops off the open-reports list with no way back in. Poll for it
  // here so we can offer to resume finishing the log.
  const [pendingChallengeCompletion, setPendingChallengeCompletion] = useState<{
    id: string;
    latitude: number;
    longitude: number;
    photo_urls: string[];
    unit_type: string | null;
  } | null>(null);
  const refreshPendingChallengeCompletion = useCallback(() => {
    if (!userId) {
      setPendingChallengeCompletion(null);
      return;
    }
    fetch(
      `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/problem-reports/campaign/${campaignId}/pending-challenge-completion?user_id=${userId}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then(setPendingChallengeCompletion)
      .catch(() => {});
  }, [campaignId, userId]);
  useEffect(() => { refreshPendingChallengeCompletion(); }, [refreshPendingChallengeCompletion]);

  // A pin click on the map hands us a report; jump straight into the claim modal.
  useEffect(() => {
    if (!clickedReport) return;
    setActiveClaimReport(clickedReport);
    setMode("claim");
    onClickedReportConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickedReport]);

  // Geofence auto-prompt shortcut: the parent tells us the user tapped the banner's "Log
  // here" action. Jump straight into the contribute modal — since the user is still within
  // range, nearbyCleanupEvent below drives the same pre-checked "count this toward the
  // event" banner they'd get from opening Log Cleanup manually, just without the extra tap.
  // (Not a forced/locked link to the event — the user can still uncheck it in the modal.)
  useEffect(() => {
    if (!pendingCleanupEventId) return;
    setMode("contribute");
    setContributeOverrideCoords(null);
    gps.capture();
    onPendingCleanupEventConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCleanupEventId]);

  // The modal stays mounted (just visually hidden) while pinPickerActive is true, so its
  // local state (photos, bag counts, notes…) survives the pin-drag round trip — it used to
  // be unmounted via setMode(null) here, which wiped that state on every reposition.
  useEffect(() => {
    if (prevPinPickerActiveRef.current && !pinPickerActive) {
      if (mode === "report") {
        setReportOverrideCoords(placedPinCoords);
      } else if (mode === "contribute") {
        setContributeOverrideCoords(placedPinCoords);
      } else if (mode === "solarpunk_photo") {
        setSolarpunkPhotoOverrideCoords(placedPinCoords);
      } else if (mode === "host_event") {
        setHostEventOverrideCoords(placedPinCoords);
      }
    }
    prevPinPickerActiveRef.current = pinPickerActive;
  }, [pinPickerActive, placedPinCoords, mode]);

  // Same transition-capture pattern as the pin picker above, but for a finished route: once
  // routePickerActive flips true → false, the parent's placedRouteVertices holds the final
  // polyline, which we wrap into a RouteLineString for ContributeModal to look up zips for.
  useEffect(() => {
    if (prevRoutePickerActiveRef.current && !routePickerActive) {
      if (mode === "contribute" && placedRouteVertices && placedRouteVertices.length >= 2) {
        setContributeRouteOverride({ type: "LineString", coordinates: placedRouteVertices });
      } else if (mode === "host_event" && placedRouteVertices && placedRouteVertices.length >= 2) {
        setHostEventRouteOverride({ type: "LineString", coordinates: placedRouteVertices });
      }
    }
    prevRoutePickerActiveRef.current = !!routePickerActive;
  }, [routePickerActive, placedRouteVertices, mode]);

  const openContribute = () => {
    setMode("contribute");
    setContributeOverrideCoords(null);
    gps.capture();
  };

  const handleEnterPinPickerForContribute = () => {
    const coords = contributeOverrideCoords ?? gps.coords;
    if (!coords) return;
    const noun = CONTRIBUTION_LOCATION_NOUN[campaignContributionType] ?? "cleanup";
    onEnterPinPicker(coords, !isSolarpunk, `Drag the pin to your exact ${noun} location`);
  };

  const handleEnterPinPickerForSolarpunkPhoto = () => {
    const coords = solarpunkPhotoOverrideCoords ?? gps.coords;
    if (!coords) return;
    onEnterPinPicker(coords, false, "Drag the pin to where you spotted it");
  };

  const handleEnterPinPickerForReport = () => {
    const coords = reportOverrideCoords ?? gps.coords;
    if (!coords) return;
    onEnterPinPicker(coords, false, "Drag the pin to the trash location");
  };

  const handleEnterPinPickerForHostEvent = (coords: Coords) => {
    onEnterPinPicker(coords, false, "Drag the pin to the event location");
  };

  const handleEnterRoutePickerForContribute = () => {
    onEnterRoutePicker?.();
  };

  const handleEnterRoutePickerForHostEvent = () => {
    onEnterRoutePicker?.();
  };

  const showReport = campaignContributionType === "cleanup";
  const adminGroups = userGroups.filter((g) => g.isAdmin);
  const showHostEvent = showReport && adminGroups.length > 0;
  const btn = PANEL_BUTTON[campaignContributionType] ?? PANEL_BUTTON.cleanup;

  return (
    <>
      {pendingChallengeCompletion && mode !== "contribute" && (
        <button
          onClick={() => {
            setClaimedReportIdForContribute(pendingChallengeCompletion.id);
            setClaimedPhotoUrlsForContribute(pendingChallengeCompletion.photo_urls);
            setContributeOverrideCoords({
              latitude: pendingChallengeCompletion.latitude,
              longitude: pendingChallengeCompletion.longitude,
            });
            setMode("contribute");
            gps.capture();
          }}
          className="absolute top-[5.5rem] sm:top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-800/60 bg-amber-950/80 text-amber-200 text-xs font-medium backdrop-blur-sm shadow-glow-amber transition-[background-color,transform] duration-150 hover:bg-amber-900/80 active:scale-[0.96] touch-manipulation"
        >
          <span className="text-sm">🎯</span>
          <span>Finish logging your hotspot cleanup to earn points</span>
        </button>
      )}
      {myActiveClaimReport && mode !== "claim" && (
        <ActiveClaimBadge
          claim={myActiveClaimReport}
          onClick={() => { setActiveClaimReport(myActiveClaimReport); setMode("claim"); }}
          onExpired={(reportId) =>
            onClaimReportUpdated?.(reportId, {
              status: "open",
              claimed_by_user_id: null,
              claim_before_deadline_at: null,
              claim_after_deadline_at: null,
            })
          }
        />
      )}
      {!pinPickerActive && (
        <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2 items-start">
          {/* Mobile: condense Log/Host into one FAB that expands sub-options in an arc */}
          <div className="flex items-center gap-2 sm:hidden">
            {showHostEvent ? (
              <div className="flex items-center gap-2">
                <div className="relative w-14 h-14">
                  <motion.button
                    onClick={() => setLogHostExpanded((v) => !v)}
                    aria-label={logHostExpanded ? "Close menu" : "Log Cleanup or Host Event"}
                    whileTap={{ scale: 0.9 }}
                    animate={{ rotate: logHostExpanded ? 45 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="absolute top-0 left-0 flex items-center justify-center w-14 h-14 rounded-full bg-zinc-900/90 hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.92] transition-[background-color,transform] duration-150 border border-zinc-700 text-2xl backdrop-blur-sm shadow-elevation-3 touch-manipulation"
                  >
                    {logHostExpanded ? "✕" : btn.icon}
                  </motion.button>
                  <AnimatePresence>
                    {logHostExpanded && (
                      <>
                        <motion.button
                          key="log"
                          onClick={() => { openContribute(); setLogHostExpanded(false); }}
                          title={btn.label}
                          aria-label={btn.label}
                          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                          animate={{ opacity: 1, x: 10, y: -78, scale: 1 }}
                          exit={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                          transition={{ type: "spring", stiffness: 420, damping: 30 }}
                          whileTap={{ scale: 0.9 }}
                          className="absolute top-0 left-0 flex flex-col items-center justify-center gap-0.5 w-12 h-12 rounded-full bg-zinc-900/95 hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.92] transition-[background-color,transform] duration-150 border border-zinc-700 backdrop-blur-sm shadow-elevation-3 touch-manipulation"
                        >
                          <span className="text-base leading-none">{btn.icon}</span>
                          <span className="text-[8px] leading-none text-zinc-300">Log</span>
                        </motion.button>
                        <motion.button
                          key="event"
                          onClick={() => { setMode("host_event"); setHostEventOverrideCoords(null); gps.capture(); setLogHostExpanded(false); }}
                          title="Host Event (Beta) — this feature should work but is still being tested."
                          aria-label="Host Event (Beta)"
                          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                          animate={{ opacity: 1, x: 66, y: -38, scale: 1 }}
                          exit={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                          transition={{ type: "spring", stiffness: 420, damping: 30, delay: 0.03 }}
                          whileTap={{ scale: 0.9 }}
                          className="absolute top-0 left-0 flex flex-col items-center justify-center gap-0.5 w-12 h-12 rounded-full bg-zinc-900/95 hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.92] transition-[background-color,transform] duration-150 border border-sky-800/60 backdrop-blur-sm shadow-elevation-3 touch-manipulation"
                        >
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border border-zinc-900" />
                          <span className="text-base leading-none">📅</span>
                          <span className="text-[8px] leading-none text-sky-300">Event</span>
                        </motion.button>
                      </>
                    )}
                  </AnimatePresence>
                </div>
                <span className="text-zinc-300 text-sm font-medium bg-zinc-900/90 border border-zinc-700 px-2 py-1 rounded-lg backdrop-blur-sm shadow-elevation-2">
                  Cleanup
                </span>
              </div>
            ) : (
              <button
                onClick={openContribute}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm font-medium backdrop-blur-sm transition-[background-color,transform] duration-150 active:scale-[0.96] shadow-elevation-3 touch-manipulation"
              >
                {btn.icon} {btn.label}
              </button>
            )}
            {isSolarpunk && (
              <button
                onClick={() => setMode("all_actions")}
                title="View all actions"
                aria-label="View all Solarpunk actions"
                className="flex items-center justify-center w-9 h-9 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 text-sm font-bold backdrop-blur-sm transition-[background-color,transform] duration-150 active:scale-[0.93] shadow-elevation-3 touch-manipulation"
              >
                ℹ️
              </button>
            )}
          </div>
          {/* Desktop: no collision with the legend, so keep them side by side */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={openContribute}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm font-medium backdrop-blur-sm transition-[background-color,transform] duration-150 active:scale-[0.97] shadow-elevation-3 touch-manipulation"
            >
              {btn.icon} {btn.label}
            </button>
            {showHostEvent && (
              <button
                onClick={() => { setMode("host_event"); setHostEventOverrideCoords(null); gps.capture(); }}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 border border-sky-800/60 rounded-lg text-sky-300 text-sm font-medium backdrop-blur-sm transition-[background-color,transform] duration-150 active:scale-[0.97] shadow-elevation-3 touch-manipulation"
              >
                📅 Host Event
                <span
                  title="This feature should work but is still being tested."
                  className="text-[9px] text-amber-400 border border-amber-700/60 rounded px-1 py-0.5 leading-none cursor-help"
                >
                  Beta
                </span>
              </button>
            )}
            {isSolarpunk && (
              <button
                onClick={() => setMode("all_actions")}
                title="View all actions"
                aria-label="View all Solarpunk actions"
                className="flex items-center justify-center w-9 h-9 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 text-sm font-bold backdrop-blur-sm transition-[background-color,transform] duration-150 active:scale-[0.93] shadow-elevation-3 touch-manipulation"
              >
                ℹ️
              </button>
            )}
          </div>
          {isSolarpunk && (
            <button
              onClick={() => { setMode("solarpunk_photo"); setSolarpunkPhotoOverrideCoords(null); gps.capture(); }}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 border border-lime-800/60 rounded-lg text-lime-300 text-sm font-medium backdrop-blur-sm transition-[background-color,transform] duration-150 active:scale-[0.97] shadow-elevation-3 touch-manipulation"
            >
              📸 Spot It
            </button>
          )}
          {showReport && (
            <button
              onClick={() => { setMode("report"); setReportOverrideCoords(null); gps.capture(); }}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm font-medium backdrop-blur-sm transition-[background-color,transform] duration-150 active:scale-[0.97] shadow-elevation-3 touch-manipulation"
            >
              ⚠️ Report Trash
            </button>
          )}
          {onStyleChange && (
            <div className="self-start flex flex-wrap gap-2">
              <div className="flex gap-0.5 p-1 bg-zinc-900/90 border border-zinc-700/60 rounded-lg backdrop-blur-sm shadow-elevation-3">
                {MAP_STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onStyleChange(s.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-[background-color,color,transform] duration-150 active:scale-[0.95] touch-manipulation ${activeMapStyle === s.id
                      ? "bg-zinc-600 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 active:text-zinc-200 active:bg-zinc-800 active:scale-[0.95]"
                      }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "contribute" && (
        <div className={pinPickerActive || routePickerActive ? "hidden" : undefined}>
          {isSolarpunk ? (
            <SolarpunkActionModal
              campaignId={campaignId}
              userId={userId}
              userGroups={userGroups}
              gps={gps}
              overrideCoords={contributeOverrideCoords}
              onEnterPinPicker={handleEnterPinPickerForContribute}
              onClose={() => { setMode(null); setContributeOverrideCoords(null); }}
              onContributionSubmitted={onContributionSubmitted}
              activeMapStyle={activeMapStyle}
            />
          ) : (
            <ContributeModal
              campaignId={campaignId}
              campaignContributionType={campaignContributionType}
              userId={userId}
              userGroups={userGroups}
              gps={gps}
              overrideCoords={contributeOverrideCoords}
              onEnterPinPicker={handleEnterPinPickerForContribute}
              onEnterRoutePicker={handleEnterRoutePickerForContribute}
              routeOverride={contributeRouteOverride}
              onClose={() => {
                setMode(null);
                setContributeOverrideCoords(null);
                setContributeRouteOverride(null);
                setClaimedReportIdForContribute(null);
                setClaimedPhotoUrlsForContribute([]);
                refreshPendingChallengeCompletion();
              }}
              onContributionSubmitted={onContributionSubmitted}
              activeMapStyle={activeMapStyle}
              nearbyEvent={nearbyCleanupEvent ?? null}
              claimedReportId={claimedReportIdForContribute}
              prefillPhotoUrls={claimedPhotoUrlsForContribute}
            />
          )}
        </div>
      )}
      {mode === "claim" && activeClaimReport && (
        <div className={pinPickerActive ? "hidden" : undefined}>
          <ClaimReportModal
            report={activeClaimReport}
            userId={userId}
            activeMapStyle={activeMapStyle}
            gps={gps}
            onClose={() => { setMode(null); setActiveClaimReport(null); }}
            onClaimUpdated={(reportId, patch) => {
              setActiveClaimReport((r) => (r && r.id === reportId ? { ...r, ...patch } : r));
              onClaimReportUpdated?.(reportId, patch);
            }}
            onClaimResolved={(reportId) => onClaimReportResolved?.(reportId)}
            onStartChallengeContribution={(reportId, coords, photoUrls) => {
              setClaimedReportIdForContribute(reportId);
              setClaimedPhotoUrlsForContribute(photoUrls);
              setContributeOverrideCoords(coords);
              setActiveClaimReport(null);
              setMode("contribute");
              gps.capture();
            }}
            myActiveClaimReport={myActiveClaimReport}
            onViewActiveClaim={() => myActiveClaimReport && setActiveClaimReport(myActiveClaimReport)}
          />
        </div>
      )}
      {mode === "all_actions" && !pinPickerActive && (
        <AllActionsModal
          onClose={() => setMode(null)}
          onLogAction={() => { setMode("contribute"); setContributeOverrideCoords(null); gps.capture(); }}
        />
      )}
      {mode === "solarpunk_photo" && (
        <div className={pinPickerActive ? "hidden" : undefined}>
          <SolarpunkPhotoModal
            campaignId={campaignId}
            userId={userId}
            userGroups={userGroups}
            gps={gps}
            overrideCoords={solarpunkPhotoOverrideCoords}
            onEnterPinPicker={handleEnterPinPickerForSolarpunkPhoto}
            onClose={() => { setMode(null); setSolarpunkPhotoOverrideCoords(null); }}
            onContributionSubmitted={onContributionSubmitted}
            activeMapStyle={activeMapStyle}
          />
        </div>
      )}
      {mode === "report" && (
        <div className={pinPickerActive ? "hidden" : undefined}>
          <ReportModal
            campaignId={campaignId}
            userId={userId}
            gps={gps}
            overrideCoords={reportOverrideCoords}
            onEnterPinPicker={handleEnterPinPickerForReport}
            onClose={() => { setMode(null); setReportOverrideCoords(null); }}
            activeMapStyle={activeMapStyle}
            onReportSubmitted={onReportSubmitted}
          />
        </div>
      )}
      {mode === "host_event" && userId && (
        <div className={pinPickerActive || routePickerActive ? "hidden" : undefined}>
          <HostEventModal
            campaignId={campaignId}
            userId={userId}
            adminGroups={adminGroups}
            gps={gps}
            overrideCoords={hostEventOverrideCoords}
            onEnterPinPicker={handleEnterPinPickerForHostEvent}
            onEnterRoutePicker={handleEnterRoutePickerForHostEvent}
            routeOverride={hostEventRouteOverride}
            onClose={() => { setMode(null); setHostEventOverrideCoords(null); setHostEventRouteOverride(null); }}
            activeMapStyle={activeMapStyle}
            onRouteAdded={onRouteAdded}
          />
        </div>
      )}
    </>
  );
}
