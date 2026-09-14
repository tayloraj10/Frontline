"use client";

import { useEffect, useCallback, useRef, useState, type ReactNode } from "react";
import IconButton from "@/components/ui/IconButton";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export default function Lightbox({
  images,
  index,
  onClose,
  onNavigate,
  renderActions,
}: {
  images: string[];
  index: number;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
  renderActions?: (currentUrl: string, index: number) => ReactNode;
}) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const zoomed = scale > 1.01;

  // Pinch/drag bookkeeping lives in refs so pointer handlers don't need to re-bind on every render.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lastTapRef = useRef(0);

  const resetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Reset zoom whenever the viewed image changes (or the lightbox closes/reopens). Adjusting
  // state during render (rather than in an effect) avoids an extra post-mount render pass.
  const [prevIndex, setPrevIndex] = useState(index);
  if (index !== prevIndex) {
    setPrevIndex(index);
    if (scale !== 1) setScale(1);
    if (pan.x !== 0 || pan.y !== 0) setPan({ x: 0, y: 0 });
  }

  const goPrev = useCallback(() => {
    onNavigate((index - 1 + images.length) % images.length);
  }, [index, images.length, onNavigate]);

  const goNext = useCallback(() => {
    onNavigate((index + 1) % images.length);
  }, [index, images.length, onNavigate]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && images.length > 1 && !zoomed) goPrev();
      if (e.key === "ArrowRight" && images.length > 1 && !zoomed) goNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goPrev, goNext, images.length, zoomed]);

  const current = images[index];

  const toggleZoom = useCallback(
    (clientX: number, clientY: number, target: HTMLElement) => {
      if (zoomed) {
        resetZoom();
        return;
      }
      const rect = target.getBoundingClientRect();
      const originX = clientX - (rect.left + rect.width / 2);
      const originY = clientY - (rect.top + rect.height / 2);
      setScale(DOUBLE_TAP_SCALE);
      setPan({ x: -originX * (DOUBLE_TAP_SCALE - 1), y: -originY * (DOUBLE_TAP_SCALE - 1) });
    },
    [zoomed, resetZoom]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLImageElement>) => {
      e.preventDefault();
      const next = clampScale(scale - e.deltaY * 0.0025 * scale);
      setScale(next);
      if (next <= 1.01) setPan({ x: 0, y: 0 });
    },
    [scale]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      e.stopPropagation();
      toggleZoom(e.clientX, e.clientY, e.currentTarget);
    },
    [toggleZoom]
  );

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    setIsInteracting(true);
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStartDist.current = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartScale.current = scale;
      dragStart.current = null;
    } else if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };

      // Manual double-tap detection for touch (dblclick doesn't fire reliably on mobile).
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        toggleZoom(e.clientX, e.clientY, e.currentTarget);
      }
      lastTapRef.current = now;
    }
  }, [scale, pan, toggleZoom]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2 && pinchStartDist.current) {
        const [a, b] = Array.from(pointers.current.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const next = clampScale(pinchStartScale.current * (dist / pinchStartDist.current));
        setScale(next);
        if (next <= 1.01) setPan({ x: 0, y: 0 });
        return;
      }

      if (pointers.current.size === 1 && dragStart.current && scale > 1.01) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
      }
    },
    [scale]
  );

  const endPointer = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStartDist.current = null;
    if (pointers.current.size === 0) {
      dragStart.current = null;
      setIsInteracting(false);
    }
  }, []);

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

      {images.length > 1 && !zoomed && (
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

      <div
        className="flex flex-col items-center gap-3 max-h-[90vh] max-w-[90vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current}
          alt=""
          draggable={false}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={endPointer}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transition: isInteracting ? "none" : "transform 150ms ease-out",
            touchAction: "none",
            cursor: zoomed ? "grab" : "zoom-in",
          }}
          className="block max-h-[78vh] max-w-[90vw] object-contain rounded-lg select-none"
        />
        {renderActions && !zoomed && <div className="flex justify-center">{renderActions(current, index)}</div>}
        {images.length > 1 && !zoomed && (
          <div className="text-zinc-400 text-sm tabular-nums">
            {index + 1} / {images.length}
          </div>
        )}
      </div>

      {images.length > 1 && !zoomed && (
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
    </div>
  );
}
