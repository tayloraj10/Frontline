"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { shareContent } from "@/lib/share";
import { useClickOutside } from "@/hooks/useClickOutside";
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
  typeLabel,
  typeIcon,
  hidden,
}: {
  slug: string;
  title: string;
  description: string | null;
  typeLabel?: string;
  typeIcon?: string;
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [helpSignal, setHelpSignal] = useState(0);
  const [infoSignal, setInfoSignal] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const share = async () => {
    setOpen(false);
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

  const item =
    "flex w-full items-center gap-3 min-h-11 px-4 text-sm text-left text-zinc-300 hover:bg-zinc-800 active:bg-zinc-800 hover:text-zinc-100 transition-colors touch-manipulation";

  return (
    <>
      <CampaignInstructionsModal slug={slug} description={description} hideTriggers helpSignal={helpSignal} infoSignal={infoSignal} />
      {!hidden && (
        <div ref={ref} className={`absolute z-20 right-3 ${TOP}`}>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Campaign menu" aria-expanded={open} className={ROUND}>
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <circle cx="4.5" cy="10" r="1.6" />
              <circle cx="10" cy="10" r="1.6" />
              <circle cx="15.5" cy="10" r="1.6" />
            </svg>
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-60 rounded-[20px] bg-zinc-900 shadow-elevation-4 py-2 origin-top-right">
              <div className="px-4 pb-2 pt-1">
                <p className="font-display font-extrabold tracking-tight text-zinc-100 truncate">{title}</p>
                {typeLabel && (
                  <p className="text-xs text-zinc-500">
                    {typeIcon} {typeLabel}
                  </p>
                )}
              </div>
              <div className="border-t border-zinc-800 my-1" />
              <button className={item} onClick={share}>Share</button>
              <button className={item} onClick={() => { setOpen(false); setQr(true); }}>QR code</button>
              <button className={item} onClick={() => { setOpen(false); setHelpSignal((n) => n + 1); }}>How it works</button>
              {description && (
                <button className={item} onClick={() => { setOpen(false); setInfoSignal((n) => n + 1); }}>About this campaign</button>
              )}
            </div>
          )}
        </div>
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
