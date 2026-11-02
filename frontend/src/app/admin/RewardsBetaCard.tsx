"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tester = { id: string; username: string | null };
type UserSearchResult = { id: string; username: string | null; email: string };

const inputCls = "min-h-11 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-emerald-600 transition-colors duration-150";

/** Admin control for profiles.rewards_beta: who can open Earn, Hire and Impact before payments go live. */
export default function RewardsBetaCard() {
  const [testers, setTesters] = useState<Tester[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await createClient()
      .schema("public")
      .from("profiles")
      .select("id, username")
      .eq("rewards_beta", true)
      .order("username");
    if (e) setError(e.message);
    else setTesters(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query.trim())}`);
      setResults(res.ok ? await res.json() : []);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function setBeta(id: string, on: boolean) {
    setBusyId(id);
    setError(null);
    const { error: e } = await createClient().schema("public").from("profiles").update({ rewards_beta: on }).eq("id", id);
    setBusyId(null);
    if (e) return setError(e.message);
    setQuery("");
    setResults([]);
    await load();
  }

  return (
    <div className="max-w-2xl rounded-2xl border border-zinc-800/40 bg-zinc-900/60 shadow-elevation-1 p-5 space-y-4">
      <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Rewards beta testers</h2>
      <p className="text-xs text-zinc-500 -mt-2">
        These users can open Earn, Hire and Impact (and see the Rewards tabs) before Payments enabled is turned on.
        Perks and every other payments surface are not affected. Hire still needs marketplace_enabled.
      </p>
      <input className={`${inputCls} w-full`} placeholder="Search by username or email..." value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.length > 0 && (
        <ul className="rounded-lg border border-zinc-800 bg-zinc-950 max-h-56 overflow-y-auto">
          {results.map((u) => (
            <li key={u.id}>
              <button
                disabled={busyId === u.id}
                onClick={() => setBeta(u.id, true)}
                className="w-full min-h-11 text-left px-3 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                Add {u.username ?? u.email}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      {testers.length === 0 ? (
        <p className="text-xs text-zinc-600">No beta testers yet.</p>
      ) : (
        <ul className="space-y-2">
          {testers.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 text-sm text-zinc-200">
              <span className="truncate">{t.username ?? t.id}</span>
              <button disabled={busyId === t.id} onClick={() => setBeta(t.id, false)} className="min-h-11 px-3 text-xs font-bold text-red-300 disabled:opacity-50">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
