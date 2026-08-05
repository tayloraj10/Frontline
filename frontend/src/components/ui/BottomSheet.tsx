"use client";

import { useEffect, useRef, useState } from "react";

interface BottomSheetProps {
  /** Whether the sheet is shown at all. When false, the sheet is fully hidden off-screen. */
  open: boolean;
  /** Called when the user drags the sheet down past the peek state (treat as a dismiss request). */
  onClose?: () => void;
  /** Height (px) of content visible in the collapsed "peek" state. Default 160. */
  peekHeight?: number;
  /** CSS height of the sheet in its "expanded" state. Default "75dvh". */
  expandedHeight?: string;
  /** Rendered above the drag handle divider, e.g. a title. Optional. */
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Minimal, dependency-free bottom sheet: tap the handle to toggle peek/expanded,
 * or drag it. Modeled after this app's existing mobile-anchored map panels
 * (bottom-28 left-2 right-2 cards) but with real drag/snap behavior.
 */
export default function BottomSheet({
  open,
  onClose,
  peekHeight = 160,
  expandedHeight = "75dvh",
  header,
  children,
  className = "",
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{ startY: number; startTranslate: number; maxTranslate: number } | null>(null);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  function currentMaxTranslate() {
    const el = sheetRef.current;
    if (!el) return 0;
    return Math.max(el.offsetHeight - peekHeight, 0);
  }

  function setTranslate(px: number) {
    const el = sheetRef.current;
    if (el) el.style.transform = `translateY(${px}px)`;
  }

  function handlePointerDown(e: React.PointerEvent) {
    const maxTranslate = currentMaxTranslate();
    dragState.current = {
      startY: e.clientY,
      startTranslate: expanded ? 0 : maxTranslate,
      maxTranslate,
    };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const delta = e.clientY - drag.startY;
    const next = Math.min(Math.max(drag.startTranslate + delta, 0), drag.maxTranslate + 80);
    setTranslate(next);
  }

  function handlePointerUp(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const delta = e.clientY - drag.startY;
    const finalTranslate = Math.min(Math.max(drag.startTranslate + delta, 0), drag.maxTranslate + 80);

    if (onClose && finalTranslate > drag.maxTranslate + 40) {
      onClose();
    } else if (finalTranslate > drag.maxTranslate / 2) {
      setExpanded(false);
      setTranslate(drag.maxTranslate);
    } else {
      setExpanded(true);
      setTranslate(0);
    }
    dragState.current = null;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const translateY = expanded ? 0 : currentMaxTranslate();

  return (
    <div
      ref={sheetRef}
      className={`fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-zinc-800 bg-zinc-900 shadow-2xl ease-out pb-safe flex flex-col ${
        isDragging ? "" : "transition-transform duration-200"
      } ${open ? "" : "pointer-events-none"} ${className}`}
      style={{
        height: expandedHeight,
        transform: open ? `translateY(${translateY}px)` : "translateY(100%)",
      }}
      aria-hidden={!open}
    >
      <div
        className="shrink-0 flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-10 h-1.5 rounded-full bg-zinc-700" />
        {header && <div className="w-full px-4 pt-2">{header}</div>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  );
}
