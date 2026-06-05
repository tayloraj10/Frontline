"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugEdited) setSlug(toSlug(val));
  };

  const handleSlugChange = (val: string) => {
    setSlug(toSlug(val));
    setSlugEdited(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { data: group, error: insertErr } = await supabase
      .from("groups")
      .insert({ name: name.trim(), slug, description: description.trim() || null, website: website.trim() || null, created_by: userId })
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
  };

  return (
    <main className="max-w-lg mx-auto px-6 py-16 w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-zinc-100">Create a Group</h1>
        <p className="text-zinc-500 mt-2 text-sm">Organize your crew and compete together.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
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

        <div className="space-y-1.5">
          <label className="text-sm text-zinc-300">Website <span className="text-zinc-600">(optional)</span></label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yourorg.org"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors text-zinc-100 placeholder:text-zinc-600"
          />
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
