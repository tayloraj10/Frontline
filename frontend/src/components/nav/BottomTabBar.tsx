"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Flag, Trophy, Handshake, Store, Users, Wrench, MoreHorizontal, type LucideIcon } from "lucide-react";
import type { NavLink } from "@/lib/navLinks";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/cn";

const MAX_PRIMARY_TABS = 4;

const ICONS_BY_HREF: Record<string, LucideIcon> = {
  "/campaigns": Flag,
  "/campaigns/trash-war": Flag,
  "/leaderboard": Trophy,
  "/partners": Handshake,
  "/partners/dashboard": Store,
  "/groups": Users,
  "/admin": Wrench,
};

function iconFor(href: string): LucideIcon {
  return ICONS_BY_HREF[href] ?? Flag;
}

type TabColor = "emerald" | "amber" | "sky" | "violet" | "rose" | "orange";

const COLOR_BY_HREF: Record<string, TabColor> = {
  "/campaigns": "emerald",
  "/campaigns/trash-war": "emerald",
  "/leaderboard": "amber",
  "/partners": "sky",
  "/partners/dashboard": "orange",
  "/groups": "violet",
  "/admin": "rose",
};

const ACTIVE_PILL_CLASSES: Record<TabColor, string> = {
  emerald: "bg-emerald-500/15 border-emerald-500/30 shadow-glow-emerald",
  amber: "bg-amber-500/15 border-amber-500/30 shadow-glow-amber",
  sky: "bg-sky-500/15 border-sky-500/30 shadow-glow-sky",
  violet: "bg-violet-500/15 border-violet-500/30 shadow-glow-violet",
  rose: "bg-rose-500/15 border-rose-500/30 shadow-glow-rose",
  orange: "bg-orange-500/15 border-orange-500/30 shadow-glow-orange",
};

const ACTIVE_TEXT_CLASSES: Record<TabColor, string> = {
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  sky: "text-sky-400",
  violet: "text-violet-400",
  rose: "text-rose-400",
  orange: "text-orange-400",
};

function colorFor(href: string): TabColor {
  return COLOR_BY_HREF[href] ?? "emerald";
}

/**
 * Fixed bottom tab bar for mobile widths, replacing the old hamburger dropdown.
 * Shows the first `MAX_PRIMARY_TABS` links as one-tap tabs; anything beyond that
 * collapses into a "More" overflow menu (same pattern reused by AdminPanel's
 * mobile tab switcher with its own link set).
 */
export default function BottomTabBar({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const primary = links.slice(0, MAX_PRIMARY_TABS);
  const overflow = links.slice(MAX_PRIMARY_TABS);

  useClickOutside(moreRef, () => setMoreOpen(false), moreOpen);

  // AdminPanel renders its own mobile tab bar in the same fixed-bottom position.
  const isAdminRoute = pathname?.startsWith("/admin");

  // A route can be prefix-matched by more than one link (e.g. "/partners" and
  // "/partners/dashboard" both prefix-match "/partners/dashboard") — only the
  // most specific (longest) match should light up, not every prefix that matches.
  function matchesHref(href: string) {
    if (href === "/") return pathname === "/";
    if (!pathname?.startsWith(href)) return false;
    return pathname.length === href.length || pathname[href.length] === "/";
  }

  function isActive(href: string) {
    if (!matchesHref(href)) return false;
    const longestMatch = links.reduce(
      (best, l) => (matchesHref(l.href) && l.href.length > best.length ? l.href : best),
      ""
    );
    return href === longestMatch;
  }

  if (isAdminRoute) return null;

  const overflowActive = overflow.some((link) => isActive(link.href));

  return (
    <nav className="sm:hidden fixed inset-x-0 bottom-0 z-40 px-3 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <div className="flex items-stretch gap-1.5 p-1.5 rounded-[1.75rem] border border-zinc-800/80 bg-zinc-900/95 backdrop-blur-md shadow-elevation-3">
        {primary.map((link) => {
          const active = isActive(link.href);
          const Icon = iconFor(link.href);
          const color = colorFor(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] rounded-2xl border text-[10.5px] font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.93] touch-manipulation",
                active ? "border-transparent" : "border-zinc-800/70 bg-zinc-800/30 active:bg-zinc-800/60"
              )}
            >
              {active && (
                <motion.span
                  layoutId="bottom-tab-pill"
                  className={cn("absolute inset-0 rounded-2xl border", ACTIVE_PILL_CLASSES[color])}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <Icon
                className={cn(
                  "relative z-10 w-5 h-5 transition-colors",
                  active ? ACTIVE_TEXT_CLASSES[color] : "text-zinc-500"
                )}
                strokeWidth={2.25}
              />
              <span
                className={cn(
                  "relative z-10 truncate max-w-full px-1 tracking-tight transition-colors",
                  active ? ACTIVE_TEXT_CLASSES[color] : "text-zinc-500"
                )}
              >
                {link.shortLabel ?? link.label}
              </span>
            </Link>
          );
        })}
        {overflow.length > 0 && (
          <div className="relative flex-1" ref={moreRef}>
            <button
              onClick={() => setMoreOpen((o) => !o)}
              aria-label="More navigation options"
              aria-expanded={moreOpen}
              className={cn(
                "w-full h-full flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] rounded-2xl border text-[10.5px] font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.93] touch-manipulation",
                moreOpen || overflowActive
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                  : "border-zinc-800/70 bg-zinc-800/30 text-zinc-500 active:bg-zinc-800/60"
              )}
            >
              <MoreHorizontal className="w-5 h-5" strokeWidth={2.25} />
              <span className="tracking-tight">More</span>
            </button>
            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 4 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-full right-0 mb-2 w-48 max-w-[calc(100vw-1rem)] bg-zinc-900 border border-zinc-800 rounded-xl shadow-elevation-4 py-1 text-sm origin-bottom-right"
                >
                  {overflow.map((link) => {
                    const Icon = iconFor(link.href);
                    const color = colorFor(link.href);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 min-h-[44px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 active:bg-zinc-800 active:text-zinc-100"
                      >
                        <Icon className={cn("w-4 h-4 shrink-0", ACTIVE_TEXT_CLASSES[color])} strokeWidth={2.25} />
                        {link.label}
                      </Link>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </nav>
  );
}
