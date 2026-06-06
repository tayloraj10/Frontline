"use client";

import { useEffect } from "react";

export default function RootError({
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
      <span className="text-4xl">⚡</span>
      <div>
        <h2 className="text-xl font-bold text-zinc-100 mb-2">Something went wrong</h2>
        <p className="text-zinc-500 text-sm max-w-sm">
          An unexpected error occurred. Try again or reload the page.
        </p>
      </div>
      <button
        onClick={reset}
        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        Try again
      </button>
    </main>
  );
}
