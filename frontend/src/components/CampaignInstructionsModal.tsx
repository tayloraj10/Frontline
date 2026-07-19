"use client";

import { useState, useEffect } from "react";

interface Feature {
  icon: string;
  title: string;
  body: string;
  beta?: boolean;
}

interface CampaignInstructions {
  icon: string;
  title: string;
  intro: string;
  features: Feature[];
}

const INSTRUCTIONS: Record<string, CampaignInstructions> = {
  "trash-war": {
    icon: "🧹",
    title: "How Trash War works",
    intro: "Clean up your neighborhood, claim territory, and compete for the top spot.",
    features: [
      {
        icon: "🧹",
        title: "Log a Cleanup",
        body: "Collected trash? Log it with a bag count and photos to earn points and put your color on that zip code.",
      },
      {
        icon: "🚩",
        title: "Report Trash",
        body: "See a dirty spot but can't clean it now? Drop a pin so someone else can find and clear it.",
      },
      {
        icon: "🗺️",
        title: "Claim Territory",
        body: "Every zip code is colored by whoever's contributed the most there. Outwork the competition to flip it.",
      },
      {
        icon: "⚡",
        title: "Hot Spots",
        body: "Watch for timed events: limited-time zones that award bonus points while they're active.",
      },
      {
        icon: "⏱️",
        title: "Claim Challenge",
        body: "Claim a reported site to race the clock: arrive and snap a before photo, then clean up and snap an after photo before time runs out for a score multiplier.",
        beta: true,
      },
      {
        icon: "👥",
        title: "Group Events",
        body: "RSVP to a scheduled group cleanup and track bags, pounds, and photos with everyone else who showed up.",
        beta: true,
      },
      {
        icon: "🛣️",
        title: "Cleanup Routes",
        body: "Draw a route through multiple blocks and log one cleanup for the whole stretch.",
        beta: true,
      },
      {
        icon: "🏆",
        title: "Leaderboards",
        body: "Track your rank and your group's rank on the campaign leaderboard.",
      },
    ],
  },
  "touch-grass": {
    icon: "🌱",
    title: "How Touch Grass works",
    intro: "It's simple: get outside and snap a photo of you enjoying nature.",
    features: [
      {
        icon: "📸",
        title: "Submit a Photo",
        body: "Snap a photo of you touching grass. Anywhere on Earth counts.",
      },
      {
        icon: "🖼️",
        title: "Build the Collage",
        body: "Every submission adds to the shared photo collage and your personal count.",
      },
    ],
  },
  solarpunk: {
    icon: "☀️",
    title: "How Solarpunk works",
    intro: "Log real-world regenerative actions and help the whole community grow. Every action blooms a hex on the shared map.",
    features: [
      {
        icon: "🌻",
        title: "Log a Regenerative Action",
        body: "Planted something, biked instead of drove, hosted a mutual-aid event? Pick it from the category list to earn points.",
      },
      {
        icon: "📷",
        title: "Spot Solarpunk in the Wild",
        body: "See solarpunk happening around you, like a green roof or a community garden you didn't build? Snap a photo of it to earn points too.",
      },
      {
        icon: "🌍",
        title: "Grow the World Bloom",
        body: "Every action or photo adds to the cooperative World Bloom Score. Everyone's on the same side, working toward shared milestones.",
      },
      {
        icon: "🧹",
        title: "Cross-credit Cleanups",
        body: "Logging a cleanup here can also count toward Trash War, no need to log it twice.",
      },
    ],
  },
};

function storageKey(slug: string): string {
  return `frontline_instructions_seen_${slug}`;
}

export default function CampaignInstructionsModal({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const instructions = INSTRUCTIONS[slug];

  useEffect(() => {
    if (!instructions) return;
    if (typeof window !== "undefined" && !localStorage.getItem(storageKey(slug))) {
      setOpen(true);
    }
  }, [slug, instructions]);

  if (!instructions) return null;

  function close() {
    if (dontShowAgain) {
      localStorage.setItem(storageKey(slug), "1");
    }
    setOpen(false);
  }

  function reopen() {
    setDontShowAgain(false);
    setOpen(true);
  }

  return (
    <>
      <button
        onClick={reopen}
        title="How this campaign works"
        className="w-7 h-7 flex items-center justify-center text-xs font-bold rounded-full border border-zinc-700/60 bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 transition-colors shrink-0"
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md max-h-[85vh] flex flex-col bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 pt-6 pb-4 shrink-0 border-b border-zinc-800/60">
              <div className="text-4xl mb-3 text-center">{instructions.icon}</div>
              <h2 className="text-xl font-black text-zinc-100 text-center mb-1.5 tracking-tight">
                {instructions.title}
              </h2>
              <p className="text-zinc-400 text-sm text-center leading-relaxed">{instructions.intro}</p>
            </div>

            <div className="px-6 py-4 overflow-y-auto">
              <ul className="space-y-4">
                {instructions.features.map((f) => (
                  <li key={f.title} className="flex items-start gap-3">
                    <span className="text-lg shrink-0 mt-0.5">{f.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-zinc-100">{f.title}</p>
                        {f.beta && (
                          <span className="text-[9px] font-bold uppercase tracking-wide text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded px-1 py-0.5 leading-none">
                            Beta
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed mt-0.5">{f.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="px-6 pt-3 pb-5 shrink-0 border-t border-zinc-800/60">
              <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-xs text-zinc-500">Don't show this again</span>
              </label>
              <button
                onClick={close}
                className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
