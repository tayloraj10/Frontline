"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SOCIAL_PLATFORMS: { key: string; label: string; baseUrl: string }[] = [
  { key: "instagram", label: "Instagram", baseUrl: "https://instagram.com/" },
  { key: "tiktok", label: "TikTok", baseUrl: "https://tiktok.com/@" },
  { key: "youtube", label: "YouTube", baseUrl: "https://youtube.com/@" },
  { key: "facebook", label: "Facebook", baseUrl: "https://facebook.com/" },
  { key: "twitter", label: "Twitter / X", baseUrl: "https://x.com/" },
];

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function CreateGroupForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [handles, setHandles] = useState<Record<string, string>>(
    Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.key, ""]))
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugEdited) setSlug(toSlug(val));
  };

  const handleSlugChange = (val: string) => {
    setSlug(toSlug(val));
    setSlugEdited(true);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async (file: File): Promise<string> => {
    const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
    const res = await fetch(
      `${fastApiUrl}/api/upload/presign?filename=${encodeURIComponent(file.name)}&content_type=${encodeURIComponent(file.type)}&kind=groups`
    );
    if (!res.ok) throw new Error("Failed to get upload URL");
    const { upload_url, public_url } = await res.json();
    const uploadRes = await fetch(upload_url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!uploadRes.ok) throw new Error("Upload failed");
    return public_url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setLoading(true);
    setError(null);

    try {
      let logoUrl: string | null = null;
      if (logoFile) logoUrl = await uploadLogo(logoFile);

      const supabase = createClient();

      const { data: group, error: insertErr } = await supabase
        .from("groups")
        .insert({
          name: name.trim(),
          slug,
          description: description.trim() || null,
          social_links: {
            website: website.trim() || null,
            ...Object.fromEntries(
              SOCIAL_PLATFORMS.map((p) => {
                const handle = handles[p.key]?.trim().replace(/^@/, "");
                return [p.key, handle ? `${p.baseUrl}${handle}` : null];
              })
            ),
          },
          image_url: logoUrl,
          created_by: userId,
        })
        .select("id, slug")
        .single();

      if (insertErr) {
        setError(insertErr.code === "23505" ? "That slug is already taken. Try a different name." : insertErr.message);
        setLoading(false);
        return;
      }

      const { error: memberErr } = await supabase
        .from("group_members")
        .insert({ group_id: group.id, user_id: userId, role: "admin" });

      if (memberErr) {
        setError(memberErr.message);
        setLoading(false);
        return;
      }

      router.push(`/groups/${group.slug}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
      setLoading(false);
    }
  };

  return (
    <main className="max-w-lg mx-auto px-6 py-16 w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-zinc-100">Create a Group</h1>
        <p className="text-zinc-500 mt-2 text-sm">Organize your crew and compete together.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
            Group logo
          </label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500 transition-colors group shrink-0"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full text-2xl font-black text-zinc-300">
                  {(name || "?")[0].toUpperCase()}
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
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleLogoChange}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-zinc-300">Group name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            maxLength={80}
            placeholder="Riverside Cleanup Crew"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors text-zinc-100 placeholder:text-zinc-600"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-zinc-300">Slug</label>
          <div className="flex items-center gap-0">
            <span className="px-3 py-2 bg-zinc-800 border border-r-0 border-zinc-700 rounded-l-lg text-zinc-500 text-sm">
              frontline.app/groups/
            </span>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              required
              maxLength={60}
              placeholder="riverside-cleanup"
              className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-r-lg text-sm outline-none transition-colors text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-zinc-300">Description <span className="text-zinc-600">(optional)</span></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder="Who you are and what you're about."
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors text-zinc-100 placeholder:text-zinc-600 resize-none"
          />
        </div>

        <div className="space-y-4">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Social links
          </label>
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourorg.org"
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>
          {SOCIAL_PLATFORMS.map((p) => (
            <div key={p.key}>
              <label className="block text-xs text-zinc-500 mb-1.5">{p.label}</label>
              <div className="flex items-center rounded-lg bg-zinc-800 border border-zinc-700 focus-within:border-zinc-500 transition-colors overflow-hidden">
                <span className="pl-3 text-sm text-zinc-500 select-none">{p.baseUrl.replace(/^https?:\/\//, "")}</span>
                <input
                  type="text"
                  value={handles[p.key] ?? ""}
                  onChange={(e) => setHandles((prev) => ({ ...prev, [p.key]: e.target.value.replace(/^@/, "") }))}
                  placeholder="yourorg"
                  className="flex-1 px-2 py-2.5 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || !name.trim() || !slug.trim()}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
        >
          {loading ? "Creating…" : "Create Group"}
        </button>
      </form>
    </main>
  );
}
