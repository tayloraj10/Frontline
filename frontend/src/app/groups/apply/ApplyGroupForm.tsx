"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FlowGuide from "@/components/walkthrough/FlowGuide";
import { FlowFooter } from "@/components/ui/FlowSheet";
import { Field, TextInput, TextArea } from "@/components/ui/fields";

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

const STEPS = ["The basics", "About", "Links"];

export default function ApplyGroupForm({ userId }: { userId: string }) {
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
  const [step, setStep] = useState(0);

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

  const handleSubmit = async () => {
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
          status: "pending",
        })
        .select("id, slug")
        .single();

      if (insertErr) {
        setError(insertErr.code === "23505" ? "That slug is already taken. Try a different name." : insertErr.message);
        setLoading(false);
        return;
      }

      router.push(`/groups/${group.slug}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setLoading(false);
    }
  };

  const blocked = step === 0 && (!name.trim() || !slug.trim()) ? "Add a name to continue" : null;
  const last = step === STEPS.length - 1;

  return (
    <main className="max-w-lg mx-auto px-4 sm:px-6 py-10 sm:py-16 w-full">
      <div className="mb-6">
        <h1 className="font-display font-extrabold text-3xl tracking-tight text-zinc-100">Add your group</h1>
        <p className="text-zinc-500 mt-2 text-sm">
          Already running a crew? Add it here. A site admin will review it before it is listed.
        </p>
        <div className="mt-2">
          <FlowGuide id="organizer" variant="link" label="How does running a group work?" />
        </div>
      </div>

      <div className="rounded-3xl bg-zinc-900 ring-1 ring-white/10 p-5 space-y-5">
        <div>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((label, n) => (
              <span key={label} className={`h-1 flex-1 rounded-full transition-colors duration-200 ${n <= step ? "bg-zinc-100" : "bg-zinc-700"}`} />
            ))}
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Step {step + 1} of {STEPS.length}</p>
          <h2 className="text-xl font-black text-zinc-100 tracking-tight">{STEPS[step]}</h2>
        </div>

        {step === 0 && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Choose group logo"
                className="relative w-20 h-20 rounded-2xl overflow-hidden bg-zinc-800 ring-1 ring-inset ring-white/10 active:scale-[0.95] transition-transform duration-150 touch-manipulation group shrink-0"
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="flex items-center justify-center w-full h-full text-3xl font-black text-zinc-300">
                    {(name || "?")[0].toUpperCase()}
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
                <p className="text-sm font-semibold text-zinc-200">Group logo</p>
                <p>Optional. JPG, PNG or WebP, max 5 MB</p>
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoChange} />
            </div>

            <Field label="Group name">
              <TextInput
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                maxLength={80}
                placeholder="Riverside Cleanup Crew"
              />
            </Field>

            <Field label="Web address" hint={`frontline.app/groups/${slug || "your-group"}`}>
              <TextInput
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                maxLength={60}
                placeholder="riverside-cleanup"
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <Field label="Description" optional hint="Who you are and what you are about.">
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={400}
              placeholder="We clean up the riverfront every Saturday morning."
            />
          </Field>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label="Website" optional>
              <TextInput type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourorg.org" />
            </Field>
            {SOCIAL_PLATFORMS.map((p) => (
              <Field key={p.key} label={p.label} optional>
                <div className="flex items-center rounded-2xl bg-zinc-800 ring-1 ring-inset ring-white/5 focus-within:ring-2 focus-within:ring-zinc-400 transition-shadow overflow-hidden">
                  <span className="pl-4 text-sm text-zinc-500 select-none">{p.baseUrl.replace(/^https?:\/\//, "")}</span>
                  <input
                    type="text"
                    value={handles[p.key] ?? ""}
                    onChange={(e) => setHandles((prev) => ({ ...prev, [p.key]: e.target.value.replace(/^@/, "") }))}
                    placeholder="yourorg"
                    className="flex-1 min-w-0 min-h-12 bg-transparent px-2 py-2 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                  />
                </div>
              </Field>
            ))}
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <FlowFooter
          onBack={step > 0 ? () => setStep((n) => n - 1) : undefined}
          primaryLabel={last ? (loading ? "Submitting..." : "Submit group") : "Next"}
          onPrimary={last ? handleSubmit : () => setStep((n) => n + 1)}
          primaryDisabled={last ? loading || !name.trim() || !slug.trim() : !!blocked}
          hint={last ? null : blocked}
        />
      </div>
    </main>
  );
}
