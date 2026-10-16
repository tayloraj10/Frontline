"use client";

import { useState } from "react";
import Link from "next/link";
import { shareContent } from "@/lib/share";
import QRCodeModal from "@/components/QRCodeModal";
import CampaignInstructionsModal from "@/components/CampaignInstructionsModal";

const TOP = "top-3 sm:top-[calc(var(--map-top,0px)+0.75rem)]";
const ROUND =
  "grid place-items-center w-11 h-11 rounded-full bg-zinc-900/90 backdrop-blur-md shadow-elevation-3 text-zinc-300 hover:text-zinc-100 active:scale-[0.94] transition-[color,transform] duration-150 touch-manipulation";

export function MapBackButton({ href = "/campaigns", hidden }: { href?: string; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <Link href={href} aria-label="Back to campaigns" className={`absolute z-20 left-3 ${TOP} ${ROUND}`}>
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M12.5 4.5L7 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

export function MapOverflowMenu({
  slug,
  title,
  description,
  hidden,
}: {
  slug: string;
  title: string;
  description: string | null;
  typeLabel?: string;
  typeIcon?: string;
  hidden?: boolean;
}) {
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [helpSignal, setHelpSignal] = useState(0);
  const share = async () => {
    try {
      const r = await shareContent({ title, text: description ?? undefined });
      if (r === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <>
      <CampaignInstructionsModal slug={slug} description={description} hideTriggers helpSignal={helpSignal} />
      {!hidden && (
        <>
          <button type="button" onClick={() => setHelpSignal((n) => n + 1)} aria-label="How does the map work?" className={`absolute z-20 right-[6.75rem] sm:right-auto sm:left-[24rem] ${TOP} ${ROUND} font-display text-base font-extrabold`}>
            ?
          </button>
          <button type="button" onClick={share} aria-label="Share" className={`absolute z-20 right-[3.75rem] sm:right-auto sm:left-[27rem] ${TOP} ${ROUND}`}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 15V3" />
              <path d="m7 8 5-5 5 5" />
              <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
            </svg>
          </button>
          <button type="button" onClick={() => setQr(true)} aria-label="QR code" className={`absolute z-20 right-3 sm:right-auto sm:left-[30rem] ${TOP} ${ROUND}`}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4" />
            </svg>
          </button>
        </>
      )}
      {copied && (
        <div className="absolute z-30 left-1/2 -translate-x-1/2 top-16 px-3 py-1.5 rounded-full bg-zinc-900 shadow-elevation-3 text-xs text-zinc-200">
          Link copied
        </div>
      )}
      {qr && <QRCodeModal url={typeof window !== "undefined" ? window.location.href : ""} title={title} onClose={() => setQr(false)} />}
    </>
  );
}
