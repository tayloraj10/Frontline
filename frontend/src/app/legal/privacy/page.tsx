import Link from "next/link";
import PrivacyContent from "@/components/legal/PrivacyContent";
import { CURRENT_PRIVACY_VERSION, formatLegalVersion } from "@/lib/legal";

export const metadata = { title: "Privacy Policy — Frontline" };

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 space-y-8 text-zinc-300">
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Legal</p>
        <h1 className="text-3xl font-black text-zinc-100">Privacy Policy</h1>
        <p className="text-zinc-500 text-sm">
          Last updated: {formatLegalVersion(CURRENT_PRIVACY_VERSION)} · Beta
        </p>
      </div>

      <PrivacyContent />

      <div className="pt-4 border-t border-zinc-800 text-sm text-zinc-500">
        <Link href="/legal/terms" className="text-emerald-400 hover:text-emerald-300">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/" className="hover:text-zinc-300">
          Back to Frontline
        </Link>
      </div>
    </main>
  );
}
