"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { deleteAccount } from "./actions";

interface Props {
  email: string;
  isOAuthUser: boolean;
}

export default function AccountSettingsForm({ email, isOAuthUser }: Props) {
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
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors"
            />
            {emailMsg && (
              <p className={`text-xs ${emailMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                {emailMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={emailLoading}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm font-medium rounded-lg transition-colors"
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
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="New password (min 8 chars)"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors"
            />
            {pwMsg && (
              <p className={`text-xs ${pwMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                {pwMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={pwLoading}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 text-sm font-medium rounded-lg transition-colors"
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
            Your account uses Google sign-in. Email and password changes are managed through Google.
          </p>
        </section>
      )}

      {/* Danger zone */}
      <section className="space-y-4 border border-red-900/40 rounded-xl p-5">
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
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 focus:border-red-700 rounded-lg text-sm outline-none transition-colors"
          />
        </div>
        {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
        <button
          onClick={handleDeleteAccount}
          disabled={deleteConfirm !== "delete my account" || isPending}
          className="px-4 py-2 bg-red-900/30 hover:bg-red-900/60 border border-red-800/60 disabled:opacity-30 disabled:cursor-not-allowed text-red-400 text-sm font-medium rounded-lg transition-colors"
        >
          {isPending ? "Deleting…" : "Delete my account"}
        </button>
      </section>
    </div>
  );
}
