import Link from "next/link";

export const metadata = { title: "Checkout canceled — Frontline" };

export default function BillingCancelPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 space-y-8 text-zinc-300 text-center">
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Billing</p>
        <h1 className="text-3xl font-black text-zinc-100">Checkout canceled</h1>
        <p className="text-zinc-500 text-sm">No charge was made.</p>
      </div>

      <Link href="/" className="text-emerald-400 hover:text-emerald-300 active:text-emerald-300 transition-colors duration-150">
        Back to Frontline
      </Link>
    </main>
  );
}
