"use client";

import { useState, useRef, useEffect } from "react";

const SUPPORT_EMAIL = "frontlinemapsapp@gmail.com";

export default function SupportButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function copy() {
    navigator.clipboard.writeText(SUPPORT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Contact support"
        className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 min-h-9 sm:min-h-0 rounded-lg border border-zinc-700/60 bg-zinc-800/40 hover:bg-zinc-800 hover:border-zinc-600 active:bg-zinc-800 active:border-zinc-600 active:scale-[0.97] text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-[background-color,border-color,color,transform] duration-150 text-xs font-medium touch-manipulation"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.5 6C6.5 5.17 7.17 4.5 8 4.5s1.5.67 1.5 1.5c0 .67-.4 1.25-1 1.5L8 7.75V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11" r="0.75" fill="currentColor" />
        </svg>
        <span className="hidden sm:inline">Support</span>
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 w-[260px] max-w-[calc(100vw-1.5rem)]">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">Contact Support</p>
          <p className="text-xs text-zinc-300 select-all break-all mb-2">{SUPPORT_EMAIL}</p>
          <button
            onClick={copy}
            className={`w-full text-xs border rounded px-2 py-1 transition-[border-color,color,transform] duration-150 active:scale-[0.97] touch-manipulation ${
              copied
                ? "border-emerald-700 text-emerald-400"
                : "border-zinc-700 text-zinc-500 hover:text-zinc-200 hover:border-zinc-500 active:text-zinc-200 active:border-zinc-500"
            }`}
          >
            {copied ? "copied!" : "copy"}
          </button>
        </div>
      )}
    </div>
  );
}
