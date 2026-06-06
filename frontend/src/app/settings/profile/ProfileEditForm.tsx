"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  userId: string;
  username: string;
  displayName: string | null;
  bio: string | null;
}

export default function ProfileEditForm({ userId, username, displayName, bio }: Props) {
  const router = useRouter();
  const [display, setDisplay] = useState(displayName ?? "");
  const [bioVal, setBioVal] = useState(bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        display_name: display.trim() || null,
        bio: bioVal.trim() || null,
      })
      .eq("id", userId);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push(`/users/${username}`);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
