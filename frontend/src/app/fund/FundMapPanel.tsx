"use client";

import { useState, type ReactNode } from "react";
import { ClipboardList, HandCoins, MapPin, Plus, Users } from "lucide-react";
import FitScreen from "@/components/ui/FitScreen";
import DoChooser, { type DoChip } from "@/components/ui/DoChooser";
import SponsoredMap, { type MapView } from "@/app/earn/SponsoredMap";

/**
 * Fund first screen: filterable map plus the "What do you want to do?" cards. Same pattern as Earn:
 * the sponsor section only appears, right under the cards, once "Sponsor a place" is picked.
 */
export default function FundMapPanel({ sponsor, extras }: { sponsor: ReactNode; extras?: ReactNode }) {
  const [view, setView] = useState<MapView>("all");
  const [doId, setDoId] = useState<string | null>(null);
  // Tapping the active card again goes back to the combined map and hides the section.
  const pickSponsor = () => {
    const next = doId === "sponsor" ? null : "sponsor";
    setDoId(next);
    setView(next ? "sites" : "all");
    if (next) setTimeout(() => document.getElementById("sponsor")?.scrollIntoView({ behavior: "smooth" }), 120);
  };
  // The two main paths on top; everything else underneath.
  const chips: DoChip[] = [
    { id: "post", label: "Post a job", color: "emerald", icon: Plus, href: "/fund/post" },
    { id: "sponsor", label: "Sponsor a cleanup", color: "rose", icon: MapPin, onSelect: pickSponsor },
    { id: "crowdfund", label: "Crowdfund", color: "violet", icon: HandCoins, href: "/fund/pools/new" },
    { id: "cleaners", label: "Browse cleaners", color: "sky", icon: Users, href: "/fund/cleaners" },
    { id: "bookings", label: "My bookings", color: "amber", icon: ClipboardList, href: "/fund/jobs" },
  ];
  return (
    <>
      <FitScreen>
        <SponsoredMap compact fill withJobs view={view} onViewChange={setView} />
        <DoChooser chips={chips} active={doId} topCount={2} />
      </FitScreen>
      {doId === "sponsor" && sponsor}
      {extras}
    </>
  );
}
