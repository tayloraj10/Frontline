import { isNativePlatform } from "@/lib/capacitor";

export type ShareContent = {
  title: string;
  text?: string;
  url?: string;
};

// Only the clipboard-fallback path needs an explicit "copied!" confirmation —
// the native share sheet and the Web Share API both show their own UI already.
export async function shareContent({ title, text, url }: ShareContent): Promise<"shared" | "copied"> {
  const shareUrl = url ?? window.location.href;

  if (isNativePlatform()) {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, text, url: shareUrl });
    return "shared";
  }
  if (navigator.share) {
    await navigator.share({ title, text, url: shareUrl });
    return "shared";
  }
  await navigator.clipboard.writeText(shareUrl);
  return "copied";
}

export async function shareImage(
  blob: Blob,
  filename: string,
  { title, text }: { title: string; text?: string }
): Promise<"shared" | "downloaded"> {
  if (isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const base64 = await blobToBase64(blob);
    const written = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    await Share.share({ title, text, files: [written.uri] });
    return "shared";
  }

  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title, text, files: [file] });
    return "shared";
  }

  downloadBlob(blob, filename);
  return "downloaded";
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports as "MacIntel" in the UA string, so touch support is the tiebreaker.
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Like shareImage, but prefers a direct file download when the platform actually
 * supports one — desktop and Android browsers download via <a download> as normal.
 * iOS (Safari, in-app browsers, and the native app's WKWebView) all silently ignore
 * that attribute for blob: URLs, so there we fall back to the native share sheet
 * (e.g. "Save Image") instead of a button that appears to do nothing.
 */
export async function downloadImage(
  blob: Blob,
  filename: string,
  shareOpts: { title: string; text?: string }
): Promise<"shared" | "downloaded"> {
  if (isNativePlatform() || isIOS()) {
    return shareImage(blob, filename, shareOpts);
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
