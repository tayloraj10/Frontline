"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function CampaignsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-col items-center justify-center flex-1 gap-6 px-6 text-center">
      <span className="text-4xl">🌍</span>
      <div>
        <h2 className="text-xl font-bold text-zinc-100 mb-2">Failed to load campaigns</h2>
        <p className="text-zinc-500 text-sm max-w-sm">
          Could not fetch active campaigns. Check your connection and try again.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-5 py-2.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-sm font-semibold rounded-xl transition-colors"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
