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
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        support
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-3 flex items-center gap-2 whitespace-nowrap">
          <span className="text-xs text-zinc-300 select-all">{SUPPORT_EMAIL}</span>
          <button
            onClick={copy}
            className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors border border-zinc-700 hover:border-zinc-500 rounded px-2 py-0.5"
          >
            {copied ? "copied!" : "copy"}
          </button>
        </div>
      )}
    </div>
  );
}
