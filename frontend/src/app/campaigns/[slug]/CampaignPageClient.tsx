"use client";

import { useState } from "react";
import CampaignMapWrapper, { type ClaimLabel } from "@/components/map/CampaignMapWrapper";
import ContributionPanel from "@/components/contributions/ContributionPanel";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type TerritoryClaim = Database["public"]["Tables"]["territory_claims"]["Row"];
type CampaignEvent = Database["public"]["Tables"]["campaign_events"]["Row"];

interface Coords {
  latitude: number;
  longitude: number;
}

interface Props {
  campaign: Campaign;
  claims: TerritoryClaim[];
  activeEvents: CampaignEvent[];
  claimLabels: Record<string, ClaimLabel>;
  userId: string | null;
}

interface NewContribution {
  lat: number;
  lng: number;
  value: number;
  key: number;
}

export default function CampaignPageClient({ campaign, claims, activeEvents, claimLabels, userId }: Props) {
  const [pinPickerActive, setPinPickerActive] = useState(false);
  const [pinPickerInitialCoords, setPinPickerInitialCoords] = useState<Coords | null>(null);
  const [pinPickerConstrained, setPinPickerConstrained] = useState(true);
  const [placedPinCoords, setPlacedPinCoords] = useState<Coords | null>(null);
  const [newContribution, setNewContribution] = useState<NewContribution | null>(null);
  const [userLocation, setUserLocation] = useState<Coords | null>(null);

  const handleContributionSubmitted = (lat: number, lng: number, value: number) => {
    setNewContribution({ lat, lng, value, key: Date.now() });
  };

  const handleEnterPinPicker = (coords: Coords, constrained = true) => {
    setPlacedPinCoords(null);
    setPinPickerInitialCoords(coords);
    setPinPickerConstrained(constrained);
    setPinPickerActive(true);
  };

  const handlePinPlaced = (lat: number, lng: number) => {
    setPlacedPinCoords({ latitude: lat, longitude: lng });
    setPinPickerActive(false);
  };

  const handlePinCancelled = () => {
    setPlacedPinCoords(null);
    setPinPickerActive(false);
  };

  return (
    <>
      <CampaignMapWrapper
        campaign={campaign}
        claims={claims}
        activeEvents={activeEvents}
        claimLabels={claimLabels}
        pinPickerActive={pinPickerActive}
        pinPickerInitialCoords={pinPickerInitialCoords}
        pinPickerConstrained={pinPickerConstrained}
        onPinPlaced={handlePinPlaced}
        onPinCancelled={handlePinCancelled}
        newContribution={newContribution}
        userLocation={userLocation}
      />
      {userId && (
        <ContributionPanel
          campaignId={campaign.id}
          campaignContributionType={campaign.contribution_type}
          userId={userId}
          onEnterPinPicker={handleEnterPinPicker}
          pinPickerActive={pinPickerActive}
          placedPinCoords={placedPinCoords}
          onContributionSubmitted={handleContributionSubmitted}
          onLocationCaptured={setUserLocation}
        />
      )}
    </>
  );
}
