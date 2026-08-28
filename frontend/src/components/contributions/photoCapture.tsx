"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "@capacitor/camera";
import type { MediaResult } from "@capacitor/camera";
import { Filesystem } from "@capacitor/filesystem";
import { isNativePlatform } from "@/lib/capacitor";

// Native camera/gallery results come back as a native file uri (and a
// capacitor://localhost webPath alias of it), but uploadToR2 needs a real
// File. This used to fetch() the webPath, which works fine while the WebView's
// own page is served from a local/dev origin, but in production the page
// loads from the real https://www.frontlinemaps.com origin, and WKWebView's
// mixed-content policy blocks an HTTPS page from fetching a non-https
// capacitor:// resource, silently breaking photo capture in TestFlight/App
// Store builds only. Filesystem.readFile reads the bytes through the native
// plugin bridge instead of a WebView network request, so it isn't subject to
// that same-origin/mixed-content policy at all.
export async function mediaResultToFile(result: MediaResult, index = 0): Promise<File> {
  const path = result.uri ?? result.webPath;
  if (!path) throw new Error("Photo capture returned no file");
  const format = result.metadata?.format?.toLowerCase();
  const ext = format === "png" ? "png" : "jpg";
  const type = ext === "png" ? "image/png" : "image/jpeg";
  const { data } = await Filesystem.readFile({ path });
  const base64 = typeof data === "string" ? data : await data.text();
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new File([buffer], `photo-${Date.now()}-${index}.${ext}`, { type });
}

export function CameraModal({
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
      ? "Camera not supported on this browser, use gallery instead."
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
          videoRef.current.play().catch(() => { });
        }
        setReady(true);
      })
      .catch(() => setError("Camera unavailable, check permissions or use gallery instead."));
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

// Capacitor rejects with this exact message (iOS and Android both use it) when the user
// dismisses the native camera/gallery sheet without picking anything. Every other
// rejection (permission denial, webPath→Blob conversion failure, etc.) is a real error
// that must not be swallowed the same way, or a photo can silently fail to appear with
// no feedback at all.
function isUserCancellation(err: unknown): boolean {
  return err instanceof Error && err.message === "User cancelled photos app";
}

export function PhotoCaptureInput({
  multiple,
  onFilesSelected,
}: {
  multiple: boolean;
  onFilesSelected: (files: File[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // On native iOS/Android, use the Capacitor plugin for a real native camera
  // and gallery picker. The getUserMedia/<input type=file> paths below are
  // web-only fallbacks (WKWebView doesn't support getUserMedia, and routing
  // through the plain file input's "Take Photo" action sheet option crashed
  // the app before NSCameraUsageDescription was added to Info.plist).
  const handleTakePhoto = async () => {
    if (!isNativePlatform()) {
      setShowCamera(true);
      return;
    }
    setCaptureError(null);
    try {
      const result = await Camera.takePhoto({ quality: 90 });
      onFilesSelected([await mediaResultToFile(result)]);
    } catch (err) {
      if (!isUserCancellation(err)) {
        console.error("Camera.takePhoto failed", err);
        setCaptureError("Couldn't add that photo, please try again.");
      }
    }
  };

  const handleChooseFromGallery = async () => {
    if (!isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }
    setCaptureError(null);
    try {
      const { results } = await Camera.chooseFromGallery({
        allowMultipleSelection: multiple,
        limit: multiple ? 0 : 1,
      });
      const files = await Promise.all(results.map((r, i) => mediaResultToFile(r, i)));
      if (files.length) onFilesSelected(files);
    } catch (err) {
      if (!isUserCancellation(err)) {
        console.error("Camera.chooseFromGallery failed", err);
        setCaptureError("Couldn't add that photo, please try again.");
      }
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
      {captureError && <p className="text-red-400 text-xs mt-1.5">{captureError}</p>}
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
