"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

const KEY = "frontline:theme";
type Choice = "system" | "light" | "dark";
const OPTIONS: { value: Choice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Auto", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // storage blocked: the choice still applies for this visit
  }
}

/** Appearance setting. Auto follows the phone's light/dark setting; Light is easier to read in direct sun. */
/** `compact` is the icon-only version for tight spots like the user dropdown. */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    // Reads the pre-paint theme attribute set in layout.tsx; only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "light" || saved === "dark") setChoice(saved);
  }, []);

  return (
    <div role="radiogroup" aria-label="Appearance" className={`p-1 rounded-2xl gap-1 ${compact ? "flex w-full bg-zinc-800/60" : "inline-flex bg-zinc-900"}`}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={choice === o.value}
          aria-label={compact ? o.label : undefined}
          title={compact ? o.label : undefined}
          onClick={() => {
            setChoice(o.value);
            apply(o.value);
          }}
          className={`rounded-xl text-sm font-semibold transition-colors duration-150 touch-manipulation ${
            compact ? "flex-1 min-h-9 inline-flex items-center justify-center" : "min-h-11 px-5"
          } ${
            choice === o.value ? "bg-emerald-400 text-emerald-950" : "text-zinc-400 hover:text-zinc-100 active:text-zinc-100"
          }`}
        >
          {compact ? <o.Icon className="h-4 w-4" aria-hidden="true" /> : o.label}
        </button>
      ))}
    </div>
  );
}
