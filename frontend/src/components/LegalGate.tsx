import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from "@/lib/legal";
import LegalAcceptForm from "./LegalAcceptForm";

const SKIP_PREFIXES = ["/legal", "/login", "/signup", "/forgot-password", "/auth/"];

const LEGAL_GATE_ENABLED = true;

export default async function LegalGate() {
  if (!LEGAL_GATE_ENABLED) return null;

  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";
  if (SKIP_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .schema("public")
    .from("profiles")
    .select("terms_version_accepted, privacy_version_accepted")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const needsTerms = profile.terms_version_accepted !== CURRENT_TERMS_VERSION;
  const needsPrivacy = profile.privacy_version_accepted !== CURRENT_PRIVACY_VERSION;
  if (!needsTerms && !needsPrivacy) return null;

  return <LegalAcceptForm needsTerms={needsTerms} needsPrivacy={needsPrivacy} />;
}
