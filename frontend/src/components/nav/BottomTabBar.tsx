"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavLink } from "@/lib/navLinks";

const MAX_PRIMARY_TABS = 4;

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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname?.startsWith(href);
  }

  // AdminPanel renders its own mobile tab bar in the same fixed-bottom position.
  if (pathname?.startsWith("/admin")) return null;

  return (
    <nav className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-sm shadow-[0_-4px_16px_rgba(0,0,0,0.35)] pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <div className="flex items-stretch px-1 pt-1">
        {primary.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[52px] text-[11px] font-medium"
            >
              <span
                className={`flex items-center justify-center w-9 h-7 rounded-full text-lg leading-none transition-colors ${
                  active
                    ? link.highlight
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-emerald-500/15 text-emerald-400"
                    : "text-zinc-500"
                }`}
              >
                {link.icon ?? "•"}
              </span>
              <span
                className={`truncate max-w-full px-1 transition-colors ${
                  active ? (link.highlight ? "text-amber-400" : "text-emerald-400") : "text-zinc-500"
                }`}
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
              className="w-full h-full flex flex-col items-center justify-center gap-1 py-2 min-h-[52px] text-[11px] font-medium"
            >
              <span
                className={`flex items-center justify-center w-9 h-7 rounded-full text-lg leading-none transition-colors ${
                  moreOpen || overflow.some((link) => isActive(link.href))
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-zinc-500"
                }`}
              >
                ⋯
              </span>
              <span
                className={`transition-colors ${
                  moreOpen || overflow.some((link) => isActive(link.href)) ? "text-emerald-400" : "text-zinc-500"
                }`}
              >
                More
              </span>
            </button>
            {moreOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-48 max-w-[calc(100vw-1rem)] bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl py-1 text-sm">
                {overflow.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                    className={`block px-4 py-2.5 min-h-[44px] flex items-center gap-2 transition-colors hover:bg-zinc-800 ${
                      link.highlight ? "text-amber-500 hover:text-amber-400" : "text-zinc-300 hover:text-zinc-100"
                    }`}
                  >
                    <span>{link.icon ?? "•"}</span>
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
