"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import TermsContent from "./TermsContent";
import PrivacyContent from "./PrivacyContent";
import HowPointsContent from "./HowPointsContent";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  formatLegalVersion,
} from "@/lib/legal";

type Doc = "points" | "terms" | "privacy";

const DOCS: Record<Doc, { title: string; meta?: string; href: string }> = {
  points: { title: "How points work", href: "/how-points-work" },
  terms: {
    title: "Terms of Service",
    meta: `Last updated ${formatLegalVersion(CURRENT_TERMS_VERSION)} · Beta`,
    href: "/legal/terms",
  },
  privacy: {
    title: "Privacy Policy",
    meta: `Last updated ${formatLegalVersion(CURRENT_PRIVACY_VERSION)} · Beta`,
    href: "/legal/privacy",
  },
};

/**
 * Opens a legal / info document in a modal instead of navigating away, so people mid-signup
 * or mid-map keep their place. The standalone pages still exist for direct links.
 */
export default function LegalModalLink({
  doc,
  className,
  children,
}: {
  doc: Doc;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const info = DOCS[doc];

  // Portals need document.body, which only exists after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:px-6 sm:py-8"
                onClick={() => setOpen(false)}
              >
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-label={info.title}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 24 }}
                  transition={{ type: "spring", stiffness: 400, damping: 36 }}
                  className="flex w-full max-w-2xl max-h-[92dvh] sm:max-h-[85dvh] flex-col rounded-t-[28px] sm:rounded-[28px] bg-zinc-900 text-zinc-300 shadow-elevation-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-3 sm:px-7 sm:pt-6">
                    <div className="min-w-0">
                      <h2 className="font-display text-2xl font-extrabold tracking-tight text-zinc-100">
                        {info.title}
                      </h2>
                      {info.meta && <p className="mt-1 text-xs text-zinc-500">{info.meta}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Close"
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-800 text-zinc-400 transition-[background-color,transform] duration-150 hover:bg-zinc-700 hover:text-zinc-100 active:scale-[0.94] touch-manipulation"
                    >
                      <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-7 sm:pb-6">
                    {doc === "points" && <HowPointsContent />}
                    {doc === "terms" && <TermsContent />}
                    {doc === "privacy" && <PrivacyContent />}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
