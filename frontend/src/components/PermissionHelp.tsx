"use client";

import { isAndroidNative, isIOSNative } from "@/lib/capacitor";

const LABELS = { location: "Location", camera: "Camera", notifications: "Notifications" } as const;

/** Shown only after a permission was refused, with where to turn it back on. */
export default function PermissionHelp({ kind, alternative }: { kind: keyof typeof LABELS; alternative?: string }) {
  const label = LABELS[kind];
  const where = isIOSNative()
    ? `Open the Settings app, tap Frontline, then turn on ${label}.`
    : isAndroidNative()
      ? `Open Settings, tap Apps, then Frontline, then Permissions, and allow ${label}.`
      : `Click the lock icon next to the address bar and allow ${label} for this site.`;
  return (
    <div role="alert" className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-400/30 p-4 space-y-1">
      <p className="text-sm font-semibold text-amber-300">{label} is turned off</p>
      <p className="text-xs text-zinc-300">{where}</p>
      {alternative && <p className="text-xs text-zinc-400">{alternative}</p>}
    </div>
  );
}
