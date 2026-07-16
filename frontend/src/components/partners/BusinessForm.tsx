"use client";

import { useRef, useState } from "react";
import AddressAutocomplete from "@/app/admin/AddressAutocomplete";
import BusinessLocationMapPicker from "@/app/admin/BusinessLocationMapPicker";

const inputCls = "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500";

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

export type BusinessFormInitial = {
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
  social_links: BusinessSocialLinks | null;
};

export type BusinessFormPayload = {
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
  social_links: BusinessSocialLinks | null;
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
  const [addressLine1, setAddressLine1] = useState(initial?.address_line1 ?? "");
  const [addressLine2, setAddressLine2] = useState(initial?.address_line2 ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState(initial?.state ?? "");
  const [postalCode, setPostalCode] = useState(initial?.postal_code ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [lat, setLat] = useState<number | null>(initial?.lat ?? null);
  const [lng, setLng] = useState<number | null>(initial?.lng ?? null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState(initial?.google_maps_url ?? "");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
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
        address_line1: addressLine1.trim() || null,
        address_line2: addressLine2.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        postal_code: postalCode.trim() || null,
        country: country.trim() || null,
        lat,
        lng,
        google_maps_url: googleMapsUrl.trim() || null,
        social_links: hasSocial ? socialLinks : null,
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
    <form onSubmit={handleSubmit} className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/40 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Logo</label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500 transition-colors group shrink-0"
            >
              {displayLogo ? (
                <img src={displayLogo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full text-2xl font-black text-zinc-300">
                  {name ? name[0].toUpperCase() : "?"}
                </span>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Location</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-zinc-500">Address line 1</label>
            <AddressAutocomplete
              value={addressLine1}
              onChange={setAddressLine1}
              onSelect={(s) => {
                setAddressLine1(s.addressLine1);
                if (s.city) setCity(s.city);
                if (s.state) setState(s.state);
                if (s.postalCode) setPostalCode(s.postalCode);
                if (s.country) setCountry(s.country);
                setLat(s.lat);
                setLng(s.lng);
              }}
              placeholder="Start typing a street address..."
            />
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-zinc-500">Address line 2</label>
            <input className={inputCls} value={addressLine2} onChange={e => setAddressLine2(e.target.value)} placeholder="Suite, unit, etc." />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">City</label>
            <input className={inputCls} value={city} onChange={e => setCity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">State</label>
            <input className={inputCls} value={state} onChange={e => setState(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Postal code</label>
            <input className={inputCls} value={postalCode} onChange={e => setPostalCode(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Country</label>
            <input className={inputCls} value={country} onChange={e => setCountry(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-zinc-500">Google Maps URL</label>
            <input className={inputCls} value={googleMapsUrl} onChange={e => setGoogleMapsUrl(e.target.value)} placeholder="https://maps.google.com/..." />
          </div>
        </div>
        <BusinessLocationMapPicker lat={lat} lng={lng} onChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }} />
      </div>

      <div className="space-y-3 border-t border-zinc-800 pt-4">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Social links</p>
        {SOCIAL_PLATFORMS.map((p) => (
          <div key={p.key} className="space-y-1">
            <label className="text-xs text-zinc-500">{p.label}</label>
            <div className="flex items-center rounded-lg bg-zinc-900 border border-zinc-700 focus-within:border-zinc-500 transition-colors overflow-hidden">
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
          {campaigns.length === 0 && <p className="text-xs text-zinc-600">No campaigns yet.</p>}
          <div className="flex flex-wrap gap-2">
            {campaigns.map((c) => (
              <label
                key={c.id}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                  campaignIds.has(c.id)
                    ? "bg-emerald-900/40 border-emerald-700/60 text-emerald-300"
                    : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600"
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
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
        >
          {loading ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
