export default function CampaignsLoading() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-10 w-full">
      <div className="mb-10">
        <div className="h-10 w-52 bg-zinc-800 rounded-lg animate-pulse" />
        <div className="h-4 w-36 bg-zinc-800/60 rounded mt-3 animate-pulse" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 animate-pulse"
          >
            <div className="flex gap-2 mb-3">
              <div className="h-6 w-20 bg-zinc-800 rounded-full" />
              <div className="h-6 w-16 bg-zinc-800 rounded-full" />
              <div className="h-6 w-10 bg-zinc-800/60 rounded-full ml-auto" />
            </div>
            <div className="h-5 w-3/4 bg-zinc-800 rounded mb-2" />
            <div className="h-4 w-full bg-zinc-800/60 rounded" />
            <div className="h-4 w-2/3 bg-zinc-800/40 rounded mt-1.5" />
          </div>
        ))}
      </div>
    </main>
  );
}
