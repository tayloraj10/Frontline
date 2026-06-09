"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Database } from "@/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

interface Props {
  campaigns: Campaign[];
}

const STORAGE_KEY = "frontline_onboarded";

const STEPS = [
  {
    icon: "🚩",
    title: "Welcome to Frontline",
    body: "Frontline turns real-world action into a strategy game. Join campaigns, log contributions, and watch your impact spread across a live map.",
  },
  {
    icon: "🗺️",
    title: "How it works",
    body: null,
    bullets: [
      { icon: "📍", text: "Log a contribution — cleanup bags, photos, voter registration, and more" },
      { icon: "⚑", text: "Claim territory — your geo-unit gets your color on the map" },
      { icon: "⚡", text: "Watch dynamic events unfold — hotspots, decay, cascading unlocks" },
      { icon: "🏆", text: "Compete on leaderboards — individually or as a group" },
    ],
  },
  {
    icon: "🚀",
    title: "Pick your fight",
    body: "Choose a campaign below to jump in. You can always switch later.",
  },
];

export default function OnboardingModal({ campaigns }: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden">
        {/* Progress dots */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-6 bg-emerald-400" : i < step ? "w-1.5 bg-emerald-700" : "w-1.5 bg-zinc-700"
              }`}
            />
          ))}
        </div>

        <div className="px-8 pt-12 pb-8">
          <div className="text-5xl mb-5 text-center">{current.icon}</div>
          <h2 className="text-2xl font-black text-zinc-100 text-center mb-3 tracking-tight">
            {current.title}
          </h2>

          {current.body && (
            <p className="text-zinc-400 text-sm text-center leading-relaxed mb-6">
              {current.body}
            </p>
          )}

          {current.bullets && (
            <ul className="space-y-3 mb-6">
              {current.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-lg shrink-0 mt-0.5">{b.icon}</span>
                  <span className="text-sm text-zinc-300 leading-snug">{b.text}</span>
                </li>
              ))}
            </ul>
          )}

          {isLast && campaigns.length > 0 && (
            <div className="space-y-2 mb-6 max-h-48 overflow-y-auto pr-1">
              {campaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.slug}`}
                  onClick={dismiss}
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 rounded-xl transition-all group"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-100 group-hover:text-white truncate">
                      {c.title}
                    </div>
                    {c.description && (
                      <div className="text-xs text-zinc-500 truncate mt-0.5">{c.description}</div>
                    )}
                  </div>
                  <span className="text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0">→</span>
                </Link>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-2.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 text-sm font-semibold rounded-xl transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {isLast ? "Browse all campaigns" : "Next"}
            </button>
          </div>

          <button
            onClick={dismiss}
            className="w-full mt-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
