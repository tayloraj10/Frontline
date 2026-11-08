"use client";

import { useEffect, useState } from "react";
import type { AdminRole } from "@/lib/adminRoles";
import { createClient } from "@/lib/supabase/client";

type UserSearchResult = { id: string; username: string | null; email: string };
type AdminPerson = { user_id: string; username: string | null; email: string; emails_on: boolean };
type RoleHolder = { user_id: string; username: string | null; email: string; roles: AdminRole[] };

const ROLE_OPTIONS: { value: AdminRole; label: string; description: string }[] = [
  { value: "group_approver", label: "Group approver", description: "Can approve/reject group applications" },
  { value: "business_approver", label: "Business approver", description: "Can approve/reject partner business applications" },
  { value: "event_manager", label: "Event manager", description: "Can create and manage Team Events" },
];

const inputCls = "min-h-11 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-emerald-600 transition-colors duration-150";
const cardCls = "rounded-2xl border border-zinc-800/40 bg-zinc-900/60 shadow-elevation-1 p-5 space-y-4";
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
  const [siteAdmins, setSiteAdmins] = useState<AdminPerson[]>([]);
  const [holders, setHolders] = useState<RoleHolder[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/admin/roles?requesting_user_id=${requestingUserId}`
        );
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setSiteAdmins(data.site_admins as AdminPerson[]);
        setHolders(data.scoped as RoleHolder[]);
      } catch (err) {
        setError(extractErrorMessage(err, "Failed to load admins"));
      }
    })();
  }, [requestingUserId]);

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

  const handleToggleEmails = async (person: AdminPerson) => {
    const next = !person.emails_on;
    setSavingId(person.user_id);
    setError(null);
    const { error: err } = await createClient()
      .from("profiles")
      .update({ admin_daily_email_opt_out: !next })
      .eq("id", person.user_id);
    setSavingId(null);
    if (err) {
      setError("Could not save your email setting. Try again.");
      return;
    }
    setSiteAdmins((prev) =>
      prev.map((a) => (a.user_id === person.user_id ? { ...a, emails_on: next } : a))
    );
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
        <h2 className={sectionTitleCls}>Site admins ({siteAdmins.length})</h2>
        <p className="text-xs text-zinc-500 -mt-2">
          Full admin access, including every scoped role below. Each admin can turn their own admin
          emails (daily action list and Monday summary) on or off here or in Settings, Account.
        </p>
        {siteAdmins.length === 0 ? (
          <p className="text-sm text-zinc-600">None loaded.</p>
        ) : (
          <ul className="space-y-1.5">
            {siteAdmins.map((a) => (
              <li key={a.user_id} className="flex items-center justify-between gap-3 text-sm text-zinc-200">
                <span className="min-w-0 truncate">
                  {a.username ?? a.email} <span className="text-zinc-600">({a.email})</span>
                </span>
                {a.user_id === requestingUserId ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={a.emails_on}
                    disabled={savingId === a.user_id}
                    onClick={() => handleToggleEmails(a)}
                    aria-label="Admin emails"
                    className="min-h-11 shrink-0 flex items-center gap-2.5 disabled:opacity-60"
                  >
                    <span className={`text-xs font-semibold ${a.emails_on ? "text-emerald-300" : "text-zinc-500"}`}>
                      Admin emails {a.emails_on ? "on" : "off"}
                    </span>
                    <span
                      className={`relative inline-block h-6 w-11 rounded-full transition-colors duration-150 ${
                        a.emails_on ? "bg-emerald-600" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${
                          a.emails_on ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </span>
                  </button>
                ) : (
                  <span className={`shrink-0 text-xs ${a.emails_on ? "text-emerald-400" : "text-zinc-600"}`}>
                    Admin emails {a.emails_on ? "on" : "off"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

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
          <h2 className={sectionTitleCls}>Assigned ({holders.length})</h2>
          <div className="space-y-4">
            {holders.map((h) => (
              <div key={h.user_id} className="rounded-[20px] bg-zinc-900 px-4 py-3 space-y-2">
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
