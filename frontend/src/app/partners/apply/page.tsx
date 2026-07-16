"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import BusinessForm, { type BusinessFormPayload } from "@/components/partners/BusinessForm";

export default function PartnerApplyPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (payload: BusinessFormPayload): Promise<string | null> => {
    const { campaignIds: _campaignIds, ...rest } = payload;
    const supabase = createClient();
    const { error } = await supabase
      .schema("public")
      .from("partner_businesses")
      .insert({ ...rest, status: "pending" });

    if (error) return error.message;
    setSubmitted(true);
    return null;
  };

  if (submitted) {
    return (
      <main className="flex flex-col items-center justify-center flex-1 px-6 py-16">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="text-4xl">📬</div>
          <h1 className="text-2xl font-bold">Submitted for review</h1>
          <p className="text-zinc-400 text-sm">
            Thanks! A Frontline admin will review your business and get it added to the right campaigns soon.
          </p>
          <p className="text-zinc-500 text-xs">
            <Link href="/" className="text-emerald-400 hover:text-emerald-300">
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

        <BusinessForm onSubmit={handleSubmit} submitLabel="Submit for review" />
      </div>
    </main>
  );
}
