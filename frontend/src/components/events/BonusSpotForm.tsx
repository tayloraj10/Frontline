"use client";

import { useEffect, useState } from "react";
import BonusSpotContextMap from "@/components/events/BonusSpotContextMap";
import { createBonusSpot, suggestBonusSpot, type BonusSpot } from "@/lib/events";
import { useGameSettings } from "@/lib/gameSettings";

const inputCls = "w-full min-h-11 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500";

const NYC_CENTER: [number, number] = [-73.95, 40.7];

export interface BonusSpotFormCampaign {
  id: string;
  title: string;
}

export default function BonusSpotForm({
  campaignId,
  campaigns,
  onCampaignChange,
  viewerUserId,
  onCreated,
  onCancel,
}: {
  campaignId: string;
  campaigns?: BonusSpotFormCampaign[];
  onCampaignChange?: (id: string) => void;
  viewerUserId: string;
  onCreated: (spot: BonusSpot) => void;
  onCancel: () => void;
}) {
  const { values: settingsValues } = useGameSettings([
    "bonus_spot_multiplier",
    "bonus_spot_default_radius_m",
    "bonus_spot_default_duration_minutes",
  ] as const);

  const [description, setDescription] = useState("");
  const [multiplier, setMultiplier] = useState("");
  const [radiusFt, setRadiusFt] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");

  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLng, setPinLng] = useState<number | null>(null);
  const [sourceProblemReportId, setSourceProblemReportId] = useState<string | undefined>(undefined);
  const [suggestReason, setSuggestReason] = useState<string | null>(null);

  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const METERS_PER_FOOT = 0.3048;
  const FEET_PER_METER = 1 / METERS_PER_FOOT;

  const defaultMultiplier = settingsValues.bonus_spot_multiplier ?? 2;
  const defaultRadiusM = settingsValues.bonus_spot_default_radius_m ?? 182.88;
  const defaultDurationMinutes = settingsValues.bonus_spot_default_duration_minutes ?? 4320;

  // Prefill the actual resolved default values into the inputs once game_settings has
  // loaded, rather than leaving the fields blank with only a placeholder hint -- it was
  // ambiguous whether the shown default would actually be used at submit time.
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  useEffect(() => {
    if (defaultsApplied) return;
    if (settingsValues.bonus_spot_multiplier === undefined) return;
    setMultiplier(String(settingsValues.bonus_spot_multiplier ?? 2));
    setRadiusFt(String(Math.round((settingsValues.bonus_spot_default_radius_m ?? 182.88) * FEET_PER_METER)));
    const totalMin = settingsValues.bonus_spot_default_duration_minutes ?? 4320;
    setDurationDays(String(Math.floor(totalMin / 1440)));
    setDurationHours(String(Math.floor((totalMin % 1440) / 60)));
    setDurationMinutes(String(Math.round(totalMin % 60)));
    setDefaultsApplied(true);
  }, [settingsValues, defaultsApplied]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveMultiplier = Number(multiplier) || defaultMultiplier;
  const effectiveRadius = Number(radiusFt) > 0 ? Number(radiusFt) * METERS_PER_FOOT : defaultRadiusM;

  const totalDurationMinutes =
    (Number(durationDays) || 0) * 1440 + (Number(durationHours) || 0) * 60 + (Number(durationMinutes) || 0);
  const effectiveDuration = totalDurationMinutes || defaultDurationMinutes;

  const formatDuration = (minutes: number) => {
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    const m = Math.round(minutes % 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || parts.length === 0) parts.push(`${m}m`);
    return parts.join(" ");
  };

  const rollSuggestion = async () => {
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const result = await suggestBonusSpot({
        campaignId,
        viewerUserId,
        excludeReportId: sourceProblemReportId,
      });
      if (result.found) {
        setPinLat(result.lat);
        setPinLng(result.lng);
        setSourceProblemReportId(result.report_id);
        const bits: string[] = [];
        if (result.nearby_report_count > 0) bits.push(`near ${result.nearby_report_count} other report${result.nearby_report_count === 1 ? "" : "s"}`);
        if (result.near_partner) bits.push("near a partner business");
        setSuggestReason(bits.length > 0 ? bits.join(", ") : `${result.severity} severity report`);
      } else {
        setSuggestError("No eligible report found to suggest a spot from. Try dropping the pin manually instead.");
      }
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Failed to find a spot");
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignId) return;
    if (pinLat === null || pinLng === null) return;
    const lat = pinLat;
    const lng = pinLng;

    setLoading(true);
    setError(null);
    try {
      const spot = await createBonusSpot({
        campaignId,
        viewerUserId,
        lat,
        lng,
        radiusM: effectiveRadius,
        durationMinutes: effectiveDuration,
        multiplier: effectiveMultiplier,
        description: description.trim() || undefined,
        sourceProblemReportId,
      });
      onCreated(spot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bonus spot");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = pinLat !== null && pinLng !== null;

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
          <label className="text-xs text-zinc-500">Description</label>
          <textarea className={`${inputCls} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Multiplier</label>
          <input
            type="number" min={1} step={0.1} className={inputCls}
            value={multiplier}
            onChange={e => setMultiplier(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Radius (feet)</label>
          <input
            type="number" min={1} className={inputCls}
            value={radiusFt}
            onChange={e => setRadiusFt(e.target.value)}
          />
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
          <p className="text-[10px] text-zinc-600">
            Total: {formatDuration(effectiveDuration)}
          </p>
        </div>

        <div className="col-span-2 space-y-2">
          <label className="text-xs text-zinc-500">Location</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={rollSuggestion}
              disabled={suggestLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 active:scale-95 transition-[background-color,transform] duration-150 disabled:opacity-40"
            >
              {suggestLoading ? "Rolling…" : sourceProblemReportId ? "Re-roll" : "Suggest a spot"}
            </button>
            {suggestReason && <p className="text-xs text-zinc-500">{suggestReason}</p>}
          </div>
          {suggestError && <p className="text-red-400 text-xs">{suggestError}</p>}
          <BonusSpotContextMap
            campaignId={campaignId}
            lat={pinLat}
            lng={pinLng}
            onChange={(lat, lng) => {
              setPinLat(lat);
              setPinLng(lng);
              setSourceProblemReportId(undefined);
              setSuggestReason(null);
            }}
            editable
            initialCenter={NYC_CENTER}
            initialZoom={9}
            heightClassName="h-[320px]"
          />
        </div>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || !campaignId || !canSubmit}
          className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 active:bg-amber-600 active:scale-[0.97] disabled:active:scale-100 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-medium transition-[background-color,transform] duration-150 touch-manipulation"
        >
          {loading ? "Spawning…" : "Spawn Bonus Spot"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-700 active:scale-[0.97] text-zinc-300 rounded-lg font-medium transition-[background-color,transform] duration-150 touch-manipulation"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
