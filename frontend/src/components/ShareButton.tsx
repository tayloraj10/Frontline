"use client";

import { useState } from "react";
import { shareContent, type ShareContent } from "@/lib/share";

const ShareGlyph = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
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

export default function ShareButton({
  content,
  variant = "text",
  className = "",
}: {
  content: ShareContent;
  variant?: "text" | "icon";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    try {
      const result = await shareContent(content);
      if (result === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // User cancelled the share sheet — not an error.
    }
  }

  if (variant === "icon") {
    return (
      <button
        onClick={handleShare}
        title={copied ? "Link copied!" : "Share"}
        className={`w-7 h-7 flex items-center justify-center rounded-full border border-zinc-700/60 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 transition-colors shrink-0 ${className}`}
      >
        <ShareGlyph />
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className={`inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors ${className}`}
    >
      <ShareGlyph />
      {copied ? "Link copied!" : "Share"}
    </button>
  );
}
