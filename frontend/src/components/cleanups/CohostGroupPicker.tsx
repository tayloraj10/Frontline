"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface GroupOption {
  id: string;
  name: string;
}

export default function CohostGroupPicker({
  primaryGroupId,
  value,
  onChange,
}: {
  primaryGroupId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("groups")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }) => setGroups((data ?? []) as GroupOption[]));
  }, []);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .filter((g) => g.id !== primaryGroupId)
      .filter((g) => !q || g.name.toLowerCase().includes(q));
  }, [groups, query, primaryGroupId]);

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...value, id] : value.filter((existing) => existing !== id));
  };

  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-500">Co-hosting groups (optional)</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search groups..."
        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
      />
      <div className="max-h-40 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg divide-y divide-zinc-800">
        {options.length === 0 && (
          <p className="px-3 py-2 text-xs text-zinc-600">No groups found.</p>
        )}
        {options.map((g) => (
          <label
            key={g.id}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={value.includes(g.id)}
              onChange={(e) => toggle(g.id, e.target.checked)}
            />
            {g.name}
          </label>
        ))}
      </div>
    </div>
  );
}
