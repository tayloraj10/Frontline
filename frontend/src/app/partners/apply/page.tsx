"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import BusinessForm, { type BusinessFormInitial, type BusinessFormPayload } from "@/components/partners/BusinessForm";

const STORAGE_KEY = "frontline:pendingBusinessSubmission";

async function insertBusiness(payload: BusinessFormPayload, userId: string): Promise<string | null> {
  const { campaignIds: _campaignIds, locations, ...rest } = payload;
  const supabase = createClient();
  // A pending business isn't visible under partner_businesses_select to its own
  // submitter until reviewed, so RETURNING a row via .select() after the insert
  // trips RLS even though the insert itself is allowed. Generate the id
  // client-side and skip .select() so we never need read-back permission.
  const businessId = crypto.randomUUID();
  const { error } = await supabase
    .schema("public")
    .from("partner_businesses")
    .insert({ ...rest, id: businessId, status: "pending", created_by: userId });

  if (error) return error.message;

  if (locations.length > 0) {
    const { error: locationsError } = await supabase
      .schema("public")
      .from("partner_business_locations")
      .insert(
        locations.map(({ id: _id, ...loc }) => ({ ...loc, business_id: businessId }))
      );
    if (locationsError) return locationsError.message;
  }

  return null;
}

function toInitial(payload: BusinessFormPayload): BusinessFormInitial {
  const { campaignIds: _campaignIds, locations, ...rest } = payload;
  return {
    ...rest,
    // These locations were never actually inserted (submission was interrupted by
    // the login redirect), so there's no real row id yet; synthesize one just to
    // satisfy the form's local key/id bookkeeping. It's stripped before insert.
    locations: locations.map((loc) => ({ ...loc, id: loc.id ?? crypto.randomUUID() })),
  };
}

export default function PartnerApplyPage() {
  const [submitted, setSubmitted] = useState(false);
  const [restoredPayload, setRestoredPayload] = useState<BusinessFormPayload | null>(null);
  const [checkingRestore, setCheckingRestore] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setIsSignedIn(!!user);
      if (!saved) {
        setCheckingRestore(false);
        return;
      }
      if (user) {
        const payload = JSON.parse(saved) as BusinessFormPayload;
        sessionStorage.removeItem(STORAGE_KEY);
        setRestoredPayload(payload);
      }
      setCheckingRestore(false);
    })();
  }, []);

  const handleSubmit = async (payload: BusinessFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      window.location.href = "/login?next=/partners/apply";
      return null;
    }

    const error = await insertBusiness(payload, user.id);
    if (error) return error;

    setSubmitted(true);
    return null;
  };

  if (checkingRestore) return null;

  if (submitted) {
    return (
      <main className="flex flex-col items-center justify-center flex-1 px-6 py-16">
        <div className="w-full max-w-sm space-y-4 text-center rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-elevation-2">
          <div className="text-4xl">📬</div>
          <h1 className="text-2xl font-bold">Submitted for review</h1>
          <p className="text-zinc-400 text-sm">
            Thanks! A Frontline admin will review your business and get it added to the right campaigns soon.
          </p>
          <p className="text-zinc-500 text-xs">
            <Link href="/" className="text-emerald-400 hover:text-emerald-300 active:text-emerald-300 transition-colors duration-150">
              Back to Frontline
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center flex-1 px-6 py-16">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">List your business</h1>
          <p className="text-zinc-400 text-sm">
            Submit your business to appear on Frontline campaign maps. An admin will review it before it goes live.
          </p>
        </div>

        {restoredPayload && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-700 bg-emerald-950/60 p-4 shadow-elevation-2">
            <span className="text-2xl leading-none">✅</span>
            <p className="text-emerald-300 text-sm font-medium">
              Welcome back! Your submission was saved, just hit submit to finish.
            </p>
          </div>
        )}

        {!restoredPayload && !isSignedIn && !checkingRestore && (
          <div className="flex items-start gap-3 rounded-2xl border-2 border-amber-500 bg-amber-950/60 p-4 shadow-elevation-2">
            <span className="text-2xl leading-none">🔒</span>
            <p className="text-amber-300 text-sm font-medium">
              You will need to sign in or create an account to submit your business. Fill out the form below first, we will save your progress and bring you right back here.
            </p>
          </div>
        )}

        <BusinessForm
          key={restoredPayload ? "restored" : "fresh"}
          initial={restoredPayload ? toInitial(restoredPayload) : undefined}
          initialCampaignIds={restoredPayload?.campaignIds}
          onSubmit={handleSubmit}
          submitLabel={!restoredPayload && !isSignedIn && !checkingRestore ? "Sign up or log in to continue" : "Submit for review"}
        />
      </div>
    </main>
  );
}
