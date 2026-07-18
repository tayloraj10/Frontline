"use client";

export default function LayerToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-1.5 px-2 py-1 rounded backdrop-blur-sm text-xs transition-colors ${
        checked
          ? "bg-emerald-600/90 text-white"
          : "bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800/90"
      }`}
      aria-pressed={checked}
    >
      <span
        className={`w-3 h-3 rounded-sm border ${
          checked ? "bg-white border-white" : "border-zinc-500 bg-transparent"
        }`}
      />
      {label}
    </button>
  );
}
