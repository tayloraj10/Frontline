"use client";

import dynamic from "next/dynamic";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type GeoUnit = Omit<Database["public"]["Tables"]["geo_units"]["Row"], "geometry">;
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface Props {
  campaign: Campaign;
  geoUnits: GeoUnit[];
  claims: TerritoryClaim[];
  activeEvents: CampaignEvent[];
}

const CampaignMap = dynamic(() => import("./CampaignMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-zinc-900 animate-pulse" />,
});

export default function CampaignMapWrapper(props: Props) {
  return <CampaignMap {...props} />;
}
