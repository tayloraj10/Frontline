"use client";

import { useState } from "react";
import { shareContent, type ShareContent } from "@/lib/share";
import QRCodeModal from "@/components/QRCodeModal";

const ShareGlyph = () => (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
    <path
      d="M8 1.5v8M8 1.5 5 4.5M8 1.5l3 3"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3.5 8v5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const QRGlyph = () => (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
    <rect x="1.5" y="1.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" />
    <rect x="9.5" y="1.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" />
    <rect x="1.5" y="9.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.4" />
    <rect x="9.5" y="9.5" width="1.8" height="1.8" fill="currentColor" />
    <rect x="12.7" y="9.5" width="1.8" height="1.8" fill="currentColor" />
    <rect x="9.5" y="12.7" width="1.8" height="1.8" fill="currentColor" />
    <rect x="12.7" y="12.7" width="1.8" height="1.8" fill="currentColor" />
  </svg>
);

export default function ShareButton({
  content,
  variant = "text",
  size = "md",
  className = "",
  showQr = true,
}: {
  content: ShareContent;
  variant?: "text" | "icon";
  /** Icon variant only — "sm" (36px) for dense contexts like cards, "md" (44px, the touch-target floor) elsewhere. */
  size?: "sm" | "md";
  className?: string;
  /** Show an adjacent "show QR code" trigger alongside the share action. */
  showQr?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  // content.url may be a relative path (e.g. from a list card linking to one of its
  // items) rather than the current page's own URL — resolve it to absolute so the
  // QR code and share sheet both get a scannable/shareable link either way.
  const resolvedUrl =
    typeof window === "undefined"
      ? content.url ?? ""
      : content.url
        ? new URL(content.url, window.location.origin).toString()
        : window.location.href;

  async function handleShare() {
    try {
      const result = await shareContent({ ...content, url: resolvedUrl });
      if (result === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // User cancelled the share sheet — not an error.
    }
  }

  const qrModal =
    showQr && qrOpen ? (
      <QRCodeModal url={resolvedUrl} title={content.title} onClose={() => setQrOpen(false)} />
    ) : null;

  if (variant === "icon") {
    const dim = size === "sm" ? "w-9 h-9" : "w-11 h-11";
    const gap = size === "sm" ? "gap-1.5" : "gap-2";
    return (
      <>
        <div className={`inline-flex items-center ${gap} ${className}`}>
          <button
            onClick={handleShare}
            title={copied ? "Link copied!" : "Share"}
            className={`${dim} flex items-center justify-center rounded-full border border-sky-800/60 bg-sky-950/30 text-sky-400 hover:text-sky-300 hover:bg-sky-950/50 hover:border-sky-700 active:text-sky-300 active:bg-sky-950/50 active:border-sky-700 active:scale-[0.9] transition-[background-color,border-color,color,transform] duration-150 shrink-0 touch-manipulation`}
          >
            <ShareGlyph />
          </button>
          {showQr && (
            <button
              onClick={() => setQrOpen(true)}
              title="Show QR code"
              className={`${dim} flex items-center justify-center rounded-full border border-violet-800/60 bg-violet-950/30 text-violet-400 hover:text-violet-300 hover:bg-violet-950/50 hover:border-violet-700 active:text-violet-300 active:bg-violet-950/50 active:border-violet-700 active:scale-[0.9] transition-[background-color,border-color,color,transform] duration-150 shrink-0 touch-manipulation`}
            >
              <QRGlyph />
            </button>
          )}
        </div>
        {qrModal}
      </>
    );
  }

  return (
    <>
      <div className={`inline-flex items-center gap-3 ${className}`}>
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150"
        >
          <ShareGlyph />
          {copied ? "Link copied!" : "Share"}
        </button>
        {showQr && (
          <button
            onClick={() => setQrOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150"
          >
            <QRGlyph />
            QR code
          </button>
        )}
      </div>
      {qrModal}
    </>
  );
}
