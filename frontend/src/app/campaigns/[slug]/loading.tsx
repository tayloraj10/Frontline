export default function CampaignLoading() {
  return (
    <div className="flex flex-col flex-1">
      {/* Header bar */}
      <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-4 w-24 bg-zinc-800 rounded animate-pulse" />
          <div className="w-px h-4 bg-zinc-800" />
          <div className="h-4 w-40 bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="h-6 w-24 bg-zinc-800 rounded-full animate-pulse" />
      </div>

      {/* Stats bar */}
      <div className="px-5 py-2 border-b border-zinc-800/60 bg-zinc-950/40 flex items-center gap-6">
        {[80, 96, 72].map((w, i) => (
          <div key={i} className={`h-4 w-${w === 80 ? "20" : w === 96 ? "24" : "18"} bg-zinc-800 rounded animate-pulse`} />
        ))}
      </div>

      {/* Map placeholder */}
      <div className="flex-1 bg-zinc-900/30 animate-pulse" />
    </div>
  );
}
