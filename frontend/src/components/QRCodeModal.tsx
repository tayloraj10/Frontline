"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function QRCodeModal({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QRCode) =>
      QRCode.toDataURL(url, { margin: 1, width: 280, color: { dark: "#18181b", light: "#ffffff" } }).then((d) => {
        if (!cancelled) setDataUrl(d);
      })
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-xs flex flex-col bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 text-center">
          <h2 className="text-sm font-black text-zinc-100 tracking-tight mb-4">{title}</h2>
          <div className="w-full aspect-square flex items-center justify-center bg-white rounded-xl p-3">
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dataUrl} alt={`QR code for ${title}`} className="w-full h-full" />
            ) : (
              <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
            )}
          </div>
          <p className="mt-4 text-[11px] text-zinc-500 break-all leading-relaxed">{url}</p>
        </div>
        <div className="px-6 pb-5 flex gap-2">
          <button
            onClick={copyLink}
            className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-700 active:scale-[0.97] text-zinc-200 text-sm font-semibold rounded-xl transition-[background-color,transform] duration-150 touch-manipulation"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-500 active:scale-[0.97] text-white text-sm font-semibold rounded-xl transition-[background-color,transform] duration-150 touch-manipulation"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
