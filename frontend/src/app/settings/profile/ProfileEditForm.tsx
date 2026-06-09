"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  userId: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
}

export default function ProfileEditForm({ userId, username, displayName, bio, avatarUrl }: Props) {
  const router = useRouter();
  const [display, setDisplay] = useState(displayName ?? "");
  const [bioVal, setBioVal] = useState(bio ?? "");
  const [currentAvatar, setCurrentAvatar] = useState(avatarUrl);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const uploadAvatar = async (file: File): Promise<string> => {
    const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
    const res = await fetch(
      `${fastApiUrl}/api/upload/presign?filename=${encodeURIComponent(file.name)}&content_type=${encodeURIComponent(file.type)}`
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
    setSaving(true);
    setError(null);

    try {
      let newAvatarUrl = currentAvatar;

      if (avatarFile) {
        newAvatarUrl = await uploadAvatar(avatarFile);
      }

      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          display_name: display.trim() || null,
          bio: bioVal.trim() || null,
          avatar_url: newAvatarUrl,
        })
        .eq("id", userId);

      if (updateError) throw new Error(updateError.message);

      setCurrentAvatar(newAvatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      router.push(`/users/${username}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const displayAvatar = avatarPreview ?? currentAvatar;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Avatar */}
      <div>
        <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
          Profile photo
        </label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500 transition-colors group shrink-0"
          >
            {displayAvatar ? (
              <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="flex items-center justify-center w-full h-full text-2xl font-black text-zinc-300">
                {(displayName ?? username)[0].toUpperCase()}
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
          onChange={handleAvatarChange}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
          Display name
        </label>
        <input
          type="text"
          value={display}
          onChange={(e) => setDisplay(e.target.value)}
          maxLength={60}
          placeholder={username}
          className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
        />
        <p className="mt-1 text-xs text-zinc-600">Shown on your profile and leaderboards. Defaults to your username.</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
          Bio
        </label>
        <textarea
          value={bioVal}
          onChange={(e) => setBioVal(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="Tell the community something about yourself…"
          className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
        />
        <p className="mt-1 text-xs text-zinc-600">{bioVal.length}/200</p>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-zinc-100 text-zinc-900 text-sm font-semibold rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/users/${username}`)}
          className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
