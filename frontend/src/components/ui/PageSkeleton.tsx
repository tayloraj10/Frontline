/** Generic list-page placeholder shown by route-level loading.tsx files. */
export default function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <main className="max-w-5xl mx-auto px-6 py-10 w-full" aria-busy="true" aria-label="Loading">
      <div className="mb-8">
        <div className="h-9 w-48 bg-zinc-800 rounded-lg animate-pulse" />
        <div className="h-4 w-64 max-w-full bg-zinc-800/60 rounded mt-3 animate-pulse" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex items-center gap-4 animate-pulse"
          >
            <div className="w-11 h-11 rounded-full bg-zinc-800 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="h-4 w-1/2 bg-zinc-800 rounded" />
              <div className="h-3 w-1/3 bg-zinc-800/60 rounded mt-2" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
