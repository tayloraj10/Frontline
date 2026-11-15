"use client";

import { useLimits } from "@/lib/useLimits";
import { useState } from "react";
import dynamic from "next/dynamic";
import Button from "@/components/ui/Button";
import { Field, Note, TextInput } from "@/components/ui/fields";
import AddressAutocomplete from "@/app/admin/AddressAutocomplete";
import { LIMITS, RADIUS_FT_DEFAULT, RADIUS_FT_STEP, type Limits, feetToMeters, metersToFeet, type LngLat } from "@/lib/areaShape";
import { getPosition } from "@/lib/getPosition";

const ShapePickerMap = dynamic(() => import("@/components/map/ShapePickerMap"), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-2xl bg-zinc-900 sm:h-96" />,
});

export interface SitePlace {
  label: string;
  point: LngLat | null;
  radius: number;
}

export const EMPTY_SITE: SitePlace = { label: "", point: null, radius: feetToMeters(RADIUS_FT_DEFAULT) };

/** Returns a message when the site cannot be submitted, otherwise null. */
export function sitePlaceProblem(site: SitePlace, lim: Limits = LIMITS): string | null {
  if (!site.label.trim()) return "Give the site a name.";
  if (!site.point) return "Tap the map to place the site.";
  if (site.radius < lim.siteRadiusMin || site.radius > lim.siteRadiusMax) {
    return `Radius must be ${lim.radiusFtMin} to ${lim.radiusFtMax} feet.`;
  }
  return null;
}

/** Name, address search, tap-to-place pin and radius slider for a sponsored cleanup site. */
export default function SitePlacePicker({
  value,
  onChange,
}: {
  value: SitePlace;
  onChange: (next: SitePlace) => void;
}) {
  const lim = useLimits();
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<LngLat | null>(null);
  const [search, setSearch] = useState("");

  const place = (p: LngLat) => {
    onChange({ ...value, point: p });
    setFlyTo([...p]);
  };

  const locateMe = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const pos = await getPosition();
      place([pos.coords.longitude, pos.coords.latitude]);
    } catch (err) {
      setLocError(err instanceof Error ? err.message : "Could not get your location.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Site name" hint="What cleaners will see on the map.">
        <TextInput
          type="text"
          maxLength={80}
          placeholder="Vacant lot on 5th and Main"
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
      </Field>

      <Field label="Find the spot" hint="Search an address or place, or tap the map to drop the pin yourself.">
        <AddressAutocomplete
          value={search}
          onChange={setSearch}
          onSelect={(s) => place([s.lng, s.lat])}
          placeholder="Search an address or place"
        />
      </Field>

      <Field
        label={`Claim radius: ${metersToFeet(value.radius)} ft`}
        hint="The green circle. A cleaner must be inside it to claim the site. Around 150 ft covers a lot or a block."
      >
        <input
          type="range"
          className="h-11 w-full accent-emerald-400"
          min={lim.radiusFtMin}
          max={lim.radiusFtMax}
          step={RADIUS_FT_STEP}
          value={metersToFeet(value.radius)}
          onChange={(e) => onChange({ ...value, radius: feetToMeters(parseInt(e.target.value, 10)) })}
        />
      </Field>

      {locError && <Note tone="warn">{locError}</Note>}
      <ShapePickerMap
        mode="point"
        point={value.point}
        radiusMeters={value.radius}
        onPoint={(p) => onChange({ ...value, point: p })}
        vertices={[]}
        onVertices={() => {}}
        flyTo={flyTo}
        maxVertices={lim.maxVertices}
      />
      <p className="text-xs text-zinc-500">
        {value.point ? "Drag the pin to adjust it." : "Tap the map to drop a pin on the site."}
      </p>

      <Button variant="secondary" className="w-full" loading={locating} onClick={locateMe}>
        Put the pin where I am
      </Button>
    </div>
  );
}
