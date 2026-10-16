"use client";

import { useEffect, useRef, useState } from "react";
import Walkthrough from "@/components/walkthrough/Walkthrough";
import { claimAutoOpen, releaseAutoOpen } from "@/components/walkthrough/autoOpen";
import { WALKTHROUGHS } from "@/walkthroughs";

// Same key the old onboarding modal used, so people who already saw it are not shown the tour again.
const STORAGE_KEY = "frontline_onboarded";

/** First-visit welcome tour for signed-in users on /campaigns, reopenable from a "Welcome tour" link. */
export default function WelcomeTour() {
  const [open, setOpen] = useState(false);
  const heldAuto = useRef(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = !!localStorage.getItem(STORAGE_KEY);
    } catch {
      /* blocked storage: do not nag on every load */
    }
    if (!seen && claimAutoOpen()) {
      heldAuto.current = true;
      setOpen(true);
    }
    return () => {
      if (heldAuto.current) {
        heldAuto.current = false;
        releaseAutoOpen();
      }
    };
  }, []);

  function close() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    if (heldAuto.current) {
      heldAuto.current = false;
      releaseAutoOpen();
    }
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full text-xs font-semibold text-zinc-300 bg-zinc-800/60 ring-1 ring-white/10 hover:bg-zinc-800 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
      >
        Welcome tour
      </button>
      {open && <Walkthrough def={WALKTHROUGHS.welcome} onClose={close} />}
    </>
  );
}
