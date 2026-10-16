import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-col flex-1 items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-zinc-500">404</p>
      <h1 className="font-display text-3xl font-extrabold text-zinc-100">Page not found</h1>
      <p className="text-sm text-zinc-400 max-w-xs">The page you are looking for moved or never existed.</p>
      <Link
        href="/"
        className="inline-flex items-center justify-center min-h-12 px-6 bg-emerald-400 text-emerald-950 hover:bg-emerald-300 active:scale-[0.97] font-bold rounded-2xl transition-[background-color,transform] duration-150 touch-manipulation"
      >
        Back home
      </Link>
    </main>
  );
}
