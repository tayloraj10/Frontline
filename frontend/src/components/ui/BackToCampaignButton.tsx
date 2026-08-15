"use client";

import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import { buildCampaignHrefWithSavedPosition } from "@/lib/mapPosition";

interface Props {
  campaignSlug: string;
  campaignTitle?: string | null;
  className?: string;
}

// Reads the last-saved map position for this campaign (see src/lib/mapPosition.ts) at
// click time and navigates back with it as a focusCoords-style deep link, so the map
// restores where the user left it instead of re-fitting the default bounds.
export default function BackToCampaignButton({ campaignSlug, campaignTitle, className }: Props) {
  const router = useRouter();

  function handleClick() {
    router.push(buildCampaignHrefWithSavedPosition(campaignSlug));
  }

  return (
    <BackButton
      onClick={handleClick}
      label={campaignTitle ? `Back to ${campaignTitle}` : "Back to campaign"}
      className={className}
    />
  );
}
