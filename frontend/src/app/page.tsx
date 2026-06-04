import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center flex-1 px-6 py-24 text-center gap-8">
      <div className="space-y-3">
        <h1 className="text-5xl font-bold tracking-tight">Frontline</h1>
        <p className="text-zinc-400 text-lg max-w-md mx-auto">
          Collective action on the map. Join campaigns, claim territory, change the world.
        </p>
      </div>

      <div className="flex gap-4">
        <Link
          href="/campaigns"
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
        >
          View Campaigns
        </Link>
        <Link
          href="/login"
          className="px-6 py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-medium rounded-lg transition-colors"
        >
          Sign In
        </Link>
      </div>
    </main>
  );
}
