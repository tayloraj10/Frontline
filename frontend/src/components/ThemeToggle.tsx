"use client";

import { useEffect, useState } from "react";

const KEY = "frontline:theme";
type Choice = "system" | "light" | "dark";
const OPTIONS: { value: Choice; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // storage blocked: the choice still applies for this visit
  }
}

/** Appearance setting. Auto follows the phone's light/dark setting; Light is easier to read in direct sun. */
export default function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    // Reads the pre-paint theme attribute set in layout.tsx; only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "light" || saved === "dark") setChoice(saved);
  }, []);

  return (
    <div role="radiogroup" aria-label="Appearance" className="inline-flex p-1 rounded-2xl bg-zinc-900 gap-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={choice === o.value}
          onClick={() => {
            setChoice(o.value);
            apply(o.value);
          }}
          className={`min-h-11 px-5 rounded-xl text-sm font-semibold transition-colors duration-150 touch-manipulation ${
            choice === o.value ? "bg-emerald-400 text-emerald-950" : "text-zinc-400 hover:text-zinc-100 active:text-zinc-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
