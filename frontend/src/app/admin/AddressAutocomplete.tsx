"use client";

import { useEffect, useRef, useState } from "react";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const inputCls = "w-full min-h-11 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm shadow-elevation-1 transition-[border-color] duration-150 focus:outline-none focus:border-zinc-500";

export type AddressSelection = {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  lat: number;
  lng: number;
};

type MapTilerContextItem = { id: string; text: string; place_designation?: string };
type MapTilerFeature = {
  place_name?: string;
  text?: string;
  address?: string;
  place_type?: string[];
  center?: [number, number];
  context?: MapTilerContextItem[];
};

function parseFeature(feature: MapTilerFeature): AddressSelection {
  const context = feature.context ?? [];
  const find = (prefix: string) => context.find((c) => c.id?.startsWith(prefix))?.text ?? "";
  // MapTiler's OSM-backed geocoder doesn't put the city under a consistent id —
  // e.g. for NYC addresses "place.*" is the neighbourhood ("Inwood") while the actual
  // city/borough lives under "subregion.*"/"joint_municipality.*" tagged with
  // place_designation. Prefer that designation when present; fall back to the old
  // place/locality lookup for geocoders/features that don't set it.
  const findByDesignation = (designation: string) =>
    context.find((c) => c.place_designation === designation)?.text ?? "";
  const [lng, lat] = feature.center ?? [0, 0];
  const addressLine1 = feature.place_type?.includes("address")
    ? [feature.address, feature.text].filter(Boolean).join(" ")
    : (feature.place_name ?? feature.text ?? "").split(",")[0];

  return {
    addressLine1,
    city: findByDesignation("city") || findByDesignation("suburb") || find("place.") || find("locality."),
    state: find("region."),
    postalCode: find("postal_code."),
    country: find("country."),
    lat,
    lng,
  };
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (selection: AddressSelection) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<{ label: string; feature: MapTilerFeature }[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipNextFetchRef = useRef(false);
  const userEditedRef = useRef(false);

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    // Don't fetch/open suggestions just because `value` was populated from an
    // existing record on mount (e.g. editing a partner business) — only once
    // the user actually types into the field.
    if (!userEditedRef.current) return;
    if (!MAPTILER_KEY || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.maptiler.com/geocoding/${encodeURIComponent(value.trim())}.json?key=${MAPTILER_KEY}&autocomplete=true&limit=5`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        const features: MapTilerFeature[] = data.features ?? [];
        setSuggestions(features.map((f) => ({ label: f.place_name ?? f.text ?? "", feature: f })));
        setOpen(true);
      } catch {
        // ignore aborted/failed lookups — user can still type the address manually
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (feature: MapTilerFeature, label: string) => {
    const selection = parseFeature(feature);
    skipNextFetchRef.current = true;
    onChange(selection.addressLine1 || label);
    onSelect(selection);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        className={inputCls}
        value={value}
        onChange={(e) => {
          userEditedRef.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-elevation-3 max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleSelect(s.feature, s.label)}
                className="w-full text-left px-3 py-2 min-h-11 text-sm text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 transition-[background-color,transform] duration-150 active:scale-[0.98] touch-manipulation"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
