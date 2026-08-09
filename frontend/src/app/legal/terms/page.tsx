import Link from "next/link";
import TermsContent from "@/components/legal/TermsContent";
import { CURRENT_TERMS_VERSION, formatLegalVersion } from "@/lib/legal";

export const metadata = { title: "Terms of Service — Frontline" };

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 space-y-8 text-zinc-300">
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Legal</p>
        <h1 className="text-3xl font-black text-zinc-100">Terms of Service</h1>
        <p className="text-zinc-500 text-sm">
          Last updated: {formatLegalVersion(CURRENT_TERMS_VERSION)} · Beta
        </p>
      </div>

      <TermsContent />

      <div className="pt-4 border-t border-zinc-800 text-sm text-zinc-500">
        <Link href="/legal/privacy" className="text-emerald-400 hover:text-emerald-300 active:text-emerald-300 transition-colors duration-150">
          Privacy Policy
        </Link>
        {" · "}
        <Link href="/" className="hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150">
          Back to Frontline
        </Link>
      </div>
    </main>
  );
}
