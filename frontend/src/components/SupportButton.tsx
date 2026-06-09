"use client";

import { useState, useRef, useEffect } from "react";

const SUPPORT_EMAIL = "collectiveactionsupport@gmail.com";

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
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-700/60 bg-zinc-800/40 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-zinc-200 transition-colors text-xs font-medium"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.5 6C6.5 5.17 7.17 4.5 8 4.5s1.5.67 1.5 1.5c0 .67-.4 1.25-1 1.5L8 7.75V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11" r="0.75" fill="currentColor" />
        </svg>
        Support
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 min-w-[220px]">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">Contact Support</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-300 select-all flex-1 truncate">{SUPPORT_EMAIL}</span>
            <button
              onClick={copy}
              className={`text-xs shrink-0 border rounded px-2 py-0.5 transition-colors ${
                copied
                  ? "border-emerald-700 text-emerald-400"
                  : "border-zinc-700 text-zinc-500 hover:text-zinc-200 hover:border-zinc-500"
              }`}
            >
              {copied ? "copied!" : "copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
