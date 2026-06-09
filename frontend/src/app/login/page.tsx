"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const next = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = next && next.startsWith("/") ? next : "/campaigns";
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    const supabase = createClient();
    const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
    if (next) callbackUrl.searchParams.set("next", next);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
  }

  const displayError = error ?? (callbackError ? "Authentication failed. Please try again." : null);

  return (
    <main className="flex flex-col items-center justify-center flex-1 px-6 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Sign in to Frontline</h1>
          <p className="text-zinc-400 text-sm">Join the collective action</p>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors text-sm font-medium text-gray-700 shadow-sm"
        >
          {!googleLoading && (
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
          )}
          {googleLoading ? "Redirecting…" : "Continue with Google"}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-zinc-800" />
          <span className="text-zinc-500 text-xs">or</span>
          <div className="flex-1 border-t border-zinc-800" />
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm text-zinc-300">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm text-zinc-300">Password</label>
              <Link href="/forgot-password" className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          {displayError && <p className="text-red-400 text-sm">{displayError}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-zinc-400 text-sm">
          No account?{" "}
          <Link href="/signup" className="text-emerald-400 hover:text-emerald-300">
            Sign up
          </Link>
        </p>

        <div className="flex justify-center gap-4 text-xs text-zinc-600">
          <Link href="/legal/terms" className="hover:text-zinc-400 transition-colors">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-zinc-400 transition-colors">Privacy</Link>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
