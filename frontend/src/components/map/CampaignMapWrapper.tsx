"use client";

import dynamic from "next/dynamic";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];
export type ClaimLabel = { name: string; isGroup: boolean };

interface Props {
  campaign: Campaign;
  claims: TerritoryClaim[];
  activeEvents: CampaignEvent[];
  claimLabels: Record<string, ClaimLabel>;
  pinPickerActive?: boolean;
  pinPickerInitialCoords?: { latitude: number; longitude: number } | null;
  pinPickerConstrained?: boolean;
  onPinPlaced?: (lat: number, lng: number) => void;
  onPinCancelled?: () => void;
  newContribution?: { lat: number; lng: number; value: number; key: number } | null;
  userLocation?: { latitude: number; longitude: number } | null;
}

const CampaignMap = dynamic(() => import("./CampaignMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-zinc-900 animate-pulse" />,
});

export default function CampaignMapWrapper(props: Props) {
  return <CampaignMap {...props} />;
}
