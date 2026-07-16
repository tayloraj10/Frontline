"use client";

import { useState } from "react";
import TimedEventForm, { type TimedEventAreaPicker } from "./TimedEventForm";
import type { CreatedEvent } from "@/lib/events";

export default function CreateTimedEventButton({
  campaignId,
  areaPicker,
  open,
  onOpenChange,
  onCreated,
  className,
  hideTrigger,
}: {
  campaignId: string;
  areaPicker: TimedEventAreaPicker;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (event: CreatedEvent) => void;
  className?: string;
  hideTrigger?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  return (
    <>
      {!hideTrigger && !dismissed && (
        <div className="relative group">
          <button
            onClick={() => onOpenChange(true)}
            className={
              className ??
              "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors backdrop-blur-sm shadow-md bg-amber-950/80 border-amber-700/60 text-amber-300 hover:text-amber-200 hover:bg-amber-900"
            }
          >
            ✨ New Timed Event
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
            title="Hide until next page refresh"
            className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ×
          </button>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
        >
          <div className="relative max-w-lg w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 shadow-2xl max-h-[85vh] overflow-y-auto">

            <button
              onClick={() => onOpenChange(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 text-lg leading-none"
            >
              ×
            </button>
            <h3 className="text-lg font-semibold text-white mb-3">✨ New Timed Event</h3>
            <TimedEventForm
              campaignId={campaignId}
              areaPicker={areaPicker}
              onCreated={(event) => {
                onOpenChange(false);
                onCreated?.(event);
              }}
              onCancel={() => onOpenChange(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
