"use client";

import dynamic from "next/dynamic";
import type { Database } from "@/types/database";
import type { ProblemReportMapData, ProblemReports } from "@/app/campaigns/[slug]/CampaignPageClient";
import type { MapBusiness, MapCleanupEvent } from "./CampaignMap";
import type { SelectedArea } from "@/app/admin/EventAreaMapPicker";
import type { CampaignCleanupRoute } from "@/lib/cleanupRoutes";

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
  areaPickerActive?: boolean;
  areaPickerUnitType?: string | null;
  onAreaPickerChange?: (areas: SelectedArea[]) => void;
  onAreaPickerConfirm?: () => void;
  onAreaPickerCancel?: () => void;
  newContribution?: { lat: number; lng: number; value: number; photoUrl?: string; key: number } | null;
  newReport?: { id: string; lat: number; lng: number; severity: string; photoUrl?: string; key: number } | null;
  userLocation?: { latitude: number; longitude: number } | null;
  focusCoords?: { latitude: number; longitude: number } | null;
  activeStyle?: string;
  problemReports?: ProblemReports | null;
  onReportClick?: (report: ProblemReportMapData) => void;
  eventCentroids?: Record<string, { lat: number; lng: number }>;
  eventGeoUnitIds?: Record<string, string[]>;
  partnerBusinesses?: MapBusiness[];
  cleanupEvents?: MapCleanupEvent[];
  onMobileStatsClick?: () => void;
  onUserLocationChange?: (coords: { latitude: number; longitude: number } | null) => void;
  onUserLocationError?: (code: number) => void;
  onGeolocateTrigger?: (trigger: () => boolean) => void;
  nycNeighborhoodsVisible?: boolean;
  routePickerActive?: boolean;
  onRoutePickerChange?: (vertices: [number, number][]) => void;
  onRoutePickerFinish?: () => void;
  onRoutePickerCancel?: () => void;
  cleanupRoutes?: CampaignCleanupRoute[];
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
