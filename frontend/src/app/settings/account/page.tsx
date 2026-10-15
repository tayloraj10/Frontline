import LegalModalLink from "@/components/legal/LegalModalLink";
import { version as appVersion } from "../../../../package.json";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";
import AccountSettingsForm from "./AccountSettingsForm";

export const metadata = { title: "Account Settings | Frontline" };

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/account");

  const provider = user.app_metadata?.provider ?? "email";
  const isOAuthUser = provider !== "email";

  return (
    <main className="max-w-lg mx-auto px-4 sm:px-6 py-10 w-full">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display font-extrabold text-xl text-zinc-100">Account settings</h1>
          <p className="mt-1 text-sm text-zinc-500">{user.email}</p>
        </div>
        <Link
          href="/settings/profile"
          className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150"
        >
          Edit profile
        </Link>
      </div>

      <AccountSettingsForm email={user.email!} isOAuthUser={isOAuthUser} provider={provider} />

      <div className="mt-12 pt-6 border-t border-zinc-800">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Appearance</h2>
        <ThemeToggle />
        <p className="mt-2 text-xs text-zinc-500">Auto follows your phone. Light is easier to read in direct sun.</p>
      </div>

      <div className="mt-8 pt-6 border-t border-zinc-800">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Legal</h2>
        <div className="flex gap-4">
          <LegalModalLink doc="terms" className="text-sm text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150">Terms of Service</LegalModalLink>
          <LegalModalLink doc="privacy" className="text-sm text-zinc-400 hover:text-zinc-200 active:text-zinc-200 transition-colors duration-150">Privacy Policy</LegalModalLink>
        </div>
        <p className="mt-6 text-xs text-zinc-600">Frontline v{appVersion}</p>
      </div>
    </main>
  );
}
