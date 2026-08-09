"use client";

import { useEffect, useCallback } from "react";
import IconButton from "@/components/ui/IconButton";

export default function Lightbox({
  images,
  index,
  onClose,
  onNavigate,
}: {
  images: string[];
  index: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const goPrev = useCallback(() => {
    onNavigate((index - 1 + images.length) % images.length);
  }, [index, images.length, onNavigate]);

  const goNext = useCallback(() => {
    onNavigate((index + 1) % images.length);
  }, [index, images.length, onNavigate]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && images.length > 1) goPrev();
      if (e.key === "ArrowRight" && images.length > 1) goNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goPrev, goNext, images.length]);

  const current = images[index];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <IconButton
        onClick={onClose}
        className="absolute top-3 right-3 text-zinc-300 hover:text-white active:text-white text-2xl leading-none bg-black/40 hover:bg-black/60 active:bg-black/60 active:scale-[0.92] transition-[background-color,color,transform] duration-150"
        aria-label="Close"
      >
        &times;
      </IconButton>

      {images.length > 1 && (
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-white active:text-white text-3xl leading-none bg-black/40 hover:bg-black/60 active:bg-black/60 active:scale-[0.92] transition-[background-color,color,transform] duration-150"
          aria-label="Previous image"
        >
          &#8249;
        </IconButton>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current}
        alt=""
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-white active:text-white text-3xl leading-none bg-black/40 hover:bg-black/60 active:bg-black/60 active:scale-[0.92] transition-[background-color,color,transform] duration-150"
          aria-label="Next image"
        >
          &#8250;
        </IconButton>
      )}

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-zinc-400 text-sm tabular-nums">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
