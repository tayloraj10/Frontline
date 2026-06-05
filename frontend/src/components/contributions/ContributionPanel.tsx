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

interface ContributionPanelProps {
  campaignId: string;
  campaignContributionType: string;
  userId: string;
  userGroups?: { id: string; name: string }[];
  onEnterPinPicker: (coords: Coords, constrained?: boolean) => void;
  pinPickerActive: boolean;
  placedPinCoords: Coords | null;
  onContributionSubmitted?: (lat: number, lng: number, value: number) => void;
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

    // First attempt: high accuracy, 12s timeout
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setStatus("success");
      },
      (err) => {
        if (err.code === 3) {
          // Timeout — retry once with network-based location (faster)
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
  userGroups: { id: string; name: string }[];
  gps: ReturnType<typeof useGPS>;
  overrideCoords: Coords | null;
  onEnterPinPicker: () => void;
  onClose: () => void;
  onContributionSubmitted?: (lat: number, lng: number, value: number) => void;
  activeMapStyle?: string;
}) {
  const [bagCount, setBagCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "outside" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitCoords = overrideCoords ?? gps.coords;

  const handleSubmit = async () => {
    if (!submitCoords) return;
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
            contribution_type: "cleanup",
            value: bagCount,
            photo_url: photoUrl,
            latitude: submitCoords.latitude,
            longitude: submitCoords.longitude,
            notes: notes || null,
          }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { claimed_territory: boolean };
      onContributionSubmitted?.(submitCoords.latitude, submitCoords.longitude, bagCount);
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
          <span className="text-4xl">{result === "success" ? "🎉" : "✅"}</span>
          <p className="text-zinc-100 font-semibold text-center">
            {result === "success"
              ? "Cleanup logged! Territory updated."
              : "Cleanup logged! Location was outside the campaign area."}
          </p>
          <button onClick={onClose} className="mt-2 text-sm text-zinc-400 hover:text-zinc-200">
            Close
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Log Cleanup" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs text-zinc-500 mb-1.5">Your location</p>
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

        {submitCoords && (
          <MiniMapPreview lat={submitCoords.latitude} lng={submitCoords.longitude} styleId={activeMapStyle} />
        )}

        {userGroups.length > 0 && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Contributing as</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedGroupId(null)}
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
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedGroupId === g.id
                      ? "bg-emerald-900/60 border-emerald-600 text-emerald-300"
                      : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

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

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Photo (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-xs hover:file:bg-zinc-600"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Found a mattress near the park entrance"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm resize-none focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
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
            disabled={!submitCoords || submitting}
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
            reported_by: userId,
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
            Report submitted! If enough reports come in, a Boss Event will spawn.
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
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-5">
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-zinc-100 font-semibold text-base">{title}</h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">
              ×
            </button>
          </div>
        )}
        {children}
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
  const gps = useGPS();
  const [mode, setMode] = useState<"contribute" | "report" | null>(null);
  const [reportOverrideCoords, setReportOverrideCoords] = useState<Coords | null>(null);
  const prevPinPickerActiveRef = useRef(false);
  const prePinPickerModeRef = useRef<"contribute" | "report" | null>(null);

  // Start GPS immediately so the map pin and modal coords are ready before user taps a button
  useEffect(() => {
    gps.capture();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent when GPS is captured so map can drop a location pin
  useEffect(() => {
    if (gps.status === "success" && gps.coords) {
      onLocationCaptured?.(gps.coords);
    }
  }, [gps.status, gps.coords, onLocationCaptured]);

  // When pin picker closes, reopen the modal that triggered it and route coords
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
  }, [pinPickerActive, placedPinCoords]);

  const openContribute = () => {
    setMode("contribute");
    if (gps.status === "idle") gps.capture();
  };

  const handleEnterPinPickerForCleanup = () => {
    if (!gps.coords) return;
    prePinPickerModeRef.current = "contribute";
    setMode(null);
    onEnterPinPicker(gps.coords, true);
  };

  const handleEnterPinPickerForReport = () => {
    const coords = reportOverrideCoords ?? gps.coords;
    if (!coords) return;
    prePinPickerModeRef.current = "report";
    setMode(null);
    onEnterPinPicker(coords, false); // unconstrained — trash can be anywhere
  };

  const showReport = campaignContributionType === "cleanup";

  return (
    <>
      {!pinPickerActive && (
        <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2 items-start">
          <button
            onClick={openContribute}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 text-sm font-medium backdrop-blur-sm transition-colors shadow-lg"
          >
            🗑️ Log Cleanup
          </button>
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
        <ContributeModal
          campaignId={campaignId}
          userId={userId}
          userGroups={userGroups}
          gps={gps}
          overrideCoords={placedPinCoords}
          onEnterPinPicker={handleEnterPinPickerForCleanup}
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
