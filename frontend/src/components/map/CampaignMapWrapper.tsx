"use client";

import dynamic from "next/dynamic";
import type { Database } from "@/types/database";
import type { ProblemReports } from "@/app/campaigns/[slug]/CampaignPageClient";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];
export type ClaimLabel = { name: string; isGroup: boolean; groupSlug?: string };

interface Props {
  campaign: Campaign;
  claims: TerritoryClaim[];
  activeEvents: CampaignEvent[];
  claimLabels: Record<string, ClaimLabel>;
  campaignType?: string;
  pinPickerActive?: boolean;
  pinPickerInitialCoords?: { latitude: number; longitude: number } | null;
  pinPickerConstrained?: boolean;
  pinPickerLabel?: string;
  onPinPlaced?: (lat: number, lng: number) => void;
  onPinCancelled?: () => void;
  newContribution?: { lat: number; lng: number; value: number; photoUrl?: string; key: number } | null;
  userLocation?: { latitude: number; longitude: number } | null;
  activeStyle?: string;
  problemReports?: ProblemReports | null;
  eventCentroids?: Record<string, { lat: number; lng: number }>;
  onMobileStatsClick?: () => void;
}

const CampaignMap = dynamic(() => import("./CampaignMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-zinc-900 animate-pulse" />,
});

export default function CampaignMapWrapper({ activeStyle, problemReports, eventCentroids, ...rest }: Props) {
  return (
    <CampaignMap
      {...rest}
      activeStyle={activeStyle as "outdoor" | "streets" | "hybrid" | undefined}
      problemReports={problemReports}
      eventCentroids={eventCentroids}
    />
  );
}
