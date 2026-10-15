import type { Metadata } from "next";
import Link from "next/link";
import BackButton from "@/components/ui/BackButton";
import HowPointsContent from "@/components/legal/HowPointsContent";

export const metadata: Metadata = {
  title: "How points work",
  description: "What earns points on Frontline, how events add to them, and how to spend your points.",
};

export default function HowPointsWorkPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <BackButton href="/campaigns" label="Campaigns" />
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100">How points work</h1>
        <p className="text-zinc-400 max-w-md leading-relaxed">
          You earn points for the trash you pick up. Points rank you on leaderboards and pay for perks at partner shops.
        </p>
      </div>

      <HowPointsContent />

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/campaigns"
          className="inline-flex items-center justify-center min-h-12 px-6 bg-emerald-400 text-emerald-950 hover:bg-emerald-300 active:scale-[0.97] font-bold rounded-2xl transition-[background-color,transform] duration-150 touch-manipulation"
        >
          Browse campaigns
        </Link>
        <Link
          href="/partners"
          className="inline-flex items-center justify-center min-h-12 px-6 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:scale-[0.97] font-semibold rounded-2xl transition-[background-color,transform] duration-150 touch-manipulation"
        >
          See partner perks
        </Link>
      </div>
    </main>
  );
}
