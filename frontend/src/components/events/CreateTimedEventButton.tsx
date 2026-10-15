"use client";

import { useEffect, useState } from "react";
import TimedEventForm, { type TimedEventAreaPicker } from "./TimedEventForm";
import IconButton from "@/components/ui/IconButton";
import FlowSheet from "@/components/ui/FlowSheet";
import type { CreatedEvent } from "@/lib/events";

export default function CreateTimedEventButton({
  campaignId,
  areaPicker,
  open,
  onOpenChange,
  onCreated,
  className,
  hideTrigger,
  formKey,
}: {
  campaignId: string;
  areaPicker: TimedEventAreaPicker;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (event: CreatedEvent) => void;
  className?: string;
  hideTrigger?: boolean;
  /** Bump this to force the form to reset (e.g. after a full close/cancel). Area-pick
   * round trips should NOT bump this, so in-progress form data survives them. */
  formKey?: number | string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  return (
    <>
      {!hideTrigger && !dismissed && (
        <div className="relative group">
          <button
            onClick={() => onOpenChange(true)}
            className={
              className ??
              "px-3 py-1.5 text-xs font-medium rounded-lg border transition-[background-color,transform] duration-150 backdrop-blur-sm shadow-md bg-amber-950/80 border-amber-700/60 text-amber-300 hover:text-amber-200 hover:bg-amber-900 active:text-amber-200 active:bg-amber-900 active:scale-[0.97] touch-manipulation"
            }
          >
            New timed event
          </button>
          <IconButton
            onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
            title="Hide until next page refresh"
            aria-label="Hide until next page refresh"
            size="sm"
            className="absolute -top-3 -right-3 bg-zinc-800 border border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 active:text-zinc-200 active:bg-zinc-700 active:scale-[0.9] text-[10px] leading-none opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-[opacity,background-color,color,transform] duration-150 touch-manipulation"
          >
            ×
          </IconButton>
        </div>
      )}

      {everOpened && (
        <div className={open ? "" : "hidden"}>
          <FlowSheet title="New timed event" onClose={() => onOpenChange(false)}>
            <TimedEventForm
              key={formKey}
              campaignId={campaignId}
              areaPicker={areaPicker}
              onCreated={(event) => {
                onOpenChange(false);
                onCreated?.(event);
              }}
              onCancel={() => onOpenChange(false)}
            />
          </FlowSheet>
        </div>
      )}
    </>
  );
}
