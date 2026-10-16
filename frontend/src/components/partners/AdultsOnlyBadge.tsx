export default function AdultsOnlyBadge({ className }: { className?: string }) {
  return (
    <span
      title="This business can only serve customers who are 21 or older."
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-950/50 border border-red-800/60 text-red-400 text-[10px] font-semibold shrink-0 cursor-help ${className ?? ""}`}
    >
      🔞 21+
    </span>
  );
}
