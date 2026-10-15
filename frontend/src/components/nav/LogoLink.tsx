"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { requestHome } from "@/lib/homeLanding";

export default function LogoLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Link href="/" className={className} onClick={requestHome}>
      {children}
    </Link>
  );
}
