"use client";

import { useEffect, useRef, useState } from "react";
import EventAreaMapPicker, { type SelectedArea } from "@/app/admin/EventAreaMapPicker";
import { createTimedEvent, type CreatedEvent } from "@/lib/events";

const inputCls = "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500";

export interface TimedEventFormCampaign {
  id: string;
  title: string;
}

export type TimedEventAreaPicker =
  | { mode: "embedded"; unitType?: string | null }
  | { mode: "external"; areas: SelectedArea[]; onRequestPick: () => void };

export default function TimedEventForm({
  campaignId,
  campaigns,
  onCampaignChange,
  areaPicker,
  onCreated,
  onCancel,
}: {
  campaignId: string;
  campaigns?: TimedEventFormCampaign[];
  onCampaignChange?: (id: string) => void;
  areaPicker: TimedEventAreaPicker;
  onCreated: (event: CreatedEvent) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<SelectedArea[]>(
    areaPicker.mode === "external" ? areaPicker.areas : []
  );
  const [multiplier, setMultiplier] = useState("1");
  const [startTime, setStartTime] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (areaPicker.mode === "external") setSelectedAreas(areaPicker.areas);
  }, [areaPicker.mode === "external" ? areaPicker.areas : null]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const totalDurationMinutes =
    (Number(durationDays) || 0) * 1440 + (Number(durationHours) || 0) * 60 + (Number(durationMinutes) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignId || !title.trim() || selectedAreas.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const event = await createTimedEvent({
        campaignId,
        title,
        description,
        imageFile,
        areas: selectedAreas,
        multiplier: Number(multiplier) || 1,
        durationMinutes: totalDurationMinutes,
        startedAt: startTime ? new Date(startTime).toISOString() : null,
      });
      onCreated(event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {campaigns && onCampaignChange && (
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-zinc-500">Campaign</label>
            <select className={inputCls} value={campaignId} onChange={e => onCampaignChange(e.target.value)} required>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        )}
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Title</label>
          <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. Double Points Weekend" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Description</label>
          <textarea className={`${inputCls} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Score multiplier</label>
          <input type="number" min={1} step={0.1} className={inputCls} value={multiplier} onChange={e => setMultiplier(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Starts (optional)</label>
          <input type="datetime-local" className={inputCls} value={startTime} onChange={e => setStartTime(e.target.value)} />
          <p className="text-[10px] text-zinc-600">Tap outside the calendar to confirm your selection. Leave blank to start immediately.</p>
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Duration</label>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-0.5">
              <input type="number" min={0} className={inputCls} value={durationDays} onChange={e => setDurationDays(e.target.value)} placeholder="0" />
              <p className="text-[10px] text-zinc-600 text-center">days</p>
            </div>
            <div className="space-y-0.5">
              <input type="number" min={0} className={inputCls} value={durationHours} onChange={e => setDurationHours(e.target.value)} placeholder="0" />
              <p className="text-[10px] text-zinc-600 text-center">hours</p>
            </div>
            <div className="space-y-0.5">
              <input type="number" min={0} className={inputCls} value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} placeholder="0" />
              <p className="text-[10px] text-zinc-600 text-center">minutes</p>
            </div>
          </div>
          <p className="text-[10px] text-zinc-600">All blank/zero = indefinite.</p>
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Event area(s)</label>
          {areaPicker.mode === "embedded" ? (
            campaignId ? (
              <EventAreaMapPicker
                campaignId={campaignId}
                onChange={setSelectedAreas}
                mode="multi"
                unitType={areaPicker.unitType}
              />
            ) : (
              <p className="text-xs text-zinc-600">Select a campaign first.</p>
            )
          ) : (
            <div className="space-y-2">
              {selectedAreas.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedAreas.map(a => (
                    <span key={a.geoUnitId} className="px-2 py-0.5 text-xs rounded-full bg-amber-950/60 border border-amber-700/50 text-amber-300">
                      {a.displayName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">No areas selected yet.</p>
              )}
              <button
                type="button"
                onClick={areaPicker.onRequestPick}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                {selectedAreas.length > 0 ? "Edit selection on map" : "Pick areas on the map"}
              </button>
            </div>
          )}
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-zinc-500">Event image</label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500 transition-colors group shrink-0"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Event" className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full text-2xl">✨</span>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>
            <div className="text-xs text-zinc-500 space-y-0.5">
              <p>JPG, PNG or WebP</p>
              <p>Max 5 MB</p>
            </div>
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>
      </div>
      {selectedAreas.length === 0 && (
        <p className="text-amber-400 text-xs">Select at least one area for this event to apply to.</p>
      )}
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || !title.trim() || !campaignId || selectedAreas.length === 0}
          className="px-4 py-2 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-medium transition-colors"
        >
          {loading ? "Creating…" : "Create Timed Event"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
