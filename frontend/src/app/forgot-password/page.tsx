"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <main className="flex flex-col items-center justify-center flex-1 px-6 py-16">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="text-4xl">📬</div>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-zinc-400 text-sm">
            We sent a password reset link to <span className="text-zinc-200">{email}</span>.
          </p>
          <Link href="/login" className="block text-sm text-emerald-400 hover:text-emerald-300">
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center flex-1 px-6 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-zinc-400 text-sm">Enter your email and we'll send a reset link</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm text-zinc-300">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors"
              placeholder="you@example.com"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p className="text-center text-zinc-400 text-sm">
          <Link href="/login" className="text-emerald-400 hover:text-emerald-300">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
