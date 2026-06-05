"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function UserNav({ user }: { user: User | null }) {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
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
    <div className="flex items-center gap-1">
      <Link
        href="/profile"
        className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors hidden sm:block"
      >
        {displayName}
      </Link>
      <button
        onClick={handleSignOut}
        className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
