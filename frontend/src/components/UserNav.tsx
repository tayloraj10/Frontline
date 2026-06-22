"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function UserNav({ user }: { user: User | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSignOut = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  if (!user) {
    return (
      <Link
        href="/login"
        className="px-4 py-1.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
      >
        Sign In
      </Link>
    );
  }

  const displayName =
    user.user_metadata?.username || user.email?.split("@")[0] || "User";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
      >
        <span className="hidden sm:block">{displayName}</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-48 max-w-[calc(100vw-2rem)] bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 py-1 text-sm">
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            My profile
          </Link>
          <Link
            href="/settings/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            Edit profile
          </Link>
          <Link
            href="/settings/account"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            Account settings
          </Link>
          <div className="border-t border-zinc-800 my-1" />
          <button
            onClick={handleSignOut}
            className="w-full text-left px-4 py-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
