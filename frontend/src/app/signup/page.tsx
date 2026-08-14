"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isNativePlatform } from "@/lib/capacitor";
import { acceptLegal } from "@/app/legal/actions";
import { Card } from "@/components/ui/Card";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [agreedToLegal, setAgreedToLegal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const appleSignupInFlight = useRef(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else if (data.session) {
      // Email confirmation disabled — user is immediately logged in
      await acceptLegal({ terms: true, privacy: true });
      window.location.href = "/campaigns";
    } else {
      // Email confirmation required — show check-your-email state
      setEmailSent(true);
      setLoading(false);
    }
  }

  async function handleGoogleSignup() {
    setGoogleLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function handleAppleSignup() {
    if (appleSignupInFlight.current) return;
    appleSignupInFlight.current = true;
    setAppleLoading(true);
    const supabase = createClient();

    if (isNativePlatform()) {
      try {
        const { SocialLogin } = await import("@capgo/capacitor-social-login");
        await SocialLogin.initialize({
          apple: {
            clientId: "com.frontlinemaps.app.signin",
            redirectUrl: "",
            useBroadcastChannel: true,
          },
        });

        const rawNonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce));
        const nonceDigest = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const result = await SocialLogin.login({
          provider: "apple",
          options: { scopes: ["name", "email"], nonce: nonceDigest },
        });
        const idToken = "result" in result ? result.result.idToken : undefined;
        if (!idToken) {
          setError("Apple sign-in didn't return a token.");
          return;
        }

        const { error } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: idToken,
          nonce: rawNonce,
        });
        if (error) {
          setError(error.message);
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Apple sign-in failed.");
        return;
      } finally {
        appleSignupInFlight.current = false;
        setAppleLoading(false);
      }

      window.location.href = "/campaigns";
      return;
    }

    await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  if (emailSent) {
    return (
      <main className="flex flex-col items-center justify-center flex-1 px-6 py-16">
        <Card elevation={2} padding="lg" className="w-full max-w-sm space-y-4 text-center">
          <div className="text-4xl">📬</div>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-zinc-400 text-sm">
            We sent a confirmation link to <span className="text-zinc-200">{email}</span>. Click it to activate your account.
          </p>
          <p className="text-zinc-500 text-xs">
            Already confirmed?{" "}
            <Link href="/login" className="text-emerald-400 hover:text-emerald-300 active:text-emerald-300 transition-colors duration-150">
              Sign in
            </Link>
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center flex-1 px-6 py-16">
      <Card elevation={2} padding="lg" className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Join Frontline</h1>
          <p className="text-zinc-400 text-sm">Start making an impact</p>
        </div>

        <button
          onClick={handleGoogleSignup}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-elevation-1 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 touch-manipulation text-sm font-medium text-gray-700"
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

        <button
          onClick={handleAppleSignup}
          disabled={appleLoading}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-black hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-elevation-1 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 touch-manipulation text-sm font-medium text-white"
        >
          {!appleLoading && (
            <svg width="16" height="18" viewBox="0 0 814 1000" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155 123.1s-85-39.1-163-39.1c-76 0-103 40.4-164.7 40.4s-104.4-56.9-153.9-126.8c-57.7-82.5-104.4-210.3-104.4-331.5 0-194.7 126.6-297.9 251.1-297.9 65.9 0 120.8 43.3 162.2 43.3 39.4 0 100.9-45.9 176-45.9 28.5 0 131 2.6 198.4 99.9zM554.1 159.4c31.2-37.1 53.3-88.6 53.3-140.1 0-7.1-.6-14.3-1.9-20.1-50.8 1.9-111.2 33.9-147.6 76.3-28.5 32.5-55.3 84-55.3 136.2 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 136-71.7z"/>
            </svg>
          )}
          {appleLoading ? "Redirecting…" : "Continue with Apple"}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-zinc-800" />
          <span className="text-zinc-500 text-xs">or</span>
          <div className="flex-1 border-t border-zinc-800" />
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm text-zinc-300">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors shadow-elevation-1"
              placeholder="trashslayer99"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm text-zinc-300">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors shadow-elevation-1"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm text-zinc-300">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-lg text-sm outline-none transition-colors shadow-elevation-1"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <label className="flex items-start gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={agreedToLegal}
              onChange={(e) => setAgreedToLegal(e.target.checked)}
              required
              className="mt-0.5 accent-emerald-600"
            />
            <span>
              I agree to the{" "}
              <Link href="/legal/terms" target="_blank" className="hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150 underline">Terms</Link>
              {" "}and{" "}
              <Link href="/legal/privacy" target="_blank" className="hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150 underline">Privacy Policy</Link>
              .
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !agreedToLegal}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 touch-manipulation text-sm"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-zinc-400 text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-emerald-400 hover:text-emerald-300 active:text-emerald-300 transition-colors duration-150">
            Sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
