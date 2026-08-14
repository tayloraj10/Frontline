"use client";

import { useRef, useState } from "react";
import AddressAutocomplete from "@/app/admin/AddressAutocomplete";
import BusinessLocationMapPicker from "@/app/admin/BusinessLocationMapPicker";

const inputCls = "w-full min-h-11 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm shadow-elevation-1 focus:outline-none focus:border-zinc-500";

let nextLocalLocationId = 0;

export type LocationEntry = {
  key: string;
  id: string | null;
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
};

function emptyLocation(): LocationEntry {
  nextLocalLocationId += 1;
  return {
    key: `new-${nextLocalLocationId}`,
    id: null,
    label: null,
    address_line1: null,
    address_line2: null,
    city: null,
    state: null,
    postal_code: null,
    country: null,
    lat: null,
    lng: null,
    google_maps_url: null,
  };
}

function toSlug(name: string) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export type BusinessSocialLinks = {
  website?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  facebook?: string | null;
  twitter?: string | null;
};

export type LocationFormInitial = {
  id: string;
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
};

export type LocationPayload = {
  id: string | null;
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
};

export type BusinessFormInitial = {
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  social_links: BusinessSocialLinks | null;
  locations?: LocationFormInitial[];
};

export type BusinessFormPayload = {
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  social_links: BusinessSocialLinks | null;
  locations: LocationPayload[];
  campaignIds: string[];
};

const SOCIAL_PLATFORMS: { key: keyof BusinessSocialLinks; label: string; baseUrl: string }[] = [
  { key: "instagram", label: "Instagram", baseUrl: "https://instagram.com/" },
  { key: "tiktok", label: "TikTok", baseUrl: "https://tiktok.com/@" },
  { key: "youtube", label: "YouTube", baseUrl: "https://youtube.com/@" },
  { key: "facebook", label: "Facebook", baseUrl: "https://facebook.com/" },
  { key: "twitter", label: "Twitter / X", baseUrl: "https://x.com/" },
];

function extractHandle(url: string | null | undefined, baseUrl: string): string {
  if (!url) return "";
  return url.startsWith(baseUrl) ? url.slice(baseUrl.length) : url.replace(/^https?:\/\/(www\.)?[^/]+\/@?/, "");
}

export async function uploadPartnerLogo(file: File): Promise<string> {
  const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  const res = await fetch(
    `${fastApiUrl}/api/upload/presign?filename=${encodeURIComponent(file.name)}&content_type=${encodeURIComponent(file.type)}&kind=partners`
  );
  if (!res.ok) throw new Error("Failed to get upload URL");
  const { upload_url, public_url } = await res.json();
  const uploadRes = await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!uploadRes.ok) throw new Error("Logo upload failed");
  return public_url;
}

export default function BusinessForm({ initial, initialCampaignIds, campaigns, onSubmit, onCancel, submitLabel }: {
  initial?: BusinessFormInitial;
  initialCampaignIds?: string[];
  campaigns?: { id: string; title: string }[];
  onSubmit: (payload: BusinessFormPayload) => Promise<string | null>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(!!initial);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initial?.website_url ?? "");
  const [locations, setLocations] = useState<LocationEntry[]>(() =>
    (initial?.locations ?? []).map((l) => ({
      key: l.id,
      id: l.id,
      label: l.label,
      address_line1: l.address_line1,
      address_line2: l.address_line2,
      city: l.city,
      state: l.state,
      postal_code: l.postal_code,
      country: l.country,
      lat: l.lat,
      lng: l.lng,
      google_maps_url: l.google_maps_url,
    }))
  );
  const [handles, setHandles] = useState<Record<string, string>>(
    Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.key, extractHandle(initial?.social_links?.[p.key], p.baseUrl)]))
  );
  const [currentLogo, setCurrentLogo] = useState(initial?.logo_url ?? null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [campaignIds, setCampaignIds] = useState<Set<string>>(new Set(initialCampaignIds ?? []));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugEdited) setSlug(toSlug(val));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const toggleCampaign = (id: string) => {
    setCampaignIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const updateLocation = (key: string, patch: Partial<LocationEntry>) => {
    setLocations((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const addLocation = () => setLocations((prev) => [...prev, emptyLocation()]);
  const removeLocation = (key: string) => setLocations((prev) => prev.filter((l) => l.key !== key));

  const isLocationFilled = (l: LocationEntry) =>
    !!(l.label?.trim() || l.address_line1?.trim() || l.city?.trim() || l.state?.trim() ||
      l.postal_code?.trim() || l.google_maps_url?.trim() || l.lat != null || l.lng != null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    const filledLocations = locations.filter(isLocationFilled);
    const missingCoords = filledLocations.some((l) => l.lat == null || l.lng == null);
    if (missingCoords) {
      setError("Each location needs a map position — pick an address suggestion or drop the pin on the map.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let logoUrl = currentLogo;
      if (logoFile) logoUrl = await uploadPartnerLogo(logoFile);
      setCurrentLogo(logoUrl);
      setLogoFile(null);
      setLogoPreview(null);

      const socialLinks: BusinessSocialLinks = {
        website: websiteUrl.trim() || null,
        ...Object.fromEntries(
          SOCIAL_PLATFORMS.map((p) => {
            const handle = handles[p.key]?.trim().replace(/^@/, "");
            return [p.key, handle ? `${p.baseUrl}${handle}` : null];
          })
        ),
      };
      const hasSocial = !!socialLinks.website || SOCIAL_PLATFORMS.some((p) => !!socialLinks[p.key]);

      const err = await onSubmit({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        logo_url: logoUrl,
        website_url: websiteUrl.trim() || null,
        social_links: hasSocial ? socialLinks : null,
        locations: filledLocations.map((l) => ({
          id: l.id,
          label: l.label?.trim() || null,
          address_line1: l.address_line1?.trim() || null,
          address_line2: l.address_line2?.trim() || null,
          city: l.city?.trim() || null,
          state: l.state?.trim() || null,
          postal_code: l.postal_code?.trim() || null,
          country: l.country?.trim() || null,
          lat: l.lat,
          lng: l.lng,
          google_maps_url: l.google_maps_url?.trim() || null,
        })),
        campaignIds: Array.from(campaignIds),
      });

      setLoading(false);
      if (err) setError(err);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setLoading(false);
    }
  };

  const displayLogo = logoPreview ?? currentLogo;

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/40 shadow-elevation-2 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Logo</label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 border-2 border-zinc-700 shadow-elevation-1 hover:border-zinc-500 transition-[border-color,transform] duration-150 active:scale-[0.95] touch-manipulation group shrink-0"
            >
              {displayLogo ? (
                <img src={displayLogo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full text-2xl font-black text-zinc-300">
                  {name ? name[0].toUpperCase() : "?"}
                </span>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>
            <div className="text-xs text-zinc-500 space-y-0.5">
              <p>JPG, PNG or WebP</p>
              <p>Max 5 MB</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoChange} />
        </div>

        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Name</label>
          <input className={inputCls} value={name} onChange={e => handleNameChange(e.target.value)} required placeholder="Business name" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Slug</label>
          <input className={inputCls} value={slug} onChange={e => { setSlug(toSlug(e.target.value)); setSlugEdited(true); }} required placeholder="business-slug" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Description</label>
          <textarea className={`${inputCls} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Website URL</label>
          <input className={inputCls} value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <div className="space-y-3 border-t border-zinc-800 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Locations</p>
          <button
            type="button"
            onClick={addLocation}
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            + Add location
          </button>
        </div>
        {locations.length === 0 && (
          <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2">
            No locations set — this business won't show up on the map until at least one
            location is added with an address (or coordinates set on the map).
          </p>
        )}
        {locations.map((loc, idx) => (
          <div key={loc.key} className="space-y-3 border border-zinc-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">Location {idx + 1}</p>
              <button
                type="button"
                onClick={() => removeLocation(loc.key)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Label (optional)</label>
              <input
                className={inputCls}
                value={loc.label ?? ""}
                onChange={(e) => updateLocation(loc.key, { label: e.target.value })}
                placeholder="e.g. Downtown"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-zinc-500">Address line 1</label>
                <AddressAutocomplete
                  value={loc.address_line1 ?? ""}
                  onChange={(v) => updateLocation(loc.key, { address_line1: v })}
                  onSelect={(s) => {
                    updateLocation(loc.key, {
                      address_line1: s.addressLine1,
                      city: s.city || loc.city,
                      state: s.state || loc.state,
                      postal_code: s.postalCode || loc.postal_code,
                      country: s.country || loc.country,
                      lat: s.lat,
                      lng: s.lng,
                    });
                  }}
                  placeholder="Start typing a street address..."
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-zinc-500">Address line 2</label>
                <input className={inputCls} value={loc.address_line2 ?? ""} onChange={e => updateLocation(loc.key, { address_line2: e.target.value })} placeholder="Suite, unit, etc." />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">City</label>
                <input className={inputCls} value={loc.city ?? ""} onChange={e => updateLocation(loc.key, { city: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">State</label>
                <input className={inputCls} value={loc.state ?? ""} onChange={e => updateLocation(loc.key, { state: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Postal code</label>
                <input className={inputCls} value={loc.postal_code ?? ""} onChange={e => updateLocation(loc.key, { postal_code: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Country</label>
                <input className={inputCls} value={loc.country ?? ""} onChange={e => updateLocation(loc.key, { country: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-zinc-500">Google Maps URL</label>
                <input className={inputCls} value={loc.google_maps_url ?? ""} onChange={e => updateLocation(loc.key, { google_maps_url: e.target.value })} placeholder="https://maps.google.com/..." />
              </div>
            </div>
            <BusinessLocationMapPicker
              lat={loc.lat}
              lng={loc.lng}
              onChange={(newLat, newLng) => updateLocation(loc.key, { lat: newLat, lng: newLng })}
            />
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-zinc-800 pt-4">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Social links</p>
        {SOCIAL_PLATFORMS.map((p) => (
          <div key={p.key} className="space-y-1">
            <label className="text-xs text-zinc-500">{p.label}</label>
            <div className="flex items-center rounded-lg bg-zinc-900 border border-zinc-700 shadow-elevation-1 focus-within:border-zinc-500 transition-colors overflow-hidden">
              <span className="pl-3 text-sm text-zinc-500 select-none">{p.baseUrl.replace(/^https?:\/\//, "")}</span>
              <input
                type="text"
                value={handles[p.key] ?? ""}
                onChange={e => setHandles(h => ({ ...h, [p.key]: e.target.value }))}
                placeholder="handle"
                className="flex-1 bg-transparent px-2 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
              />
            </div>
          </div>
        ))}
      </div>

      {campaigns && (
        <div className="space-y-2 border-t border-zinc-800 pt-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Campaigns</p>
          <p className="text-xs text-zinc-600">Only visible to site admins &mdash; other partner admins won&apos;t see this section.</p>
          {campaigns.length === 0 && <p className="text-xs text-zinc-600">No campaigns yet.</p>}
          <div className="flex flex-wrap gap-2">
            {campaigns.map((c) => (
              <label
                key={c.id}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer shadow-elevation-1 transition-[background-color,border-color,transform] duration-150 active:scale-[0.95] touch-manipulation ${
                  campaignIds.has(c.id)
                    ? "bg-emerald-900/40 border-emerald-700/60 text-emerald-300"
                    : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600 active:border-zinc-600"
                }`}
              >
                <input type="checkbox" className="hidden" checked={campaignIds.has(c.id)} onChange={() => toggleCampaign(c.id)} />
                {c.title}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || !name.trim() || !slug.trim()}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm rounded-lg font-medium shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 touch-manipulation"
        >
          {loading ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-[color,transform] duration-150 active:scale-[0.96] touch-manipulation">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
