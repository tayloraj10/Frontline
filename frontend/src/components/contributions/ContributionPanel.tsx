"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

const MiniMapPreview = dynamic(() => import("@/components/map/MiniMapPreview"), {
  ssr: false,
  loading: () => <div className="w-full h-[100px] rounded-lg bg-zinc-800 animate-pulse" />,
});

interface Coords {
  latitude: number;
  longitude: number;
}

const MAP_STYLES = [
  { id: "outdoor", label: "Terrain" },
  { id: "streets", label: "Streets" },
  { id: "hybrid",  label: "Satellite" },
] as const;

const PANEL_BUTTON: Record<string, { icon: string; label: string }> = {
  cleanup:         { icon: "🗑️", label: "Log Cleanup" },
  photo:           { icon: "📷", label: "Submit Photo" },
  registration:    { icon: "🗳️", label: "Register" },
  advocacy:        { icon: "✊", label: "Take Action" },
  civic_action:    { icon: "🗽", label: "Log Civic Action" },
  unfollow:        { icon: "🧠", label: "Log Unfollow" },
  solarpunk_action:{ icon: "🌿", label: "Log Action" },
  solarpunk_photo: { icon: "📸", label: "Spot It" },
};

const MODAL_CONFIG: Record<string, {
  title: string;
  successClaimed: string;
  successUnclaimed: string;
}> = {
  cleanup: {
    title: "Log Cleanup",
    successClaimed: "Cleanup logged! Territory updated.",
    successUnclaimed: "Cleanup logged! Location was outside the campaign area.",
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
  { key: "register_independent",    icon: "🗳️", label: "Register as Independent" },
  { key: "town_hall",               icon: "🏛️", label: "Attend a Town Hall" },
  { key: "contact_representative",  icon: "📬", label: "Contact Your Rep" },
  { key: "volunteer",               icon: "🤝", label: "Volunteer for Civic Org" },
  { key: "visit_landmark",          icon: "🗽", label: "Visit a Landmark" },
  { key: "attend_protest",          icon: "✊", label: "Attend a Protest" },
  { key: "read_founding_document",  icon: "📜", label: "Read a Founding Document" },
];

const SOLARPUNK_ACTIONS: {
  category: string;
  icon: string;
  actions: { key: string; label: string; points: number }[];
}[] = [
  {
    category: "Energy", icon: "⚡",
    actions: [
      { key: "solar_panels",  label: "Installed solar panels",            points: 50 },
      { key: "green_energy",  label: "Switched to green energy tariff",   points: 20 },
      { key: "energy_audit",  label: "Completed home energy audit",       points: 15 },
      { key: "led_lighting",  label: "Replaced all lighting with LEDs",   points: 8  },
      { key: "solar_charger", label: "Using a solar charger",             points: 5  },
    ],
  },
  {
    category: "Food", icon: "🌱",
    actions: [
      { key: "grow_food",         label: "Grew food (any amount)",        points: 15 },
      { key: "community_garden",  label: "Joined a community garden",     points: 20 },
      { key: "composted",         label: "Started composting",            points: 10 },
      { key: "saved_seeds",       label: "Saved seeds for next season",   points: 12 },
      { key: "foraged",           label: "Foraged / wildcrafted food",    points: 8  },
    ],
  },
  {
    category: "Transport", icon: "🚲",
    actions: [
      { key: "bike_commute",   label: "Biked instead of drove (week)", points: 10 },
      { key: "transit_month",  label: "Used transit for a month",      points: 20 },
      { key: "car_free_week",  label: "Car-free week",                 points: 25 },
      { key: "ev_switch",      label: "Switched to electric vehicle",  points: 40 },
      { key: "flight_avoided", label: "Avoided or offset a flight",    points: 30 },
    ],
  },
  {
    category: "Community", icon: "🤝",
    actions: [
      { key: "repair_cafe",  label: "Attended a repair café",       points: 15 },
      { key: "skill_share",  label: "Hosted a skill share",         points: 20 },
      { key: "tool_library", label: "Used or joined a tool library", points: 10 },
      { key: "mutual_aid",   label: "Participated in mutual aid",   points: 15 },
      { key: "cooperative",  label: "Joined a cooperative",         points: 25 },
    ],
  },
  {
    category: "Nature", icon: "🌳",
    actions: [
      { key: "plant_tree",        label: "Planted a tree",                points: 20 },
      { key: "rewilding",         label: "Rewilded part of your yard",    points: 25 },
      { key: "local_cleanup",     label: "Organized a local cleanup",     points: 15 },
      { key: "water_catchment",   label: "Installed rainwater catchment", points: 30 },
      { key: "pollinator_garden", label: "Created pollinator garden",     points: 18 },
    ],
  },
  {
    category: "Consumption", icon: "♻️",
    actions: [
      { key: "repair_item",      label: "Repaired instead of replacing",   points: 10 },
      { key: "secondhand",       label: "Bought something secondhand",     points: 8  },
      { key: "zero_waste_month", label: "Zero-waste shopping month",       points: 20 },
      { key: "clothing_swap",    label: "Organized a clothing swap",       points: 15 },
      { key: "refused_plastic",  label: "Refused single-use plastics (month)", points: 12 },
    ],
  },
  {
    category: "Advocacy", icon: "✊",
    actions: [
      { key: "contact_official", label: "Contacted an elected official",     points: 15 },
      { key: "attend_council",   label: "Attended a city council meeting",   points: 20 },
      { key: "wrote_article",    label: "Wrote about solarpunk values",      points: 15 },
      { key: "organized_event",  label: "Organized a community event",       points: 25 },
      { key: "taught_class",     label: "Taught a sustainability workshop",  points: 20 },
    ],
  },
];

interface ContributionPanelProps {
  campaignId: string;
  campaignContributionType: string;
  userId: string;
  userGroups?: { id: string; name: string; image_url?: string | null }[];
  onEnterPinPicker: (coords: Coords, constrained?: boolean) => void;
  pinPickerActive: boolean;
  placedPinCoords: Coords | null;
  onContributionSubmitted?: (lat: number | null, lng: number | null, value: number, photoUrl?: string) => void;
  onLocationCaptured?: (coords: Coords) => void;
  activeMapStyle?: string;
  onStyleChange?: (id: string) => void;
}

// ─── GPS hook ────────────────────────────────────────────────────────────────

function useGPS() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorCode, setErrorCode] = useState<number | null>(null);

  const capture = () => {
    if (!navigator.geolocation) {
      setErrorCode(0);
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErrorCode(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setStatus("success");
      },
      (err) => {
        if (err.code === 3) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
              setStatus("success");
            },
            (err2) => {
              setErrorCode(err2.code);
              setStatus("error");
            },
            { enableHighAccuracy: false, timeout: 8000 },
          );
          return;
        }
        setErrorCode(err.code);
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const reset = () => {
    setCoords(null);
    setStatus("idle");
    setErrorCode(null);
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
        <button onClick={onRetry} className="self-start text-zinc-400 underline hover:text-zinc-200 text-xs ml-4">
          Try again
        </button>
      </div>
    );
  }
  return null;
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
  onClose,
  onContributionSubmitted,
  activeMapStyle,
}: {
  campaignId: string;
  campaignContributionType: string;
  userId: string;
  userGroups: { id: string; name: string; image_url?: string | null }[];
  gps: ReturnType<typeof useGPS>;
  overrideCoords: Coords | null;
  onEnterPinPicker: () => void;
  onClose: () => void;
  onContributionSubmitted?: (lat: number | null, lng: number | null, value: number, photoUrl?: string) => void;
  activeMapStyle?: string;
}) {
  const isCleanup = campaignContributionType === "cleanup";
  const isPhoto = campaignContributionType === "photo";
  const isCivicAction = campaignContributionType === "civic_action";
  const isUnfollow = campaignContributionType === "unfollow";
  const needsLocation = isCleanup || isPhoto || isUnfollow;
  const showPhoto = isCleanup || isPhoto || isCivicAction;

  const config = MODAL_CONFIG[campaignContributionType] ?? MODAL_CONFIG.cleanup;

  const [bagCount, setBagCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
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
  const [result, setResult] = useState<"success" | "outside" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitCoords = overrideCoords ?? gps.coords;

  const canSubmit = (() => {
    if (submitting) return false;
    if ((isCleanup || isPhoto) && !submitCoords) return false;
    if (isPhoto && !photo) return false;
    if (isCivicAction && !selectedAction) return false;
    if (isUnfollow && !notes.trim()) return false;
    return true;
  })();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      let photoUrl: string | null = null;
      if (photo) photoUrl = await uploadToR2(photo);

      const value = isCleanup ? bagCount : 1;
      const computedNotes = isCivicAction ? selectedAction : (notes.trim() || null);

      const body: Record<string, unknown> = {
        campaign_id: campaignId,
        user_id: userId,
        group_id: selectedGroupId,
        contribution_type: campaignContributionType,
        value,
        photo_url: photoUrl,
        notes: computedNotes,
      };

      if (submitCoords) {
        body.latitude = submitCoords.latitude;
        body.longitude = submitCoords.longitude;
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/contributions/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { claimed_territory: boolean };

      onContributionSubmitted?.(
        submitCoords?.latitude ?? null,
        submitCoords?.longitude ?? null,
        value,
        photoUrl ?? undefined,
      );
      setResult((isPhoto || data.claimed_territory) ? "success" : "outside");
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
          <button onClick={onClose} className="mt-2 text-sm text-zinc-400 hover:text-zinc-200">
            Close
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={config.title} onClose={onClose}>
      <div className="flex flex-col gap-4">

        {/* Account handle — unfollow only (required) */}
        {isUnfollow && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Account you unfollowed (required)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="@handle or account name"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
          </div>
        )}

        {/* Location section */}
        {needsLocation && (
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
                className="mt-1.5 text-xs text-zinc-500 hover:text-zinc-300 underline"
              >
                {overrideCoords ? "Reposition on map" : "Place pin on map"}
              </button>
            )}
          </div>
        )}

        {needsLocation && submitCoords && (
          <MiniMapPreview lat={submitCoords.latitude} lng={submitCoords.longitude} styleId={activeMapStyle} />
        )}

        {/* Group selection */}
        {userGroups.length > 0 && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Contributing as</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => { setSelectedGroupId(null); localStorage.setItem("frontline:contrib:group", "__individual__"); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedGroupId === null
                    ? "bg-zinc-700 border-zinc-500 text-zinc-100"
                    : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500"
                }`}
              >
                Individual
              </button>
              {userGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setSelectedGroupId(g.id); localStorage.setItem("frontline:contrib:group", g.id); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedGroupId === g.id
                      ? "bg-emerald-900/60 border-emerald-600 text-emerald-300"
                      : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500"
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
            <input
              type="number"
              min={1}
              value={bagCount}
              onChange={(e) => setBagCount(Math.max(1, Number(e.target.value)))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
            />
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
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-xs font-medium transition-colors ${
                    selectedAction === a.key
                      ? "bg-blue-900/60 border-blue-500 text-blue-200"
                      : "bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
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
            <label className="block text-xs text-zinc-500 mb-1.5">
              Photo {isPhoto ? "(required)" : "(optional)"}
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600"
            />
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
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm resize-none focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
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
}: {
  campaignId: string;
  userId: string;
  gps: ReturnType<typeof useGPS>;
  overrideCoords: Coords | null;
  onEnterPinPicker: () => void;
  onClose: () => void;
  activeMapStyle?: string;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (gps.status === "idle") gps.capture(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitCoords = overrideCoords ?? gps.coords;

  const handleSubmit = async () => {
    if (!submitCoords || !photo) return;
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
      setDone(true);
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
          <span className="text-4xl">📍</span>
          <p className="text-zinc-100 font-semibold text-center">
            Report submitted! If enough reports come in, a Hotspot will spawn.
          </p>
          <button onClick={onClose} className="mt-2 text-sm text-zinc-400 hover:text-zinc-200">
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
              className="mt-1.5 text-xs text-zinc-500 hover:text-zinc-300 underline"
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
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Severity</label>
          <div className="flex gap-2">
            {(["low", "medium", "high"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
                  severity === s
                    ? s === "high"
                      ? "bg-red-900/60 border-red-600 text-red-300"
                      : s === "medium"
                        ? "bg-yellow-900/60 border-yellow-600 text-yellow-300"
                        : "bg-zinc-700 border-zinc-500 text-zinc-200"
                    : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!submitCoords || !photo || submitting}
            className="flex-1 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {submitting ? "Submitting…" : "Report"}
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
  userId: string;
  userGroups: { id: string; name: string; image_url?: string | null }[];
  gps: ReturnType<typeof useGPS>;
  overrideCoords: Coords | null;
  onEnterPinPicker: () => void;
  onClose: () => void;
  onContributionSubmitted?: (lat: number | null, lng: number | null, value: number, photoUrl?: string) => void;
  activeMapStyle?: string;
}) {
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
  const [result, setResult] = useState<"success" | "outside" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitCoords = overrideCoords ?? gps.coords;
  const canSubmit = !submitting && !!selectedAction && !!submitCoords;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedAction) return;
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
      setResult(data.claimed_territory ? "success" : "outside");
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
          <button onClick={onClose} className="mt-2 text-sm text-zinc-400 hover:text-zinc-200">Close</button>
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
            <button onClick={onEnterPinPicker} className="mt-1.5 text-xs text-zinc-500 hover:text-zinc-300 underline">
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
                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border text-xs font-medium transition-colors ${
                  selectedCategoryIdx === i
                    ? "bg-lime-900/60 border-lime-600 text-lime-300"
                    : "bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
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
              {activeCat.actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setSelectedAction(a)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-left ${
                    selectedAction?.key === a.key
                      ? "bg-lime-900/60 border-lime-600 text-lime-200"
                      : "bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span>{a.label}</span>
                  <span className={`ml-2 shrink-0 font-bold ${selectedAction?.key === a.key ? "text-lime-400" : "text-zinc-600"}`}>
                    +{a.points}pts
                  </span>
                </button>
              ))}
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
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedGroupId === null ? "bg-zinc-700 border-zinc-500 text-zinc-100" : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}
              >Individual</button>
              {userGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setSelectedGroupId(g.id); localStorage.setItem("frontline:contrib:group", g.id); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedGroupId === g.id ? "bg-lime-900/60 border-lime-600 text-lime-300" : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}
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
            className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600"
          />
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2 rounded-lg bg-lime-700 hover:bg-lime-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {submitting ? "Submitting…" : selectedAction ? `Submit (+${selectedAction.points} pts)` : "Submit"}
          </button>
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
  userId: string;
  userGroups: { id: string; name: string; image_url?: string | null }[];
  gps: ReturnType<typeof useGPS>;
  overrideCoords: Coords | null;
  onEnterPinPicker: () => void;
  onClose: () => void;
  onContributionSubmitted?: (lat: number | null, lng: number | null, value: number, photoUrl?: string) => void;
  activeMapStyle?: string;
}) {
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
  const [result, setResult] = useState<"success" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitCoords = overrideCoords ?? gps.coords;
  const canSubmit = !submitting && !!photo && !!submitCoords;

  const handleSubmit = async () => {
    if (!canSubmit || !photo) return;
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
      setResult("success");
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4">
          <span className="text-4xl">🌿</span>
          <p className="text-zinc-100 font-semibold text-center">Photo added to the bloom map!</p>
          <button onClick={onClose} className="mt-2 text-sm text-zinc-400 hover:text-zinc-200">Close</button>
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
            <button onClick={onEnterPinPicker} className="mt-1.5 text-xs text-zinc-500 hover:text-zinc-300 underline">
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
            className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600"
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
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm resize-none focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
        </div>

        {/* Group */}
        {userGroups.length > 0 && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Contributing as</label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => { setSelectedGroupId(null); localStorage.setItem("frontline:contrib:group", "__individual__"); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedGroupId === null ? "bg-zinc-700 border-zinc-500 text-zinc-100" : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}>
                Individual
              </button>
              {userGroups.map((g) => (
                <button key={g.id} type="button" onClick={() => { setSelectedGroupId(g.id); localStorage.setItem("frontline:contrib:group", g.id); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selectedGroupId === g.id ? "bg-lime-900/60 border-lime-600 text-lime-300" : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}>
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
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-sm hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2 rounded-lg bg-lime-700 hover:bg-lime-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {submitting ? "Uploading…" : "Submit (+2 pts)"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {title && (
          <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
            <h2 className="text-zinc-100 font-semibold text-base">{title}</h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">
              ×
            </button>
          </div>
        )}
        <div className={`overflow-y-auto ${title ? "px-5 pb-5" : "p-5"}`}>
          {children}
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
  onContributionSubmitted,
  onLocationCaptured,
  activeMapStyle,
  onStyleChange,
}: ContributionPanelProps) {
  const isSolarpunk = campaignContributionType === "solarpunk_action";

  const gps = useGPS();
  const [mode, setMode] = useState<"contribute" | "report" | "solarpunk_photo" | null>(null);
  const [reportOverrideCoords, setReportOverrideCoords] = useState<Coords | null>(null);
  const prevPinPickerActiveRef = useRef(false);
  const prePinPickerModeRef = useRef<"contribute" | "report" | "solarpunk_photo" | null>(null);

  useEffect(() => {
    gps.capture();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gps.status === "success" && gps.coords) {
      onLocationCaptured?.(gps.coords);
    }
  }, [gps.status, gps.coords, onLocationCaptured]);

  useEffect(() => {
    if (prevPinPickerActiveRef.current && !pinPickerActive) {
      const prevMode = prePinPickerModeRef.current ?? "contribute";
      setMode(prevMode);
      if (prevMode === "report") {
        setReportOverrideCoords(placedPinCoords);
      }
      prePinPickerModeRef.current = null;
    }
    prevPinPickerActiveRef.current = pinPickerActive;
  }, [pinPickerActive, placedPinCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  const openContribute = () => {
    setMode("contribute");
    if (gps.status === "idle") gps.capture();
  };

  const handleEnterPinPickerForContribute = () => {
    if (!gps.coords) return;
    prePinPickerModeRef.current = "contribute";
    setMode(null);
    onEnterPinPicker(gps.coords, !isSolarpunk);
  };

  const handleEnterPinPickerForSolarpunkPhoto = () => {
    const coords = placedPinCoords ?? gps.coords;
    if (!coords) return;
    prePinPickerModeRef.current = "solarpunk_photo";
    setMode(null);
    onEnterPinPicker(coords, false);
  };

  const handleEnterPinPickerForReport = () => {
    const coords = reportOverrideCoords ?? gps.coords;
    if (!coords) return;
    prePinPickerModeRef.current = "report";
    setMode(null);
    onEnterPinPicker(coords, false);
  };

  const showReport = campaignContributionType === "cleanup";
  const btn = PANEL_BUTTON[campaignContributionType] ?? PANEL_BUTTON.cleanup;

  return (
    <>
      {!pinPickerActive && (
        <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2 items-start">
          <button
            onClick={openContribute}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm font-medium backdrop-blur-sm transition-colors shadow-lg"
          >
            {btn.icon} {btn.label}
          </button>
          {isSolarpunk && (
            <button
              onClick={() => { setMode("solarpunk_photo"); if (gps.status === "idle") gps.capture(); }}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 border border-lime-800/60 rounded-lg text-lime-300 text-sm font-medium backdrop-blur-sm transition-colors shadow-lg"
            >
              📸 Spot It
            </button>
          )}
          {showReport && (
            <button
              onClick={() => { setMode("report"); if (gps.status === "idle") gps.capture(); }}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm font-medium backdrop-blur-sm transition-colors shadow-lg"
            >
              ⚠️ Report Trash
            </button>
          )}
          {onStyleChange && (
            <div className="self-start flex gap-0.5 p-1 bg-zinc-900/90 border border-zinc-700/60 rounded-lg backdrop-blur-sm shadow-lg">
              {MAP_STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onStyleChange(s.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeMapStyle === s.id
                      ? "bg-zinc-600 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "contribute" && !pinPickerActive && (
        isSolarpunk ? (
          <SolarpunkActionModal
            campaignId={campaignId}
            userId={userId}
            userGroups={userGroups}
            gps={gps}
            overrideCoords={placedPinCoords}
            onEnterPinPicker={handleEnterPinPickerForContribute}
            onClose={() => setMode(null)}
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
            overrideCoords={placedPinCoords}
            onEnterPinPicker={handleEnterPinPickerForContribute}
            onClose={() => setMode(null)}
            onContributionSubmitted={onContributionSubmitted}
            activeMapStyle={activeMapStyle}
          />
        )
      )}
      {mode === "solarpunk_photo" && !pinPickerActive && (
        <SolarpunkPhotoModal
          campaignId={campaignId}
          userId={userId}
          userGroups={userGroups}
          gps={gps}
          overrideCoords={placedPinCoords}
          onEnterPinPicker={handleEnterPinPickerForSolarpunkPhoto}
          onClose={() => setMode(null)}
          onContributionSubmitted={onContributionSubmitted}
          activeMapStyle={activeMapStyle}
        />
      )}
      {mode === "report" && !pinPickerActive && (
        <ReportModal
          campaignId={campaignId}
          userId={userId}
          gps={gps}
          overrideCoords={reportOverrideCoords}
          onEnterPinPicker={handleEnterPinPickerForReport}
          onClose={() => { setMode(null); setReportOverrideCoords(null); }}
          activeMapStyle={activeMapStyle}
        />
      )}
    </>
  );
}
