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
