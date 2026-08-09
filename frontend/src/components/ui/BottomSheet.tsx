"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate as animateValue, type PanInfo } from "framer-motion";

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
 * Bottom sheet with real drag/snap physics via framer-motion. Tap the handle to
 * toggle peek/expanded, or drag it. Modeled after this app's existing
 * mobile-anchored map panels (bottom-28 left-2 right-2 cards).
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
  const [prevOpen, setPrevOpen] = useState(open);
  const [maxT, setMaxT] = useState(0);
  const y = useMotionValue(0);

  // Reset the expanded flag when `open` flips false, computed during render
  // (React's recommended replacement for a setState-in-effect on a prop change)
  // rather than inside an effect.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setExpanded(false);
  }

  // Tracks the sheet's peek->expanded drag distance so `dragConstraints` never
  // has to read `sheetRef.current` during render.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const update = () => setMaxT(Math.max(el.offsetHeight - peekHeight, 0));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [peekHeight]);

  // Drives the sheet's y position for every state transition (open/close and
  // peek/expand) through the same spring, including live drag updates from
  // framer-motion's own drag handling on the bound `y` motion value.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const target = !open ? el.offsetHeight + 40 : expanded ? 0 : maxT;
    const controls = animateValue(y, target, { type: "spring", stiffness: 420, damping: 42 });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expanded, maxT, expandedHeight]);

  function handleDragEnd(_event: unknown, info: PanInfo) {
    const max = maxT;
    const current = y.get();
    if (onClose && current > max + 40) {
      onClose();
      return;
    }
    if (info.velocity.y > 500) {
      setExpanded(false);
      return;
    }
    if (info.velocity.y < -500) {
      setExpanded(true);
      return;
    }
    setExpanded(current < max / 2);
  }

  return (
    <motion.div
      ref={sheetRef}
      drag={open ? "y" : false}
      dragElastic={0.15}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      dragConstraints={{ top: 0, bottom: maxT + 80 }}
      style={{ y, height: expandedHeight }}
      className={`fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-zinc-800 bg-zinc-900 shadow-elevation-4 pb-safe flex flex-col touch-none ${
        open ? "" : "pointer-events-none"
      } ${className}`}
      aria-hidden={!open}
    >
      <div className="shrink-0 flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing">
        <button
          type="button"
          aria-label={expanded ? "Collapse sheet" : "Expand sheet"}
          onClick={() => setExpanded((v) => !v)}
          className="w-10 h-1.5 rounded-full bg-zinc-700 active:bg-zinc-600 transition-colors"
        />
        {header && <div className="w-full px-4 pt-2">{header}</div>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">{children}</div>
    </motion.div>
  );
}
