import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AccountSettingsForm from "./AccountSettingsForm";

export const metadata = { title: "Account Settings — Frontline" };

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/account");

  const isOAuthUser = user.app_metadata?.provider !== "email";

  return (
    <main className="max-w-lg mx-auto px-6 py-10 w-full">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-zinc-100">Account settings</h1>
          <p className="mt-1 text-sm text-zinc-500">{user.email}</p>
        </div>
        <Link
          href="/settings/profile"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Edit profile
        </Link>
      </div>

      <AccountSettingsForm email={user.email!} isOAuthUser={isOAuthUser} />

      <div className="mt-12 pt-6 border-t border-zinc-800">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Legal</h2>
        <div className="flex gap-4">
          <Link href="/legal/terms" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            Terms of Service
          </Link>
          <Link href="/legal/privacy" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            Privacy Policy
          </Link>
        </div>
      </div>
    </main>
  );
}
