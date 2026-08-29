"use client";

import { useEffect, useState } from "react";
import type { AdminRole } from "@/lib/adminRoles";

type UserSearchResult = { id: string; username: string | null; email: string };
type RoleHolder = { user_id: string; username: string | null; email: string; roles: AdminRole[] };

const ROLE_OPTIONS: { value: AdminRole; label: string; description: string }[] = [
  { value: "group_approver", label: "Group approver", description: "Can approve/reject group applications" },
  { value: "business_approver", label: "Business approver", description: "Can approve/reject partner business applications" },
  { value: "event_manager", label: "Event manager", description: "Can create and manage Team Events" },
];

const inputCls = "min-h-11 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-emerald-600 transition-colors duration-150";
const cardCls = "rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-elevation-1 p-5 space-y-4";
const sectionTitleCls = "text-xs font-bold text-zinc-500 uppercase tracking-wider";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // not JSON
  }
  return err.message || fallback;
}

export default function AdminRolesTab({ requestingUserId }: { requestingUserId: string }) {
  const [holders, setHolders] = useState<RoleHolder[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query.trim())}`);
        setSearching(false);
        if (res.ok) {
          setError(null);
          setResults(await res.json());
        } else {
          const body = await res.json().catch(() => null);
          setError(body?.detail ?? "User search failed");
          setResults([]);
        }
      } catch {
        setSearching(false);
        setError("User search failed");
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const fetchRolesFor = async (user: UserSearchResult): Promise<AdminRole[]> => {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/admin/roles/${user.id}?requesting_user_id=${requestingUserId}`
    );
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.roles as AdminRole[];
  };

  const handleSelectUser = async (user: UserSearchResult) => {
    setError(null);
    setQuery("");
    setResults([]);
    if (holders.some((h) => h.user_id === user.id)) return;
    try {
      const roles = await fetchRolesFor(user);
      setHolders((prev) => [...prev, { user_id: user.id, username: user.username, email: user.email, roles }]);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load roles"));
    }
  };

  const handleToggleRole = async (holder: RoleHolder, role: AdminRole) => {
    const nextRoles = holder.roles.includes(role)
      ? holder.roles.filter((r) => r !== role)
      : [...holder.roles, role];
    setSavingId(holder.user_id);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/admin/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesting_user_id: requestingUserId,
          target_user_id: holder.user_id,
          roles: nextRoles,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setHolders((prev) =>
        prev.map((h) => (h.user_id === holder.user_id ? { ...h, roles: nextRoles } : h))
      );
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to update roles"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className={cardCls}>
        <h2 className={sectionTitleCls}>Scoped admin roles</h2>
        <p className="text-xs text-zinc-500 -mt-2">
          These roles grant limited admin powers to specific people, on top of the full Admin
          flag (unchanged, still grants every scoped role automatically). Search for a user to
          view or edit their roles.
        </p>
        <div className="relative">
          <input
            className={`${inputCls} w-full`}
            placeholder="Search by username or email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim().length >= 2 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 shadow-elevation-2 max-h-56 overflow-y-auto">
              {searching ? (
                <p className="text-xs text-zinc-600 px-3 py-2">Searching...</p>
              ) : results.length === 0 ? (
                <p className="text-xs text-zinc-600 px-3 py-2">No matching users.</p>
              ) : (
                results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleSelectUser(u)}
                    className="w-full text-left text-sm text-zinc-200 px-3 py-2 hover:bg-zinc-800 transition-colors duration-150"
                  >
                    {u.username ?? u.email} <span className="text-zinc-600">({u.email})</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {holders.length > 0 && (
        <div className={cardCls}>
          <h2 className={sectionTitleCls}>Assigned</h2>
          <div className="space-y-4">
            {holders.map((h) => (
              <div key={h.user_id} className="border border-zinc-800 rounded-xl px-4 py-3 space-y-2">
                <p className="text-sm font-semibold text-zinc-200">
                  {h.username ?? h.email} <span className="text-zinc-600 font-normal">({h.email})</span>
                </p>
                <div className="flex flex-col gap-1.5">
                  {ROLE_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2.5 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-emerald-600"
                        checked={h.roles.includes(opt.value)}
                        disabled={savingId === h.user_id}
                        onChange={() => handleToggleRole(h, opt.value)}
                      />
                      <span>
                        {opt.label}
                        <span className="text-zinc-600 ml-1.5 text-xs">{opt.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
