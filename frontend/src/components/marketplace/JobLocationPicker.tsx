"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Crosshair, Eraser, Undo2 } from "lucide-react";
import AddressAutocomplete from "@/app/admin/AddressAutocomplete";
import { ChoiceChips, Field, Note } from "@/components/ui/fields";
import { LIMITS, formatArea, polygonAreaSqm, polygonProblem, type LngLat } from "@/lib/areaShape";
import { getPosition } from "@/lib/getPosition";

const ShapePickerMap = dynamic(() => import("@/components/map/ShapePickerMap"), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-2xl bg-zinc-900 sm:h-80" />,
});

export interface JobPlace {
  label: string;
  kind: "pin" | "area";
  point: LngLat | null;
  radius: number;
  vertices: LngLat[];
}

export const EMPTY_PLACE: JobPlace = { label: "", kind: "pin", point: null, radius: 50, vertices: [] };

const RADIUS_MIN = LIMITS.siteRadiusMin;
const RADIUS_MAX = LIMITS.siteRadiusMax;

/** Returns a message when the place cannot be used, otherwise null. */
export function placeProblem(p: JobPlace): string | null {
  if (p.kind === "pin") return p.point ? null : "Search an address or tap the map to place the pin.";
  return polygonProblem(p.vertices);
}

/** Request body fragment for POST /jobs. */
export function placeToPayload(p: JobPlace): Record<string, unknown> {
  if (p.kind === "area") return { polygon: p.vertices, latitude: null, longitude: null, radius_m: null };
  return { latitude: p.point?.[1] ?? null, longitude: p.point?.[0] ?? null, radius_m: p.radius, polygon: null };
}

/** Where the job is: address search, a pin with a radius, or an area drawn on the map. */
export default function JobLocationPicker({ value, onChange }: { value: JobPlace; onChange: (next: JobPlace) => void }) {
  const [search, setSearch] = useState("");
  const [flyTo, setFlyTo] = useState<LngLat | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const set = (patch: Partial<JobPlace>) => onChange({ ...value, ...patch });

  const goTo = (p: LngLat, label?: string) => {
    setFlyTo([...p]);
    if (value.kind === "pin") set({ point: p, ...(label ? { label } : {}) });
    else if (label) set({ label });
  };

  const locateMe = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const pos = await getPosition();
      goTo([pos.coords.longitude, pos.coords.latitude], "Current location");
      setSearch("Current location");
    } catch (err) {
      setLocError(err instanceof Error ? err.message : "Could not get your location.");
    } finally {
      setLocating(false);
    }
  };

  const polyError = value.kind === "area" && value.vertices.length >= 3 ? polygonProblem(value.vertices) : null;
  const sqm = value.vertices.length >= 3 ? polygonAreaSqm(value.vertices) : 0;

  return (
    <div className="space-y-3">
      <Field label="Search an address or place" hint="Only the cleaner you work with sees the exact spot.">
        <AddressAutocomplete
          value={search}
          onChange={setSearch}
          onSelect={(s) => {
            setSearch(s.addressLine1 || search);
            goTo([s.lng, s.lat], [s.addressLine1, s.city].filter(Boolean).join(", "));
          }}
          placeholder="Street address, cross streets or landmark"
        />
      </Field>

      <ChoiceChips
        value={value.kind}
        onChange={(kind) => set({ kind })}
        options={[
          { value: "pin", label: "Drop a pin" },
          { value: "area", label: "Draw the area" },
        ]}
      />

      {locError && <Note tone="warn">{locError}</Note>}
      <ShapePickerMap
        mode={value.kind === "pin" ? "point" : "polygon"}
        point={value.point}
        radiusMeters={value.radius}
        onPoint={(p) => set({ point: p })}
        vertices={value.vertices}
        onVertices={(vertices) => set({ vertices })}
        flyTo={flyTo}
        invalid={Boolean(polyError)}
      />

      {value.kind === "pin" ? (
        <>
          <p className="text-xs text-zinc-500">{value.point ? "Drag the pin to adjust it." : "Tap the map to drop the pin."}</p>
          <Field label={`Roughly how far does the mess spread? ${value.radius} m`} hint="The green circle. Around 50 m covers a lot or a block face.">
            <input
              type="range"
              className="h-11 w-full accent-emerald-400"
              min={RADIUS_MIN}
              max={RADIUS_MAX}
              step={10}
              value={value.radius}
              onChange={(e) => set({ radius: parseInt(e.target.value, 10) })}
            />
          </Field>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              {value.vertices.length < 3 ? "Tap the map to add corners. You need at least 3." : `Area about ${formatArea(sqm)}.`}
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={value.vertices.length === 0}
                onClick={() => set({ vertices: value.vertices.slice(0, -1) })}
                className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-zinc-300 ring-1 ring-inset ring-zinc-800 disabled:opacity-40"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Undo
              </button>
              <button
                type="button"
                disabled={value.vertices.length === 0}
                onClick={() => set({ vertices: [] })}
                className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-zinc-300 ring-1 ring-inset ring-zinc-800 disabled:opacity-40"
              >
                <Eraser className="h-3.5 w-3.5" aria-hidden="true" /> Clear
              </button>
            </div>
          </div>
          {polyError && <Note tone="warn">{polyError}</Note>}
        </>
      )}

      <button
        type="button"
        onClick={locateMe}
        disabled={locating}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-sky-300 ring-1 ring-inset ring-sky-400/40 touch-manipulation active:scale-[0.98] disabled:opacity-60"
      >
        <Crosshair className="h-4 w-4" aria-hidden="true" />
        {locating ? "Finding you..." : "Use my current location"}
      </button>
    </div>
  );
}
