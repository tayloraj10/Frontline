"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface NavLink {
  href: string;
  label: string;
  highlight?: boolean;
}

export default function MobileNavToggle({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative sm:hidden" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle navigation menu"
        aria-expanded={open}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-48 max-w-[calc(100vw-2rem)] bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 py-1 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2 transition-colors hover:bg-zinc-800 ${
                link.highlight ? "text-amber-500 hover:text-amber-400" : "text-zinc-300 hover:text-zinc-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
