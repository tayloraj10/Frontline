"use client";

import Link from "next/link";

interface BackButtonProps {
  /** Renders as a Link when provided; otherwise as a button. */
  href?: string;
  onClick?: () => void;
  label?: string;
  className?: string;
  /** Extra classes for the label span, e.g. "hidden sm:inline" to hide it on narrow headers. */
  labelClassName?: string;
}

/**
 * Native-feeling back navigation: a real chevron icon with a 44px+ tap target
 * (vs. a bare "←" text glyph, which was effectively unclickable on mobile).
 */
export default function BackButton({ href, onClick, label, className = "", labelClassName = "" }: BackButtonProps) {
  const content = (
    <>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label && <span className={`truncate ${labelClassName}`}>{label}</span>}
    </>
  );

  const cls = `inline-flex items-center gap-1 min-h-11 -ml-2 pl-2 pr-3 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 active:bg-zinc-800 transition-colors ${className}`;

  if (href) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  );
}
