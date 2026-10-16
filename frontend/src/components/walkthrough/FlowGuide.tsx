"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Walkthrough from "./Walkthrough";
import { claimAutoOpen, hasSeen, markSeen, releaseAutoOpen } from "./autoOpen";
import { WALKTHROUGHS, type WalkthroughId } from "@/walkthroughs";

/**
 * Drop-in guide for one flow: renders the "?" trigger and the walkthrough dialog.
 * - `autoOpen` shows it once on first visit (never alongside another auto-opening guide).
 * - `openSignal` lets a parent open it from its own menu (bump the number).
 * - Always reopenable from the trigger.
 */
export default function FlowGuide({
  id,
  autoOpen = false,
  variant = "icon",
  label,
  hideTrigger = false,
  openSignal = 0,
  className = "",
  size = "sm",
  roles = [],
}: {
  id: WalkthroughId;
  autoOpen?: boolean;
  /** "icon" is a round "?" button; "link" is a text button with `label`. */
  variant?: "icon" | "link";
  label?: string;
  hideTrigger?: boolean;
  openSignal?: number;
  className?: string;
  /** "md" matches the 44px share buttons (icon variant only). */
  size?: "sm" | "md";
  /** Roles the viewer holds. Steps tagged with a role not listed here are hidden. */
  roles?: string[];
}) {
  const base = WALKTHROUGHS[id];
  const roleKey = roles.join(",");
  const def = useMemo(
    () => ({ ...base, steps: base.steps.filter((s) => !s.role || roleKey.split(",").includes(s.role)) }),
    [base, roleKey],
  );
  const [open, setOpen] = useState(false);
  const heldAuto = useRef(false);

  useEffect(() => {
    if (!autoOpen || hasSeen(id)) return;
    if (claimAutoOpen()) {
      heldAuto.current = true;
      setOpen(true);
    }
  }, [autoOpen, id]);

  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

  // If the component unmounts while holding the auto-open slot, free it.
  useEffect(
    () => () => {
      if (heldAuto.current) {
        heldAuto.current = false;
        releaseAutoOpen();
      }
    },
    [],
  );

  function close() {
    markSeen(id);
    if (heldAuto.current) {
      heldAuto.current = false;
      releaseAutoOpen();
    }
    setOpen(false);
  }

  return (
    <>
      {!hideTrigger &&
        (variant === "icon" ? (
          <button
            onClick={() => setOpen(true)}
            title={label ?? "How this works"}
            aria-label={label ?? "How this works"}
            className={`${
              size === "md"
                ? "w-11 h-11 text-lg border-emerald-500/30 bg-zinc-800/70 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 hover:border-emerald-500/50 active:text-emerald-300 active:bg-emerald-500/10"
                : "w-7 h-7 text-xs border-zinc-700/60 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 active:text-zinc-200 active:bg-zinc-800"
            } flex items-center justify-center font-bold rounded-full border active:scale-[0.92] transition-[background-color,border-color,color,transform] duration-150 touch-manipulation shrink-0 ${className}`}
          >
            ?
          </button>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className={`inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full text-xs font-semibold text-zinc-300 bg-zinc-800/60 ring-1 ring-white/10 hover:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation ${className}`}
          >
            <span aria-hidden="true" className="font-bold text-zinc-400">?</span>
            {label ?? "How this works"}
          </button>
        ))}
      {open && <Walkthrough def={def} onClose={close} />}
    </>
  );
}
