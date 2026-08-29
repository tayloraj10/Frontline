"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import type { NavLink } from "@/lib/navLinks";
import { useClickOutside } from "@/hooks/useClickOutside";

/**
 * Hamburger fallback for the desktop nav row shown at widths too narrow to fit
 * every link inline (laptop-ish screens) but wide enough that the mobile
 * BottomTabBar isn't shown either. See AppHeader.tsx for the breakpoints.
 */
export default function DesktopNavMenu({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 active:bg-zinc-800/60 transition-colors duration-150 touch-manipulation"
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-56 rounded-xl border border-zinc-800 bg-zinc-900 shadow-elevation-4 py-1.5 z-50">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] text-sm transition-colors duration-150 hover:bg-zinc-800 active:bg-zinc-800 ${
                link.highlight ? "text-amber-500 hover:text-amber-400" : "text-zinc-300 hover:text-zinc-100"
              }`}
            >
              {link.label}
              {link.pulse && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)] animate-pulse shrink-0"
                  aria-hidden="true"
                />
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
