"use client";

import { useState, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Step {
  title: string;
  body: string;
  how?: string[];
  beta?: boolean;
  visual: ReactNode;
}

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const PILL = "inline-flex items-center gap-2 h-11 rounded-full bg-zinc-900 ring-1 ring-white/10 text-sm font-semibold shadow-lg";

function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="w-full h-28 rounded-2xl bg-zinc-800/60 ring-1 ring-white/5 flex items-center justify-center gap-3 overflow-hidden">
      {children}
    </div>
  );
}

function Chip({ children, on }: { children: ReactNode; on?: boolean }) {
  return (
    <span className={`px-3 h-8 inline-flex items-center rounded-full text-xs font-semibold ${on ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-zinc-300 ring-1 ring-white/10"}`}>
      {children}
    </span>
  );
}

const STEPS: Step[] = [
  {
    title: "Clean. Earn. Get rewarded.",
    body: "Pick up trash, earn points, and spend them at local shops. Here is a quick tour of the map.",
    visual: (
      <Stage>
        <span className="text-4xl">🧹</span>
        <Chip>Clean</Chip>
        <Chip>Earn</Chip>
        <Chip on>Rewards</Chip>
      </Stage>
    ),
  },
  {
    title: "Log a cleanup",
    body: "Picked up some trash? Log it to earn points.",
    how: [
      "Tap Log Cleanup at the bottom left",
      "Add your bag count and photos",
      "Pin the spot or draw the area you cleaned",
    ],
    visual: (
      <Stage>
        <span className={`${PILL} pl-3.5 pr-4 text-zinc-100`}>
          <svg className="w-4 h-4 text-emerald-400" {...svgProps} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>
          Log Cleanup
        </span>
      </Stage>
    ),
  },
  {
    title: "Report trash",
    body: "See a dirty spot but cannot clean it now? Report it so someone else can find it.",
    how: [
      "Tap Report Trash",
      "Place the pin and rate how bad it is",
      "Take a photo (required)",
    ],
    visual: (
      <Stage>
        <span className={`${PILL} px-4 text-zinc-200`}>
          <svg className="w-4 h-4 text-amber-400" {...svgProps}>
            <path d="m10.3 3.9-8.2 14.2A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          Report Trash
        </span>
      </Stage>
    ),
  },
  {
    title: "Join a cleanup event",
    body: "Clean with a crew. Group cleanups are scheduled on the map, and everyone who shows up earns points.",
    how: [
      "Tap an event pin on the map",
      "RSVP to save your spot",
      "Show up and log your cleanup with the group",
    ],
    visual: (
      <Stage>
        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-sky-500/20 ring-2 ring-sky-400/60 text-lg">📅</span>
        <svg className="w-4 h-4 text-zinc-500" {...svgProps}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        <span className="inline-flex items-center h-10 px-5 rounded-full bg-sky-600 text-white text-sm font-semibold">RSVP</span>
      </Stage>
    ),
  },
  {
    title: "Spend points on rewards",
    body: "Local partner shops offer rewards you can unlock with your points.",
    how: [
      "Look for 🎁 pins or shop logos on the map",
      "Tap one to see the offer and what it costs",
      "The pin tells you when you have enough points",
    ],
    visual: (
      <Stage>
        <span className="flex items-center justify-center w-11 h-11 rounded-full bg-amber-500/20 ring-2 ring-amber-400/60 text-xl">🎁</span>
        <span className="flex items-center justify-center w-11 h-11 rounded-full bg-zinc-900 ring-2 ring-white/20 text-[10px] font-black text-zinc-300">LOGO</span>
      </Stage>
    ),
  },
  {
    title: "Lead a group event",
    body: "Hosting is for group organizers. If you run a group, you will see Host Event next to Report Trash.",
    how: [
      "Tap Host Event",
      "Set the place, time and details",
      "Members RSVP and log the cleanup with you",
    ],
    visual: (
      <Stage>
        <span className={`${PILL} px-4 text-sky-300`}>
          <svg className="w-4 h-4" {...svgProps}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          Host Event
        </span>
        <Chip>Group organizers</Chip>
      </Stage>
    ),
  },
  {
    title: "Hot spots",
    body: "When enough reports pile up in an area it becomes a hot spot. Cleanups inside one earn bonus points while it is active.",
    how: [
      "Look for the glowing zones on the map",
      "Open the Stats tab to see hot spot progress",
      "Log a cleanup inside the zone to earn the bonus",
    ],
    visual: (
      <Stage>
        <span className="flex items-center justify-center w-20 h-20 rounded-full bg-orange-500/10 ring-1 ring-orange-400/40">
          <span className="flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/20 ring-1 ring-orange-400/60 text-lg">🔥</span>
        </span>
        <Chip>Bonus points</Chip>
      </Stage>
    ),
  },
  {
    title: "Claim a report",
    body: "Take on someone's report and race the clock for a score multiplier.",
    how: [
      "Tap any report pin on the map",
      "Tap Claim and head to the spot",
      "Snap a before photo when you arrive",
      "Clean up and snap an after photo before time runs out",
    ],
    beta: true,
    visual: (
      <Stage>
        <span className="relative flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/20 ring-2 ring-amber-400/60">
          <span className="w-3 h-3 rounded-full bg-amber-400" />
        </span>
        <svg className="w-4 h-4 text-zinc-500" {...svgProps}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        <span className="inline-flex items-center h-10 px-5 rounded-full bg-violet-600 text-white text-sm font-semibold">Claim</span>
      </Stage>
    ),
  },
  {
    title: "Routes",
    body: "Cleaned a whole stretch? Log it as one route instead of a single pin.",
    how: [
      "Tap Log Cleanup and choose Route",
      "Draw the route on the map, or track it live as you walk",
      "Add your bags and photos as usual",
    ],
    visual: (
      <Stage>
        <svg className="w-40 h-16 text-sky-400" viewBox="0 0 160 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 50 C40 50 40 14 70 14 S110 50 150 20" strokeDasharray="1 7" />
          <circle cx="10" cy="50" r="5" fill="currentColor" />
          <circle cx="150" cy="20" r="5" fill="currentColor" />
        </svg>
      </Stage>
    ),
  },
  {
    title: "Layers and zip leaders",
    body: "See where cleanup activity is concentrated and who leads each area.",
    how: [
      "Tap Layers at the top of the map",
      "Pick Zip codes, Neighborhoods or Cities for stats",
      "Turn on Zip code leaders to color areas by who leads",
    ],
    visual: (
      <Stage>
        <Chip on>Zip codes</Chip>
        <Chip>Boroughs</Chip>
        <Chip>Leaders</Chip>
      </Stage>
    ),
  },
  {
    title: "Leaderboard and groups",
    body: "Track your rank and your group's rank, and stack points with friends.",
    how: [
      "Swipe up the tray at the bottom of the map",
      "Open Leaderboard to compare people and groups",
      "Join or start a group from the Groups page",
    ],
    visual: (
      <Stage>
        <Chip>Stats</Chip>
        <Chip on>Leaderboard</Chip>
        <Chip>Activity</Chip>
      </Stage>
    ),
  },
];

export default function TrashWarWalkthrough({
  intro,
  onClose,
}: {
  intro?: string | null;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const last = i === STEPS.length - 1;
  const step = STEPS[i];

  function go(n: number) {
    setI(Math.max(0, Math.min(STEPS.length - 1, n)));
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="How Trash War works"
    >
      <div
        className="relative w-full sm:max-w-md flex flex-col bg-zinc-900 border border-zinc-700/60 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
        }}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  n === i ? "w-6 bg-zinc-100" : n < i ? "w-1.5 bg-zinc-500" : "w-1.5 bg-zinc-700"
                }`}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 -mr-2 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:scale-[0.92] transition-[background-color,color,transform] duration-150 touch-manipulation"
          >
            <svg className="w-5 h-5" {...svgProps} strokeWidth={2}>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div key={i} className="px-6 pt-5 pb-4 min-h-[22rem] flex flex-col">
          {step.visual}
          <h2 className="mt-5 text-xl font-black text-zinc-100 tracking-tight flex items-center gap-2">
            {step.title}
            {step.beta && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded px-1 py-0.5 leading-none">
                Beta
              </span>
            )}
          </h2>
          <p className="mt-2 text-[15px] text-zinc-300 leading-relaxed">{step.body}</p>
          {step.how && (
            <ol className="mt-4 flex flex-col gap-2">
              {step.how.map((h, n) => (
                <li key={h} className="flex items-start gap-3 text-[13px] text-zinc-300 leading-snug">
                  <span className="mt-px w-5 h-5 shrink-0 rounded-full bg-zinc-800 text-zinc-400 text-[11px] font-bold flex items-center justify-center">{n + 1}</span>
                  {h}
                </li>
              ))}
            </ol>
          )}
          {i === 0 && intro && <p className="mt-4 text-xs text-zinc-500 leading-relaxed">{intro}</p>}
        </div>

        <div className="px-5 pt-1 flex items-center gap-2">
          {i > 0 ? (
            <button
              onClick={() => go(i - 1)}
              className="min-h-12 px-5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
            >
              Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="min-h-12 px-5 rounded-full text-zinc-400 hover:text-zinc-200 text-sm font-semibold active:scale-[0.97] transition-[color,transform] duration-150 touch-manipulation"
            >
              Skip
            </button>
          )}
          <button
            onClick={() => (last ? onClose() : go(i + 1))}
            className="flex-1 min-h-12 rounded-full bg-zinc-100 hover:bg-white text-zinc-900 text-sm font-bold active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
          >
            {last ? "Start cleaning" : "Next"}
          </button>
        </div>
      </div>
    </div>
    ,
    document.body,
  );
}
