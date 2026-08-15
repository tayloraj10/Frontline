"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { syncUserPoints, useUserPoints } from "@/lib/userPoints";
import { formatPoints } from "@/lib/formatPoints";
import { isNativePlatform } from "@/lib/capacitor";
import { useClickOutside } from "@/hooks/useClickOutside";
import type { User } from "@supabase/supabase-js";

export default function UserNav({
  user,
  points = 0,
  spendablePoints = 0,
  avatarUrl = null,
  displayName: profileDisplayName = null,
  username = null,
}: {
  user: User | null;
  points?: number;
  spendablePoints?: number;
  avatarUrl?: string | null;
  displayName?: string | null;
  username?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // AppHeader (a Server Component) fetches these props once per server render; hydrate the
  // shared client-side store from them so award-granting flows elsewhere in the tree can
  // push instant updates here without a page refresh. Re-synced whenever the props change
  // (e.g. a fresh navigation) so a stale optimistic bump never outlives a real refetch.
  useEffect(() => {
    if (user) syncUserPoints(points, spendablePoints);
  }, [user, points, spendablePoints]);
  const live = useUserPoints();
  const displayPoints = live?.points ?? points;
  const displaySpendablePoints = live?.spendablePoints ?? spendablePoints;

  useClickOutside(ref, () => setOpen(false), open);

  const handleSignOut = async () => {
    setOpen(false);
    // Signing out of Supabase doesn't touch Google's native SDK session on
    // iOS — GIDSignIn caches it independently. Without also signing out here,
    // the next native login silently reuses that cached session (rather than
    // a full fresh consent), and the id_token it returns carries the old
    // session's nonce, which no longer matches the new one we generate —
    // Supabase then rejects it with "Nonces mismatch".
    if (isNativePlatform()) {
      try {
        const { SocialLogin } = await import("@capgo/capacitor-social-login");
        // logout() requires the provider to have been initialized in this
        // app process — not guaranteed if the user was already signed in
        // from a previous launch and never hit the native login flow.
        await SocialLogin.initialize({
          google: {
            iOSClientId: "739267403997-v2njpfsgr8kcmfh4lrum50ks78majf6f.apps.googleusercontent.com",
            iOSServerClientId: "739267403997-e0b8jujgl51c8vpiiemhm4f8v78phfmm.apps.googleusercontent.com",
            webClientId: "739267403997-e0b8jujgl51c8vpiiemhm4f8v78phfmm.apps.googleusercontent.com",
            mode: "online",
          },
        });
        await SocialLogin.logout({ provider: "google" });
      } catch {
        // Best-effort — a missing/failed native sign-out shouldn't block the
        // Supabase sign-out below.
      }
    }
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  if (!user) {
    return (
      <Link
        href={`/login?next=${pathname}`}
        className="px-4 py-1.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-elevation-2 transition-[background-color,transform] active:scale-[0.97] duration-150"
      >
        Sign In
      </Link>
    );
  }

  const displayName =
    profileDisplayName || user.user_metadata?.username || user.email?.split("@")[0] || "User";

  const formatCompact = (value: number) =>
    value >= 1000
      ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`
      : formatPoints(value);

  const compactPoints = formatCompact(displaySpendablePoints);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 min-h-11 pl-1.5 pr-3 py-1 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:scale-[0.97] rounded-lg transition-[background-color,color,transform] duration-150 touch-manipulation"
      >
        <span className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-zinc-400">{displayName[0]?.toUpperCase()}</span>
          )}
        </span>
        <span className="hidden sm:inline truncate max-w-[8rem]">{displayName}</span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 shadow-glow-emerald text-emerald-400 text-[10px] font-bold leading-none tabular-nums">
          {compactPoints}
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 mt-1 w-48 max-w-[calc(100vw-2rem)] bg-zinc-900 border border-zinc-800 rounded-xl shadow-elevation-4 z-50 py-1 text-sm origin-top-right"
          >
            <div className="px-4 py-2.5 space-y-1.5">
              <div
                className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full pl-2 pr-3 py-1"
                title="Points available to redeem for partner offers. Goes down when you redeem something."
              >
                <span className="text-emerald-400 font-bold text-sm leading-none tabular-nums">
                  {formatPoints(displaySpendablePoints)}
                </span>
                <span className="text-emerald-500/70 text-[10px] font-semibold uppercase tracking-wide leading-none">
                  Spendable
                </span>
              </div>
              <div
                className="inline-flex items-center gap-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-full pl-2 pr-3 py-1"
                title="Total points you've ever earned. Counts toward the leaderboard and never goes down, even when you redeem offers."
              >
                <span className="text-zinc-300 font-bold text-sm leading-none tabular-nums">
                  {formatPoints(displayPoints)}
                </span>
                <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide leading-none">
                  Lifetime
                </span>
              </div>
            </div>
            <div className="border-t border-zinc-800 my-1" />
            {username && (
              <Link
                href={`/users/${username}`}
                onClick={() => setOpen(false)}
                className="flex items-center min-h-11 px-4 py-2 text-zinc-300 hover:bg-zinc-800 active:bg-zinc-800 hover:text-zinc-100 transition-colors"
              >
                My profile
              </Link>
            )}
            <Link
              href="/settings/profile"
              onClick={() => setOpen(false)}
              className="flex items-center min-h-11 px-4 py-2 text-zinc-300 hover:bg-zinc-800 active:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              Edit profile
            </Link>
            <Link
              href="/settings/account"
              onClick={() => setOpen(false)}
              className="flex items-center min-h-11 px-4 py-2 text-zinc-300 hover:bg-zinc-800 active:bg-zinc-800 hover:text-zinc-100 transition-colors"
            >
              Account settings
            </Link>
            <div className="border-t border-zinc-800 my-1" />
            <button
              onClick={handleSignOut}
              className="w-full flex items-center min-h-11 text-left px-4 py-2 text-zinc-500 hover:bg-zinc-800 active:bg-zinc-800 hover:text-zinc-300 transition-colors"
            >
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
