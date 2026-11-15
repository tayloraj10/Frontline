"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/Card";

/**
 * Shown in place of an action (chip in, claim, accept, post) to logged-out visitors, who can browse
 * the money pages but need an account to act. Returns here after logging in or signing up.
 */
export default function LoginPrompt({ action = "take part", className = "" }: { action?: string; className?: string }) {
  const next = encodeURIComponent(usePathname() || "/");
  return (
    <Card className={`space-y-3 p-4 ${className}`}>
      <p className="text-sm font-semibold text-zinc-100">Log in or make a free account to {action}.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/signup?next=${next}`}
          className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-bold text-emerald-950 touch-manipulation active:scale-[0.98]"
        >
          Make an account
        </Link>
        <Link
          href={`/login?next=${next}`}
          className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-zinc-800 px-4 text-sm font-bold text-zinc-100 touch-manipulation active:scale-[0.98]"
        >
          Log in
        </Link>
      </div>
    </Card>
  );
}
