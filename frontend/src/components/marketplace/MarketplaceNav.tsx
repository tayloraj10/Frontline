"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/** Marketplace home owns its actions; every other marketplace screen just gets a way back. */
export default function MarketplaceNav() {
  const pathname = usePathname();
  if (pathname === "/marketplace") return null;
  return (
    <Link
      href="/marketplace"
      className="mb-4 inline-flex min-h-10 items-center gap-1 rounded-full pr-3 text-sm font-semibold text-zinc-400 touch-manipulation hover:text-zinc-100 active:scale-[0.97]"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Hire
    </Link>
  );
}
