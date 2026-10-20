"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Button from "@/components/ui/Button";
import { ChoiceChips, Field, Note, Select, TextInput } from "@/components/ui/fields";
import AddressAutocomplete from "@/app/admin/AddressAutocomplete";
import { createClient } from "@/lib/supabase/client";
import { LIMITS, formatArea, polygonAreaSqm, polygonProblem, type LngLat } from "@/lib/areaShape";

const BoundaryPickerMap = dynamic(() => import("@/components/map/BoundaryPickerMap"), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-2xl bg-zinc-900 sm:h-96" />,
});
const ShapePickerMap = dynamic(() => import("@/components/map/ShapePickerMap"), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-2xl bg-zinc-900 sm:h-96" />,
});

export type AreaKind = "geo_units" | "polygon";

export interface AreaDraft {
  kind: AreaKind;
  name: string;
  geoUnitIds: string[];
  /** Display names for the chosen ids, kept so chips still read well after the search changes. */
  geoUnitLabels: Record<string, string>;
  vertices: LngLat[];
}

export const EMPTY_AREA: AreaDraft = {
  kind: "geo_units",
  name: "",
  geoUnitIds: [],
  geoUnitLabels: {},
  vertices: [],
};

/**
 * Boundary types a sponsor can pick from: the ones Trash War can place events in, smallest first.
 * Climate zones, map hexes, states, boroughs and cities are left out (too big or not used by cleanups).
 */
const UNIT_TYPES: { value: string; label: string }[] = [
  { value: "nyc_neighborhood", label: "NYC neighborhood" },
  { value: "chicago_neighborhood", label: "Chicago neighborhood" },
  { value: "la_neighborhood", label: "Los Angeles neighborhood" },
  { value: "philadelphia_neighborhood", label: "Philadelphia neighborhood" },
  { value: "zip", label: "US zip code" },
  { value: "uk_postcode_district", label: "UK postcode district" },
];
const UNIT_TYPE_VALUES = UNIT_TYPES.map((t) => t.value);
const TYPE_LABEL = new Map(UNIT_TYPES.map((t) => [t.value, t.label]));

interface UnitResult {
  id: string;
  label: string;
  type: string;
}

/** Returns a message when the area cannot be submitted, otherwise null. */
export function areaProblem(a: AreaDraft): string | null {
  if (a.kind === "geo_units") {
    if (a.geoUnitIds.length === 0) return "Pick at least one boundary.";
    return null;
  }
  if (!a.name.trim()) return "Give the area a name.";
  return polygonProblem(a.vertices);
}

/** Request body fragment for POST /admin/sponsorships (matches build_area_geometry on the backend). */
export function areaToPayload(a: AreaDraft): Record<string, unknown> {
  if (a.kind === "geo_units") return { kind: "geo_units", geo_unit_ids: a.geoUnitIds };
  return { kind: "polygon", coordinates: a.vertices };
}

/** Defines a sponsored group area: combine existing boundaries, or draw a shape on the map. */
export default function AreaBuilder({
  value,
  onChange,
}: {
  value: AreaDraft;
  onChange: (next: AreaDraft) => void;
}) {
  const set = (patch: Partial<AreaDraft>) => onChange({ ...value, ...patch });

  const [query, setQuery] = useState("");
  const [unitType, setUnitType] = useState("");
  const [results, setResults] = useState<UnitResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mapSearch, setMapSearch] = useState("");
  const [flyTo, setFlyTo] = useState<LngLat | null>(null);
  const [mapType, setMapType] = useState(UNIT_TYPES[0].value);

  const q = query.trim();
  const canSearch = q.length >= 2 || unitType !== "";

  // Search the whole boundary table on the server. There are tens of thousands of rows, so the
  // browser never holds the full list.
  useEffect(() => {
    if (value.kind !== "geo_units") return;
    if (!canSearch) {
      setResults([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      const supabase = createClient();
      let req = supabase
        .schema("public")
        .from("geo_units")
        .select("id, display_name, unit_id, unit_type")
        .in("unit_type", unitType ? [unitType] : UNIT_TYPE_VALUES)
        .order("display_name")
        .limit(30);
      if (q.length >= 2) {
        // Commas, parentheses and wildcards would change the meaning of the filter string.
        const safe = q.replace(/[,()%*\\]/g, " ").trim();
        req = req.or(`display_name.ilike.%${safe}%,unit_id.ilike.%${safe}%`);
      }
      const { data, error } = await req;
      if (cancelled) return;
      setSearching(false);
      if (error) {
        setSearchError("Search failed. Try again.");
        return;
      }
      setResults(
        (data ?? []).map((g) => ({
          id: g.id as string,
          label: (g.display_name ?? g.unit_id) as string,
          type: g.unit_type as string,
        })),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, unitType, canSearch, value.kind]);

  const toggleUnit = (unit: { id: string; label: string }) => {
    if (value.geoUnitIds.includes(unit.id)) {
      const rest = { ...value.geoUnitLabels };
      delete rest[unit.id];
      set({ geoUnitIds: value.geoUnitIds.filter((x) => x !== unit.id), geoUnitLabels: rest });
    } else if (value.geoUnitIds.length < LIMITS.maxGeoUnits) {
      set({
        geoUnitIds: [...value.geoUnitIds, unit.id],
        geoUnitLabels: { ...value.geoUnitLabels, [unit.id]: unit.label },
      });
    }
  };

  const polyError = value.kind === "polygon" && value.vertices.length >= 3 ? polygonProblem(value.vertices) : null;
  const atUnitLimit = value.geoUnitIds.length >= LIMITS.maxGeoUnits;
  const sqm = value.vertices.length >= 3 ? polygonAreaSqm(value.vertices) : 0;
  const sizeBar = Math.min(100, (sqm / LIMITS.maxAreaSqm) * 100);

  return (
    <div className="space-y-3">
      <ChoiceChips
        value={value.kind}
        onChange={(kind) => set({ kind })}
        options={[
          { value: "geo_units", label: "Pick boundaries" },
          { value: "polygon", label: "Draw on the map" },
        ]}
      />
      <p className="text-sm text-zinc-400">
        {value.kind === "geo_units"
          ? "Use boundaries that already exist, like neighborhoods, zip codes or boroughs. Pick up to 10 and they merge into one area."
          : "Trace your own shape. Good for a park, a corridor or any region the boundaries do not cover."}
      </p>

      {value.kind === "geo_units" && (
        <div className="space-y-2">
          <Field label="Pick on the map" hint="Tap a boundary to add it, tap again to remove it. Chosen ones turn green.">
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select value={mapType} onChange={(e) => setMapType(e.target.value)} aria-label="Boundary type on the map">
                  {UNIT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <AddressAutocomplete
                  value={mapSearch}
                  onChange={setMapSearch}
                  onSelect={(s) => setFlyTo([s.lng, s.lat])}
                  placeholder="Jump to an address or place"
                />
              </div>
              <BoundaryPickerMap
                unitType={mapType}
                selectedIds={value.geoUnitIds}
                onToggle={toggleUnit}
                atLimit={atUnitLimit}
                flyTo={flyTo}
              />
              <p className="mt-2 text-xs text-zinc-500">
                Dollar-tagged pins and dashed outlines are sponsorships that already exist. Check them before picking yours.
              </p>
            </div>
          </Field>
          <p className="text-xs font-medium text-zinc-400">Or search by name</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TextInput
              type="search"
              placeholder="Search by name or zip code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select value={unitType} onChange={(e) => setUnitType(e.target.value)} aria-label="Boundary type">
              <option value="">All boundary types</option>
              {UNIT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          {value.geoUnitIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {value.geoUnitIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleUnit({ id, label: value.geoUnitLabels[id] ?? "Area" })}
                  className="min-h-9 rounded-full bg-emerald-500/15 px-3 text-xs font-medium text-emerald-300"
                >
                  {value.geoUnitLabels[id] ?? "Area"} ✕
                </button>
              ))}
            </div>
          )}
          <div className="max-h-56 overflow-y-auto rounded-2xl border border-zinc-800">
            {!canSearch && (
              <p className="p-3 text-sm text-zinc-500">Type at least 2 letters, or choose a boundary type, to see matches.</p>
            )}
            {canSearch && searching && results.length === 0 && <p className="p-3 text-sm text-zinc-500">Searching...</p>}
            {canSearch && !searching && !searchError && results.length === 0 && (
              <p className="p-3 text-sm text-zinc-500">No matches.</p>
            )}
            {searchError && <p className="p-3 text-sm text-red-400">{searchError}</p>}
            {results.map((g) => {
              const checked = value.geoUnitIds.includes(g.id);
              const blocked = !checked && atUnitLimit;
              return (
                <label
                  key={g.id}
                  className={`flex min-h-11 items-center gap-3 border-b border-zinc-800/60 px-3 py-1.5 text-sm last:border-b-0 ${
                    blocked ? "text-zinc-600" : "cursor-pointer text-zinc-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-emerald-400"
                    checked={checked}
                    disabled={blocked}
                    onChange={() => toggleUnit(g)}
                  />
                  <span className="min-w-0 flex-1">
                    {g.label}
                    <span className="block text-xs text-zinc-500">{TYPE_LABEL.get(g.type) ?? g.type}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-zinc-500">
            {value.geoUnitIds.length} of {LIMITS.maxGeoUnits} selected. The more you combine, the more ground your
            money has to cover.
          </p>
        </div>
      )}

      {value.kind === "polygon" && (
        <div className="space-y-3">
          <Field label="Find the place" hint="Jump the map to an address or landmark, then trace your area.">
            <AddressAutocomplete
              value={mapSearch}
              onChange={setMapSearch}
              onSelect={(s) => setFlyTo([s.lng, s.lat])}
              placeholder="Search an address or place"
            />
          </Field>
          <ShapePickerMap
            mode="polygon"
            point={null}
            radiusMeters={0}
            onPoint={() => {}}
            vertices={value.vertices}
            onVertices={(vertices) => set({ vertices })}
            flyTo={flyTo}
            invalid={polyError !== null}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={value.vertices.length === 0}
              onClick={() => set({ vertices: value.vertices.slice(0, -1) })}
            >
              Undo
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={value.vertices.length === 0}
              onClick={() => set({ vertices: [] })}
            >
              Clear
            </Button>
          </div>

          <div className="space-y-1.5 rounded-2xl border border-zinc-800 p-3">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-zinc-200">Size</span>
              <span className={polyError ? "text-red-400" : "text-zinc-300"}>
                {value.vertices.length < 3 ? "Add 3 corners to measure" : formatArea(sqm)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full rounded-full ${polyError ? "bg-red-400" : "bg-emerald-400"}`}
                style={{ width: `${sizeBar}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>Min {formatArea(LIMITS.minAreaSqm)}</span>
              <span>Max {formatArea(LIMITS.maxAreaSqm)}</span>
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            {value.vertices.length < 3
              ? "Tap the map to add corners (at least 3). Drag a corner to adjust it."
              : `${value.vertices.length} corners. Tap the map to add more, up to ${LIMITS.maxVertices}.`}
          </p>
          {polyError && <Note tone="warn">{polyError}</Note>}
        </div>
      )}

      <Field label="Area name" optional={value.kind === "geo_units"}>
        <TextInput
          type="text"
          maxLength={80}
          placeholder={value.kind === "geo_units" ? "Defaults to the boundary names" : "Riverside park cleanup zone"}
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
    </div>
  );
}
