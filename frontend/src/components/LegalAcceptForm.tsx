"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptLegal } from "@/app/legal/actions";
import TermsContent from "@/components/legal/TermsContent";
import PrivacyContent from "@/components/legal/PrivacyContent";
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, formatLegalVersion } from "@/lib/legal";

type DocKey = "terms" | "privacy";
type View = "list" | DocKey;

const DOC_LABEL: Record<DocKey, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
};

const DOC_VERSION: Record<DocKey, string> = {
  terms: CURRENT_TERMS_VERSION,
  privacy: CURRENT_PRIVACY_VERSION,
};

export default function LegalAcceptForm({
  needsTerms,
  needsPrivacy,
}: {
  needsTerms: boolean;
  needsPrivacy: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [accepted, setAccepted] = useState<Record<DocKey, boolean>>({
    terms: false,
    privacy: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docs: DocKey[] = [
    ...(needsTerms ? (["terms"] as const) : []),
    ...(needsPrivacy ? (["privacy"] as const) : []),
  ];
  const allAccepted = docs.every((doc) => accepted[doc]);

  async function handleAccept() {
    setLoading(true);
    setError(null);
    try {
      await acceptLegal({ terms: needsTerms, privacy: needsPrivacy });
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  if (view !== "list") {
    const doc = view;

    function handleAgree() {
      setAccepted((prev) => ({ ...prev, [doc]: true }));
      setView("list");
    }

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/95 backdrop-blur-sm px-6 py-10">
        <div className="w-full max-w-2xl max-h-full flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800 shrink-0">
            <button
              onClick={() => setView("list")}
              className="text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
            >
              ← Back
            </button>
            <div>
              <h2 className="text-zinc-100 font-semibold leading-tight">{DOC_LABEL[doc]}</h2>
              <p className="text-zinc-500 text-xs">
                Last updated: {formatLegalVersion(DOC_VERSION[doc])}
              </p>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
            {doc === "terms" ? <TermsContent /> : <PrivacyContent />}
          </div>

          <div className="shrink-0 px-6 py-5 border-t border-zinc-800 bg-zinc-900">
            <button
              onClick={handleAgree}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base rounded-lg transition-colors"
            >
              {accepted[doc] ? "Accepted ✓" : `I Agree to the ${DOC_LABEL[doc]}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/95 backdrop-blur-sm px-6">
      <div className="w-full max-w-sm space-y-5 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="space-y-2 text-center">
          <p className="text-3xl">📋</p>
          <h1 className="text-xl font-black text-zinc-100">
            We've updated our {docs.map((doc) => DOC_LABEL[doc]).join(" and ")}
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Please review and accept the following to continue using Frontline.
          </p>
        </div>

        <div className="space-y-2">
          {docs.map((doc) => (
            <button
              key={doc}
              onClick={() => setView(doc)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium border transition-colors ${
                accepted[doc]
                  ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                  : "bg-zinc-800 hover:bg-zinc-700 border-zinc-600 text-zinc-100"
              }`}
            >
              <span>{DOC_LABEL[doc]}</span>
              {accepted[doc] ? (
                <span className="text-emerald-400 text-xs font-semibold">Accepted ✓</span>
              ) : (
                <span className="text-emerald-400 text-xs font-semibold">Review →</span>
              )}
            </button>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          onClick={handleAccept}
          disabled={!allAccepted || loading}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base rounded-lg transition-colors"
        >
          {loading ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
