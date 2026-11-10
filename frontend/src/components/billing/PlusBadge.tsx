/** Small gold "Plus" pill for members with an active Frontline Plus subscription. */
export default function PlusBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Frontline Plus member"
      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-2 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-widest text-zinc-950 ${className}`}
    >
      <span aria-hidden>✦</span>
      Plus
    </span>
  );
}
