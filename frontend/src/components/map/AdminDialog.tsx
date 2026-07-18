"use client";

import LayerToggle from "./LayerToggle";

export default function AdminDialog({
  open,
  onOpenChange,
  onOpenTimedEvent,
  showNycToggle,
  nycNeighborhoodsVisible,
  onNycNeighborhoodsVisibleChange,
  onHideControls,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTimedEvent: () => void;
  showNycToggle: boolean;
  nycNeighborhoodsVisible: boolean;
  onNycNeighborhoodsVisibleChange: (visible: boolean) => void;
  onHideControls: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      <div className="relative max-w-sm w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 shadow-2xl">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 text-lg leading-none"
        >
          ×
        </button>
        <h3 className="text-lg font-semibold text-white mb-3">⚙️ Admin controls</h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={onOpenTimedEvent}
            className="w-full text-left px-3 py-2 text-sm font-medium rounded-lg border transition-colors bg-amber-950/80 border-amber-700/60 text-amber-300 hover:text-amber-200 hover:bg-amber-900"
          >
            ✨ New Timed Event
          </button>
          {showNycToggle && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/60">
              <span className="text-sm text-zinc-300">🗺️ NYC neighborhoods overlay</span>
              <LayerToggle
                label={nycNeighborhoodsVisible ? "On" : "Off"}
                checked={nycNeighborhoodsVisible}
                onChange={onNycNeighborhoodsVisibleChange}
              />
            </div>
          )}
          <button
            onClick={onHideControls}
            title="Hides the admin gear button until the next page refresh — useful for screenshots/recording"
            className="w-full text-left px-3 py-2 text-sm rounded-lg border transition-colors bg-zinc-800/60 border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          >
            Hide admin controls until next refresh
          </button>
        </div>
      </div>
    </div>
  );
}
