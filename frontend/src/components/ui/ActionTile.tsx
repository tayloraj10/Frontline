import Link from "next/link";
import { type LucideIcon } from "lucide-react";

type Tone = "solid" | "sky" | "emerald" | "zinc" | "red";

const TONES: Record<Tone, { box: string; sub: string; icon: string }> = {
  solid: {
    box: "bg-emerald-400 text-emerald-950 hover:bg-emerald-300",
    sub: "text-emerald-950/70",
    icon: "text-emerald-950/60",
  },
  sky: {
    box: "bg-zinc-900 text-zinc-100 ring-1 ring-inset ring-sky-400/40 hover:bg-zinc-800",
    sub: "text-zinc-400",
    icon: "text-sky-300",
  },
  emerald: {
    box: "bg-zinc-900 text-zinc-100 ring-1 ring-inset ring-emerald-400/40 hover:bg-zinc-800",
    sub: "text-zinc-400",
    icon: "text-emerald-300",
  },
  red: {
    box: "bg-red-500/10 text-red-100 ring-2 ring-inset ring-red-400/60 hover:bg-red-500/15",
    sub: "text-red-200/80",
    icon: "text-red-300",
  },
  zinc: {
    box: "bg-zinc-900 text-zinc-100 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800",
    sub: "text-zinc-400",
    icon: "text-zinc-400",
  },
};

/** Action tile: a small icon beside the title, a line of help text, a ring and hover state so it reads as tappable. */
export default function ActionTile({
  icon: Icon,
  title,
  sub,
  tone = "zinc",
  href,
  onClick,
  disabled,
  loading,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  tone?: Tone;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Placeholder state: shows sample text, pulses and cannot be pressed. */
  loading?: boolean;
}) {
  const t = TONES[tone];
  const base =
    "flex min-h-20 flex-col justify-center gap-0.5 rounded-2xl px-4 text-left touch-manipulation transition";
  const inner = (
    <>
      <span className="flex items-start gap-1.5 text-[15px] font-extrabold leading-tight">
        <Icon className={`mt-px h-4 w-4 shrink-0 ${t.icon}`} aria-hidden="true" />
        <span className="min-w-0">{title}</span>
      </span>
      <span className={`text-xs font-bold ${t.sub}`}>{sub}</span>
    </>
  );

  if (loading) {
    return (
      <div aria-busy="true" className={`${base} animate-pulse bg-zinc-900 text-zinc-100 opacity-70 ring-1 ring-inset ring-zinc-800`}>
        {inner}
      </div>
    );
  }
  if (href) {
    return (
      <Link href={href} className={`${base} active:scale-[0.98] ${t.box}`}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} active:scale-[0.98] disabled:opacity-60 ${t.box}`}
    >
      {inner}
    </button>
  );
}
