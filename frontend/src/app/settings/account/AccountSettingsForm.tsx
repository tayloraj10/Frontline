"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteAccount } from "./actions";

interface Props {
  email: string;
  isOAuthUser: boolean;
  provider: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
};

export default function AccountSettingsForm({ email, isOAuthUser, provider }: Props) {
  const providerLabel = PROVIDER_LABELS[provider] ?? provider;
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [logoutMsg, setLogoutMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const [exportLoading, setExportLoading] = useState<"json" | "csv" | null>(null);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const supabase = createClient();

  async function handleEmailChange(e: React.FormEvent) {
    e.preventDefault();
    setEmailLoading(true);
    setEmailMsg(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setEmailLoading(false);
    if (error) {
      setEmailMsg({ ok: false, text: error.message });
    } else {
      setEmailMsg({ ok: true, text: "Check your new email address for a confirmation link." });
      setNewEmail("");
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwLoading(true);
    setPwMsg(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInError) {
      setPwLoading(false);
      setPwMsg({ ok: false, text: "Current password is incorrect." });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);
    if (error) {
      setPwMsg({ ok: false, text: error.message });
    } else {
      setPwMsg({ ok: true, text: "Password updated successfully." });
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  function handleDeleteAccount() {
    setDeleteError(null);
    startTransition(async () => {
      try {
        await deleteAccount();
      } catch (err: unknown) {
        setDeleteError(err instanceof Error ? err.message : "Failed to delete account.");
      }
    });
  }

  async function handleDownloadData(format: "json" | "csv") {
    setExportError(null);
    setExportProgress(null);
    setExportLoading(format);
    try {
      const res = await fetch(`/api/account/export?format=${format}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? "Failed to export account data.");
      }

      const totalStr = res.headers.get("Content-Length");
      const total = totalStr ? parseInt(totalStr, 10) : null;
      const mimeType = format === "csv" ? "application/zip" : "application/json";

      let blob: Blob;
      if (res.body && total) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          setExportProgress(Math.min(100, Math.round((received / total) * 100)));
        }
        blob = new Blob(chunks as BlobPart[], { type: mimeType });
      } else {
        blob = await res.blob();
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `frontline-account-export.${format === "csv" ? "zip" : "json"}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Failed to export account data.");
    } finally {
      setExportLoading(null);
      setExportProgress(null);
    }
  }

  async function handleLogoutEverywhere() {
    setLogoutLoading(true);
    setLogoutMsg(null);
    const { error } = await supabase.auth.signOut({ scope: "global" });
    setLogoutLoading(false);
    if (error) {
      setLogoutMsg({ ok: false, text: error.message });
      return;
    }
    router.push("/login");
  }

  return (
    <div className="space-y-10">
      {/* Email */}
      {!isOAuthUser && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Email address</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Current: {email}</p>
          </div>
          <form onSubmit={handleEmailChange} className="space-y-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              placeholder="new@example.com"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors shadow-elevation-1"
            />
            {emailMsg && (
              <p className={`text-xs ${emailMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                {emailMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={emailLoading}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm font-medium rounded-lg shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 touch-manipulation"
            >
              {emailLoading ? "Sending…" : "Change email"}
            </button>
          </form>
        </section>
      )}

      {/* Password */}
      {!isOAuthUser && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-100">Change password</h2>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="Current password"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors shadow-elevation-1"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="New password (min 8 chars)"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors shadow-elevation-1"
            />
            {pwMsg && (
              <p className={`text-xs ${pwMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                {pwMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={pwLoading}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm font-medium rounded-lg shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 touch-manipulation"
            >
              {pwLoading ? "Updating…" : "Update password"}
            </button>
          </form>
        </section>
      )}

      {isOAuthUser && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-100">Sign-in method</h2>
          <p className="text-xs text-zinc-500">
            Your account uses {providerLabel} sign-in. Email and password changes are managed through {providerLabel}.
          </p>
        </section>
      )}

      {/* Data & sessions */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Data &amp; sessions</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleDownloadData("json")}
            disabled={exportLoading !== null}
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm font-medium rounded-lg shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 touch-manipulation"
          >
            {exportLoading === "json" && (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-zinc-500 border-t-zinc-100 animate-spin" />
            )}
            {exportLoading === "json"
              ? exportProgress != null
                ? `Preparing… ${exportProgress}%`
                : "Preparing…"
              : "Download my data (JSON)"}
          </button>
          <button
            type="button"
            onClick={() => handleDownloadData("csv")}
            disabled={exportLoading !== null}
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm font-medium rounded-lg shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 touch-manipulation"
          >
            {exportLoading === "csv" && (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-zinc-500 border-t-zinc-100 animate-spin" />
            )}
            {exportLoading === "csv"
              ? exportProgress != null
                ? `Preparing… ${exportProgress}%`
                : "Preparing…"
              : "Download my data (CSV)"}
          </button>
          <button
            type="button"
            onClick={handleLogoutEverywhere}
            disabled={logoutLoading}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm font-medium rounded-lg shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 touch-manipulation"
          >
            {logoutLoading ? "Logging out…" : "Log out of all devices"}
          </button>
        </div>
        {exportError && <p className="text-xs text-red-400">{exportError}</p>}
        {logoutMsg && !logoutMsg.ok && <p className="text-xs text-red-400">{logoutMsg.text}</p>}
      </section>

      {/* Danger zone */}
      <section className="space-y-4 border border-red-900/40 rounded-xl p-5 shadow-elevation-2">
        <div>
          <h2 className="text-sm font-semibold text-red-400">Delete account</h2>
          <p className="text-xs text-zinc-500 mt-1">
            This permanently deletes your account, profile, and all contributions. This cannot be undone.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">
            Type <span className="font-mono text-zinc-200">delete my account</span> to confirm:
          </p>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="delete my account"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 focus:border-red-700 rounded-lg text-sm outline-none transition-colors shadow-elevation-1"
          />
        </div>
        {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
        <button
          onClick={handleDeleteAccount}
          disabled={deleteConfirm !== "delete my account" || isPending}
          className="px-4 py-2 bg-red-900/30 hover:bg-red-900/60 border border-red-800/60 disabled:opacity-30 disabled:cursor-not-allowed text-red-400 text-sm font-medium rounded-lg shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 touch-manipulation"
        >
          {isPending ? "Deleting…" : "Delete my account"}
        </button>
      </section>
    </div>
  );
}
