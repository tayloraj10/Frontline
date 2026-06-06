"use client";

import dynamic from "next/dynamic";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

const OnboardingModal = dynamic(() => import("@/components/OnboardingModal"), { ssr: false });

export default function OnboardingModalClient({ campaigns }: { campaigns: Campaign[] }) {
  return <OnboardingModal campaigns={campaigns} />;
}
