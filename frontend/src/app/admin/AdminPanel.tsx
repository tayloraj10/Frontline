"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { SelectedArea } from "./EventAreaMapPicker";
import BusinessLocationMapPicker from "./BusinessLocationMapPicker";
import AddressAutocomplete from "./AddressAutocomplete";
import TimedEventForm from "@/components/events/TimedEventForm";
import BusinessForm, { type BusinessSocialLinks, type BusinessFormPayload } from "@/components/partners/BusinessForm";
import OfferForm, { type OfferFormPayload } from "@/components/partners/OfferForm";
import { updateEvent } from "@/lib/events";
import type { Json } from "@/types/database";

export type Campaign = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  campaign_type: string;
  contribution_type: string;
  geo_unit: string[] | null;
  status: string;
  created_at: string;
};

export type ActiveEvent = {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  image_url: string | null;
  effect_config: Json | null;
  status: string;
  started_at: string;
  ends_at: string | null;
  campaign_id: string;
  campaigns: { title: string; slug: string } | null;
};

export type Trigger = {
  id: string;
  name: string;
  condition_type: string;
  event_type: string;
  cooldown_hours: number;
  is_active: boolean;
  campaign_id: string;
  campaigns: { title: string; slug: string } | null;
};

export type PartnerBusiness = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
  social_links: BusinessSocialLinks | null;
  status: string;
  created_at: string;
};

export type PartnerOffer = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  redemption_mode: "spend" | "threshold";
  points_cost: number | null;
  points_threshold: number | null;
  max_redemptions_per_user: number | null;
  max_total_redemptions: number | null;
  code: string | null;
  status: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

export type OfferRedemption = {
  offer_id: string;
};

type Tab = "campaigns" | "triggers" | "events" | "partners" | "leaderboard";

function toSlug(name: string) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-900/60 text-emerald-400 border-emerald-800",
    draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
    paused: "bg-yellow-900/60 text-yellow-400 border-yellow-800",
    completed: "bg-blue-900/60 text-blue-400 border-blue-800",
    pending: "bg-amber-900/60 text-amber-400 border-amber-800",
    inactive: "bg-zinc-800 text-zinc-500 border-zinc-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border capitalize ${colors[status] ?? colors.draft}`}>
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    territory:  "bg-red-900/40 text-red-400",
    collage:    "bg-purple-900/40 text-purple-400",
    choropleth: "bg-blue-900/40 text-blue-400",
    heatmap:    "bg-orange-900/40 text-orange-400",
    hex_bloom:  "bg-emerald-900/40 text-emerald-400",
  };
  const labels: Record<string, string> = {
    hex_bloom: "Hex Bloom",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs capitalize ${colors[type] ?? "bg-zinc-800 text-zinc-400"}`}>
      {labels[type] ?? type}
    </span>
  );
}

const CONDITION_TEMPLATES: Record<string, object> = {
  threshold_reached: { threshold: 1000, metric: "total_value", title: "Milestone Reached!", description: "A campaign milestone has been hit. Keep the momentum going!" },
  report_count: { threshold: 5, title: "Hotspot!", description: "Reports have reached critical mass. Respond now!", duration_hours: 72 },
  time_elapsed: { hours: 168, title: "Weekly Check-in", description: "Time-based event triggered." },
};

const EFFECT_TEMPLATES: Record<string, object> = {
  boss_spawn: { type: "score_multiplier", multiplier: 2.0 },
  cascade_unlock: { unlocks: "new_zone" },
  notification: { message: "A campaign event has been triggered!" },
  seasonal_reset: { reset_type: "weighted" },
  decay_start: { decay_rate: 0.1 },
};

const EVENT_TYPE_INFO: Record<string, { desc: string; implemented: boolean }> = {
  boss_spawn:     { desc: "Spawns a hotspot in a geo unit when problem reports hit a threshold. Contributions in the affected area earn a score multiplier during the event (effect_config must be {\"type\": \"score_multiplier\", \"multiplier\": N} for the multiplier to apply). Trigger logic and scoring multiplier are both live.", implemented: true },
  cascade_unlock: { desc: "Intended to unlock new zones or content when a contribution milestone is reached. The event record is created but no unlock handler exists yet.", implemented: false },
  notification:   { desc: "Meant to broadcast a message to campaign participants when a trigger fires. The event record is created but no message is dispatched anywhere yet.", implemented: false },
  seasonal_reset: { desc: "Signals a campaign-wide or weighted score reset. The event record is created but no reset logic is implemented yet.", implemented: false },
  decay_start:    { desc: "Marks the start of a score decay period. The event record is created but no decay logic is implemented yet.", implemented: false },
  timed_event:    { desc: "Admin-created timed bonus event over one or more areas (effect_config is always {\"type\": \"score_multiplier\", \"multiplier\": N}). Never auto-triggered — created manually here or from the campaign page. Fully implemented.", implemented: true },
};

const inputCls = "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500";

// ─── Campaigns Tab ────────────────────────────────────────────────────────────

function CampaignsTab({ campaigns, setCampaigns }: {
  campaigns: Campaign[];
  setCampaigns: (c: Campaign[]) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [campaignType, setCampaignType] = useState("territory");
  const [contributionType, setContributionType] = useState("cleanup");
  const [geoUnit, setGeoUnit] = useState("zip");
  const [status, setStatus] = useState("draft");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slugEdited) setSlug(toSlug(val));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) return;
    setLoading(true);
    setError(null);

    const geoScope = campaignType === "collage" ? { scope: "global" } : { scope: "nationwide" };
    const unitLabel = { cleanup: "bags", photo: "photos", registration: "registrations", advocacy: "actions" }[contributionType] ?? "pts";
    const scoringRules = { unit: unitLabel, per_contribution: 1 };

    const supabase = createClient();
    const { data, error: insertErr } = await supabase
      .schema("public")
      .from("campaigns")
      .insert({
        slug: slug.trim(),
        title: title.trim(),
        description: description.trim() || null,
        campaign_type: campaignType,
        contribution_type: contributionType,
        geo_unit: geoUnit ? [geoUnit] : null,
        status,
        geo_scope: geoScope,
        scoring_rules: scoringRules,
        win_condition: { type: "open_ended" },
      })
      .select("id, slug, title, description, campaign_type, contribution_type, geo_unit, status, created_at")
      .single();

    if (insertErr) {
      setError(insertErr.code === "23505" ? "Slug already taken." : insertErr.message);
      setLoading(false);
      return;
    }

    setCampaigns([data as Campaign, ...campaigns]);
    setTitle(""); setSlug(""); setSlugEdited(false); setDescription("");
    setCampaignType("territory"); setContributionType("cleanup"); setGeoUnit("zip"); setStatus("draft");
    setShowCreate(false);
    setLoading(false);
  };

  const handleStatusChange = async (campaignId: string, newStatus: string) => {
    const supabase = createClient();
    await supabase.schema("public").from("campaigns").update({ status: newStatus }).eq("id", campaignId);
    setCampaigns(campaigns.map(c => c.id === campaignId ? { ...c, status: newStatus } : c));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">{campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}</span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
        >
          {showCreate ? "Cancel" : "+ New Campaign"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/40 space-y-4">
          <p className="text-sm font-semibold text-zinc-300">Create Campaign</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-zinc-500">Title</label>
              <input className={inputCls} value={title} onChange={e => handleTitleChange(e.target.value)} required placeholder="Campaign name" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-zinc-500">Slug</label>
              <input className={inputCls} value={slug} onChange={e => { setSlug(toSlug(e.target.value)); setSlugEdited(true); }} required placeholder="campaign-slug" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-zinc-500">Description</label>
              <textarea className={`${inputCls} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Campaign type</label>
              <select className={inputCls} value={campaignType} onChange={e => setCampaignType(e.target.value)}>
                <option value="territory">territory</option>
                <option value="collage">collage</option>
                <option value="choropleth">choropleth</option>
                <option value="heatmap">heatmap</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Contribution type</label>
              <select className={inputCls} value={contributionType} onChange={e => setContributionType(e.target.value)}>
                <option value="cleanup">cleanup</option>
                <option value="photo">photo</option>
                <option value="registration">registration</option>
                <option value="advocacy">advocacy</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Geo unit</label>
              <select className={inputCls} value={geoUnit} onChange={e => setGeoUnit(e.target.value)}>
                <option value="zip">zip</option>
                <option value="uk_postcode_district">uk_postcode_district</option>
                <option value="census_tract">census_tract</option>
                <option value="state">state</option>
                <option value="point">point</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Status</label>
              <select className={inputCls} value={status} onChange={e => setStatus(e.target.value)}>
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="paused">paused</option>
              </select>
            </div>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading || !title.trim() || !slug.trim()}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
          >
            {loading ? "Creating…" : "Create"}
          </button>
        </form>
      )}

      <div className="border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/40">
              <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Campaign</th>
              <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Type</th>
              <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-600 text-sm">No campaigns.</td>
              </tr>
            )}
            {campaigns.map(c => (
              <tr key={c.id} className="hover:bg-zinc-900/20">
                <td className="px-4 py-3">
                  <Link href={`/campaigns/${c.slug}`} className="text-zinc-200 hover:text-zinc-100 font-medium transition-colors">
                    {c.title}
                  </Link>
                  <p className="text-xs text-zinc-600 mt-0.5">/{c.slug} · {c.contribution_type}</p>
                </td>
                <td className="px-4 py-3"><TypeBadge type={c.campaign_type} /></td>
                <td className="px-4 py-3">
                  <select
                    value={c.status}
                    onChange={e => handleStatusChange(c.id, e.target.value)}
                    className="bg-transparent text-xs text-zinc-400 border-0 outline-none cursor-pointer"
                  >
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="completed">completed</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Triggers Tab ─────────────────────────────────────────────────────────────

function TriggersTab({ campaigns, triggers, setTriggers }: {
  campaigns: Campaign[];
  triggers: Trigger[];
  setTriggers: (t: Trigger[]) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [name, setName] = useState("");
  const [conditionType, setConditionType] = useState("threshold_reached");
  const [conditionConfigRaw, setConditionConfigRaw] = useState(
    JSON.stringify(CONDITION_TEMPLATES.threshold_reached, null, 2)
  );
  const [eventType, setEventType] = useState("boss_spawn");
  const [effectConfigRaw, setEffectConfigRaw] = useState(
    JSON.stringify(EFFECT_TEMPLATES.boss_spawn, null, 2)
  );
  const [cooldownHours, setCooldownHours] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConditionTypeChange = (val: string) => {
    setConditionType(val);
    const t = CONDITION_TEMPLATES[val];
    if (t) setConditionConfigRaw(JSON.stringify(t, null, 2));
  };

  const handleEventTypeChange = (val: string) => {
    setEventType(val);
    const t = EFFECT_TEMPLATES[val];
    if (t) setEffectConfigRaw(JSON.stringify(t, null, 2));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let conditionConfig: object;
    let effectConfig: object;
    try {
      conditionConfig = JSON.parse(conditionConfigRaw);
      effectConfig = JSON.parse(effectConfigRaw);
    } catch {
      setError("Invalid JSON in config fields.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error: insertErr } = await supabase
      .schema("public")
      .from("event_triggers")
      .insert({
        campaign_id: campaignId,
        name: name.trim(),
        condition_type: conditionType,
        condition_config: conditionConfig,
        event_type: eventType,
        effect_config: effectConfig,
        cooldown_hours: cooldownHours,
        is_active: true,
      })
      .select("id, name, condition_type, event_type, cooldown_hours, is_active, campaign_id")
      .single();

    if (insertErr) {
      setError(insertErr.message);
      setLoading(false);
      return;
    }

    const campaign = campaigns.find(c => c.id === campaignId);
    const newTrigger: Trigger = {
      ...(data as Omit<Trigger, "campaigns">),
      campaigns: campaign ? { title: campaign.title, slug: campaign.slug } : null,
    };
    setTriggers([...triggers, newTrigger]);
    setName("");
    setShowCreate(false);
    setLoading(false);
  };

  const handleToggle = async (trigger: Trigger) => {
    const supabase = createClient();
    await supabase.schema("public").from("event_triggers").update({ is_active: !trigger.is_active }).eq("id", trigger.id);
    setTriggers(triggers.map(t => t.id === trigger.id ? { ...t, is_active: !t.is_active } : t));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">{triggers.length} trigger{triggers.length !== 1 ? "s" : ""}</span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
        >
          {showCreate ? "Cancel" : "+ New Trigger"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/40 space-y-4">
          <p className="text-sm font-semibold text-zinc-300">Create Trigger</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-zinc-500">Campaign</label>
              <select className={inputCls} value={campaignId} onChange={e => setCampaignId(e.target.value)} required>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-zinc-500">Name</label>
              <input className={inputCls} value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Report threshold boss spawn" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Condition type</label>
              <select className={inputCls} value={conditionType} onChange={e => handleConditionTypeChange(e.target.value)}>
                <option value="threshold_reached">threshold_reached</option>
                <option value="report_count">report_count</option>
                <option value="time_elapsed">time_elapsed</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Event type</label>
              <select className={inputCls} value={eventType} onChange={e => handleEventTypeChange(e.target.value)}>
                <option value="boss_spawn">boss_spawn</option>
                <option value="cascade_unlock">cascade_unlock</option>
                <option value="notification">notification</option>
                <option value="seasonal_reset">seasonal_reset</option>
                <option value="decay_start">decay_start</option>
              </select>
              {EVENT_TYPE_INFO[eventType] && (
                <div className="mt-1.5 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs space-y-1">
                  <p className="text-zinc-400 leading-relaxed">{EVENT_TYPE_INFO[eventType].desc}</p>
                  {EVENT_TYPE_INFO[eventType].implemented
                    ? <span className="text-emerald-400">✓ Trigger logic implemented</span>
                    : <span className="text-amber-400">⚠ Stub — effect not yet implemented</span>
                  }
                </div>
              )}
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-zinc-500">Condition config (JSON)</label>
              <textarea className={`${inputCls} resize-none font-mono text-xs`} rows={5} value={conditionConfigRaw} onChange={e => setConditionConfigRaw(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-zinc-500">Effect config (JSON)</label>
              <textarea className={`${inputCls} resize-none font-mono text-xs`} rows={3} value={effectConfigRaw} onChange={e => setEffectConfigRaw(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Cooldown hours</label>
              <input type="number" min={0} className={inputCls} value={cooldownHours} onChange={e => setCooldownHours(Number(e.target.value))} />
            </div>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading || !name.trim() || !campaignId}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
          >
            {loading ? "Creating…" : "Create"}
          </button>
        </form>
      )}

      <div className="border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/40">
              <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Campaign</th>
              <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Condition</th>
              <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Fires</th>
              <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {triggers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-600 text-sm">No triggers.</td>
              </tr>
            )}
            {triggers.map(t => (
              <tr key={t.id} className="hover:bg-zinc-900/20">
                <td className="px-4 py-3 text-zinc-300 font-medium">{t.name}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs">{t.campaigns?.title ?? t.campaign_id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs font-mono">{t.condition_type}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs font-mono">{t.event_type}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggle(t)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${t.is_active ? "bg-emerald-600" : "bg-zinc-700"}`}
                    aria-label={t.is_active ? "Deactivate" : "Activate"}
                  >
                    <span className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-150 ${t.is_active ? "left-5" : "left-1"}`} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Events Tab ───────────────────────────────────────────────────────────────

const EVENT_ICON: Record<string, string> = {
  boss_spawn: "🔥",
  cascade_unlock: "🔓",
  notification: "🔔",
  seasonal_reset: "🔄",
  decay_start: "📉",
  timed_event: "✨",
};

function EventsTab({ campaigns, events, setEvents }: {
  campaigns: Campaign[];
  events: ActiveEvent[];
  setEvents: (e: ActiveEvent[]) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [eventType, setEventType] = useState("boss_spawn");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<SelectedArea[]>([]);
  const [geoUnitIdInput, setGeoUnitIdInput] = useState("");
  const [timedUnitType, setTimedUnitType] = useState("");
  const [multiplier, setMultiplier] = useState(2);
  const [durationHours, setDurationHours] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMultiplier, setEditMultiplier] = useState("");
  const [editEndsAt, setEditEndsAt] = useState("");
  const [editIndefinite, setEditIndefinite] = useState(false);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const getMultiplier = (config: Json | null): number | null => {
    if (config && typeof config === "object" && !Array.isArray(config) && "multiplier" in config) {
      const m = (config as { multiplier?: unknown }).multiplier;
      return typeof m === "number" ? m : null;
    }
    return null;
  };

  const startEdit = (event: ActiveEvent) => {
    setShowCreate(false);
    setEditingId(event.id);
    setEditTitle(event.title);
    setEditDescription(event.description ?? "");
    const m = getMultiplier(event.effect_config);
    setEditMultiplier(m !== null ? String(m) : "");
    setEditEndsAt(event.ends_at ? new Date(event.ends_at).toISOString().slice(0, 16) : "");
    setEditIndefinite(!event.ends_at);
    setEditImageFile(null);
    setEditImagePreview(null);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditImageFile(null);
    setEditImagePreview(null);
    setEditError(null);
  };

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditImageFile(file);
    setEditImagePreview(URL.createObjectURL(file));
  };

  const handleEditSubmit = async (e: React.FormEvent, event: ActiveEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const hasMultiplier = getMultiplier(event.effect_config) !== null;
      const updated = await updateEvent({
        eventId: event.id,
        title: editTitle,
        description: editDescription,
        imageFile: editImageFile,
        multiplier: hasMultiplier ? (Number(editMultiplier) || 1) : null,
        endsAt: editIndefinite || !editEndsAt ? null : new Date(editEndsAt).toISOString(),
      });
      setEvents(events.map(ev => ev.id === event.id ? { ...ev, ...updated, campaigns: ev.campaigns } : ev));
      cancelEdit();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update event");
    } finally {
      setEditLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const uploadEventImage = async (file: File): Promise<string> => {
    const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
    const res = await fetch(
      `${fastApiUrl}/api/upload/presign?filename=${encodeURIComponent(file.name)}&content_type=${encodeURIComponent(file.type)}&kind=events`
    );
    if (!res.ok) throw new Error("Failed to get upload URL");
    const { upload_url, public_url } = await res.json();
    const uploadRes = await fetch(upload_url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!uploadRes.ok) throw new Error("Image upload failed");
    return public_url;
  };

  const updateStatus = async (eventId: string, status: "active" | "paused" | "cancelled") => {
    setPendingId(eventId);
    const supabase = createClient();
    await supabase
      .from("campaign_events")
      .update({ status, ...(status === "cancelled" ? { resolved_at: new Date().toISOString() } : {}) })
      .eq("id", eventId);
    setEvents(events.map(e => e.id === eventId ? { ...e, status } : e));
    setPendingId(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignId || !title.trim()) return;
    setCreateLoading(true);
    setCreateError(null);

    const supabase = createClient();

    let imageUrl: string | null = null;
    try {
      if (imageFile) imageUrl = await uploadEventImage(imageFile);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Image upload failed");
      setCreateLoading(false);
      return;
    }

    const effectConfig = eventType === "boss_spawn"
      ? { type: "score_multiplier", multiplier }
      : EFFECT_TEMPLATES[eventType];

    const endsAt = durationHours.trim()
      ? new Date(Date.now() + Number(durationHours) * 3600_000).toISOString()
      : null;

    const { data, error: insertErr } = await supabase
      .schema("public")
      .from("campaign_events")
      .insert({
        campaign_id: campaignId,
        geo_unit_id: selectedAreas[0]?.geoUnitId ?? null,
        event_type: eventType,
        title: title.trim(),
        description: description.trim() || null,
        image_url: imageUrl,
        effect_config: effectConfig,
        status: "active",
        ends_at: endsAt,
      })
      .select("id, event_type, title, description, image_url, effect_config, status, started_at, ends_at, campaign_id")
      .single();

    if (insertErr) {
      setCreateError(insertErr.message);
      setCreateLoading(false);
      return;
    }

    if (selectedAreas.length > 0) {
      const { error: linkErr } = await supabase
        .schema("public")
        .from("campaign_event_geo_units")
        .insert(selectedAreas.map(a => ({ event_id: data.id, geo_unit_id: a.geoUnitId })));
      if (linkErr) {
        setCreateError(`Event created, but failed to link areas: ${linkErr.message}`);
      }
    }

    const campaign = campaigns.find(c => c.id === campaignId);
    const newEvent: ActiveEvent = {
      ...(data as Omit<ActiveEvent, "campaigns">),
      campaigns: campaign ? { title: campaign.title, slug: campaign.slug } : null,
    };
    setEvents([newEvent, ...events]);
    setTitle(""); setDescription(""); setSelectedAreas([]); setGeoUnitIdInput(""); setMultiplier(2); setDurationHours("");
    setImageFile(null); setImagePreview(null);
    setShowCreate(false);
    setCreateLoading(false);
  };

  const activeCount = events.filter(e => e.status === "active").length;
  const pausedCount = events.filter(e => e.status === "paused").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">
          {activeCount} active{pausedCount > 0 ? `, ${pausedCount} paused` : ""}
        </span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
        >
          {showCreate ? "Cancel" : "+ New Event"}
        </button>
      </div>

      {showCreate && (
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/40 space-y-4">
          <p className="text-sm font-semibold text-zinc-300">Create Event</p>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Event type</label>
            <select className={inputCls} value={eventType} onChange={e => setEventType(e.target.value)}>
              <option value="boss_spawn">boss_spawn</option>
              <option value="cascade_unlock">cascade_unlock</option>
              <option value="notification">notification</option>
              <option value="seasonal_reset">seasonal_reset</option>
              <option value="decay_start">decay_start</option>
              <option value="timed_event">timed_event</option>
            </select>
            {EVENT_TYPE_INFO[eventType] && !EVENT_TYPE_INFO[eventType].implemented && (
              <p className="text-amber-400 text-xs mt-1">⚠ Stub — effect not yet implemented, event will be created but has no gameplay effect.</p>
            )}
          </div>

          {eventType === "timed_event" ? (
            (() => {
              const unitTypes = campaigns.find(c => c.id === campaignId)?.geo_unit ?? [];
              const effectiveUnitType = unitTypes.length > 1 ? (timedUnitType || unitTypes[0]) : (unitTypes[0] ?? null);
              return (
                <>
                  {unitTypes.length > 1 && (
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-500">Geo unit type</label>
                      <select className={inputCls} value={effectiveUnitType ?? ""} onChange={e => setTimedUnitType(e.target.value)}>
                        {unitTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                  <TimedEventForm
                    campaignId={campaignId}
                    campaigns={campaigns}
                    onCampaignChange={setCampaignId}
                    areaPicker={{ mode: "embedded", unitType: effectiveUnitType }}
                    onCreated={(event) => {
                      const campaign = campaigns.find(c => c.id === event.campaign_id);
                      const newEvent: ActiveEvent = {
                        ...event,
                        campaigns: campaign ? { title: campaign.title, slug: campaign.slug } : null,
                      };
                      setEvents([newEvent, ...events]);
                      setShowCreate(false);
                    }}
                    onCancel={() => setShowCreate(false)}
                  />
                </>
              );
            })()
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs text-zinc-500">Campaign</label>
                  <select className={inputCls} value={campaignId} onChange={e => setCampaignId(e.target.value)} required>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs text-zinc-500">Title</label>
                  <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. Weekend Cleanup Blitz" />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs text-zinc-500">Description</label>
                  <textarea className={`${inputCls} resize-none`} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
                </div>
                {eventType === "boss_spawn" && (
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500">Score multiplier</label>
                    <input type="number" min={1} step={0.1} className={inputCls} value={multiplier} onChange={e => setMultiplier(Number(e.target.value))} />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500">Duration (hours)</label>
                  <input type="number" min={0} className={inputCls} value={durationHours} onChange={e => setDurationHours(e.target.value)} placeholder="Blank = indefinite" />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs text-zinc-500">Geo unit ID</label>
                  <input
                    className={inputCls}
                    value={geoUnitIdInput}
                    onChange={e => {
                      const value = e.target.value;
                      setGeoUnitIdInput(value);
                      setSelectedAreas(value.trim() ? [{ geoUnitId: value.trim(), displayName: value.trim(), unitType: "" }] : []);
                    }}
                    placeholder="Optional — e.g. a zip code"
                  />
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
                        <span className="flex items-center justify-center w-full h-full text-2xl">
                          {EVENT_ICON[eventType] ?? "⚡"}
                        </span>
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
              {createError && <p className="text-red-400 text-xs">{createError}</p>}
              <button
                type="submit"
                disabled={createLoading || !title.trim() || !campaignId}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
              >
                {createLoading ? "Creating…" : "Create"}
              </button>
            </form>
          )}
        </div>
      )}

      {events.length === 0 ? (
        <div className="border border-zinc-800 rounded-xl px-5 py-12 text-center text-zinc-600 text-sm">
          No active events.
        </div>
      ) : (
        <div className="space-y-2">
          {events.map(e => (
            <div key={e.id} className={`border rounded-xl px-5 py-4 ${e.status === "paused" ? "border-yellow-900/60 bg-yellow-950/10" : "border-zinc-800"}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <span className="text-xl shrink-0 mt-0.5">{EVENT_ICON[e.event_type] ?? "⚡"}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-200">{e.title}</p>
                    {e.status === "paused" && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-900/50 text-yellow-400 border border-yellow-800">paused</span>
                    )}
                  </div>
                  {e.description && (
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{e.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-zinc-600">{e.campaigns?.title ?? "Unknown campaign"}</span>
                    <span className="text-xs text-zinc-700">·</span>
                    <span className="text-xs text-zinc-600">{timeAgo(e.started_at)}</span>
                    {e.ends_at && (
                      <>
                        <span className="text-xs text-zinc-700">·</span>
                        <span className="text-xs text-zinc-600">
                          ends {new Date(e.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => (editingId === e.id ? cancelEdit() : startEdit(e))}
                  className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 rounded-lg transition-colors"
                >
                  {editingId === e.id ? "Close" : "Edit"}
                </button>
                {e.status === "active" && (
                  <button
                    onClick={() => updateStatus(e.id, "paused")}
                    disabled={pendingId === e.id}
                    className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-yellow-400 hover:border-yellow-900 rounded-lg transition-colors disabled:opacity-40"
                  >
                    Pause
                  </button>
                )}
                {e.status === "paused" && (
                  <button
                    onClick={() => updateStatus(e.id, "active")}
                    disabled={pendingId === e.id}
                    className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-emerald-400 hover:border-emerald-900 rounded-lg transition-colors disabled:opacity-40"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={() => updateStatus(e.id, "cancelled")}
                  disabled={pendingId === e.id}
                  className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-900 rounded-lg transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>

            {editingId === e.id && (() => {
              const hasMultiplier = getMultiplier(e.effect_config) !== null;
              return (
                <form onSubmit={ev => handleEditSubmit(ev, e)} className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-zinc-500">Title</label>
                      <input className={inputCls} value={editTitle} onChange={ev => setEditTitle(ev.target.value)} required />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-zinc-500">Description</label>
                      <textarea className={`${inputCls} resize-none`} rows={2} value={editDescription} onChange={ev => setEditDescription(ev.target.value)} placeholder="Optional" />
                    </div>
                    {hasMultiplier && (
                      <div className="space-y-1">
                        <label className="text-xs text-zinc-500">Score multiplier</label>
                        <input type="number" min={1} step={0.1} className={inputCls} value={editMultiplier} onChange={ev => setEditMultiplier(ev.target.value)} />
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-500">Ends at</label>
                      <input
                        type="datetime-local"
                        className={inputCls}
                        value={editEndsAt}
                        disabled={editIndefinite}
                        onChange={ev => setEditEndsAt(ev.target.value)}
                      />
                      <label className="flex items-center gap-1.5 text-xs text-zinc-500 mt-1">
                        <input type="checkbox" checked={editIndefinite} onChange={ev => setEditIndefinite(ev.target.checked)} />
                        Indefinite
                      </label>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-xs text-zinc-500">Event image</label>
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => editImageInputRef.current?.click()}
                          className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500 transition-colors group shrink-0"
                        >
                          {editImagePreview ? (
                            <img src={editImagePreview} alt="Event" className="w-full h-full object-cover" />
                          ) : e.image_url ? (
                            <img src={e.image_url} alt="Event" className="w-full h-full object-cover" />
                          ) : (
                            <span className="flex items-center justify-center w-full h-full text-2xl">
                              {EVENT_ICON[e.event_type] ?? "⚡"}
                            </span>
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
                        ref={editImageInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleEditImageChange}
                      />
                    </div>
                  </div>
                  {editError && <p className="text-red-400 text-xs">{editError}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={editLoading || !editTitle.trim()}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      {editLoading ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              );
            })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Partners Tab ─────────────────────────────────────────────────────────────

export function OfferRow({ offer, redemptionCount, onUpdated, onCancelled }: {
  offer: PartnerOffer;
  redemptionCount: number;
  onUpdated: (o: PartnerOffer) => void;
  onCancelled: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleEditOffer = async (payload: OfferFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { data, error: updateErr } = await supabase
      .schema("public")
      .from("partner_offers")
      .update(payload)
      .eq("id", offer.id)
      .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, max_total_redemptions, code, status, starts_at, ends_at, created_at")
      .single();

    if (updateErr) return updateErr.message;

    onUpdated(data as PartnerOffer);
    setEditing(false);
    return null;
  };

  const handleCancelOffer = async () => {
    if (!confirm(`Cancel "${offer.title}"? It will stop showing to users.`)) return;
    setCancelling(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase
      .schema("public")
      .from("partner_offers")
      .update({ status: "cancelled" })
      .eq("id", offer.id);
    setCancelling(false);
    if (updateErr) {
      alert(updateErr.message);
      return;
    }
    onCancelled(offer.id);
  };

  if (editing) {
    return (
      <OfferForm
        initial={offer}
        onSubmit={handleEditOffer}
        onCancel={() => setEditing(false)}
        submitLabel="Save changes"
      />
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-200">{offer.title}</p>
          {offer.description && <p className="text-xs text-zinc-500 mt-0.5">{offer.description}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{offer.redemption_mode}</span>
            {offer.redemption_mode === "spend"
              ? <span className="text-zinc-500">{offer.points_cost} pts</span>
              : <span className="text-zinc-500">{offer.points_threshold}+ pts to unlock</span>}
            <StatusBadge status={offer.status} />
            <span className="text-zinc-600">{redemptionCount}/{offer.max_total_redemptions ?? "∞"} redeemed</span>
            {offer.code && <span className="text-zinc-600 font-mono">code: {offer.code}</span>}
          </div>
        </div>
        {offer.status !== "cancelled" && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="px-2.5 py-1 text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 rounded-lg transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleCancelOffer}
              disabled={cancelling}
              className="px-2.5 py-1 text-xs border border-red-900/60 text-red-500 hover:text-red-400 hover:border-red-800 rounded-lg transition-colors disabled:opacity-40"
            >
              {cancelling ? "Cancelling…" : "Cancel offer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export type BusinessCampaignLink = { business_id: string; campaign_id: string };

type BusinessAdmin = { id: string; user_id: string; username: string | null; email: string };
type UserSearchResult = { id: string; username: string | null; email: string };

function BusinessAdminsManager({ businessId }: { businessId: string }) {
  const [admins, setAdmins] = useState<BusinessAdmin[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;

  const loadAdmins = async () => {
    const res = await fetch(`${fastApiUrl}/api/partners/businesses/${businessId}/admins`);
    if (res.ok) setAdmins(await res.json());
  };

  useEffect(() => {
    loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      const res = await fetch(`${fastApiUrl}/api/admin/users/search?q=${encodeURIComponent(query.trim())}`);
      setSearching(false);
      if (res.ok) setResults(await res.json());
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleAdd = async (user: UserSearchResult) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`${fastApiUrl}/api/partners/businesses/${businessId}/admins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.detail ?? "Failed to add admin");
      return;
    }
    setQuery("");
    setResults([]);
    await loadAdmins();
  };

  const handleRemove = async (adminId: string) => {
    if (!confirm("Remove this person's access to manage this business?")) return;
    const res = await fetch(`${fastApiUrl}/api/partners/businesses/${businessId}/admins/${adminId}`, {
      method: "DELETE",
    });
    if (res.ok) setAdmins((prev) => (prev ?? []).filter((a) => a.id !== adminId));
  };

  return (
    <div className="space-y-2 border-t border-zinc-800 pt-3">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Business admins</p>
      <p className="text-xs text-zinc-600">
        Users granted access here can log in and manage this business's info and offers from{" "}
        <span className="font-mono">/partners/dashboard</span>.
      </p>
      {admins === null ? (
        <p className="text-xs text-zinc-600">Loading…</p>
      ) : admins.length === 0 ? (
        <p className="text-xs text-zinc-600">No business admins yet.</p>
      ) : (
        <ul className="space-y-1">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-xs bg-zinc-900/60 rounded-lg px-3 py-1.5">
              <span className="text-zinc-300">{a.username ?? a.email} <span className="text-zinc-600">({a.email})</span></span>
              <button onClick={() => handleRemove(a.id)} className="text-red-500 hover:text-red-400 transition-colors">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username or email…"
          disabled={loading}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-100 text-xs focus:outline-none focus:border-zinc-500 disabled:opacity-40"
        />
        {query.trim().length >= 2 && (
          <div className="mt-1 w-full max-h-40 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg">
            {searching ? (
              <p className="text-xs text-zinc-600 px-3 py-2">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-xs text-zinc-600 px-3 py-2">No matching accounts.</p>
            ) : (
              results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleAdd(u)}
                  disabled={loading}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
                >
                  {u.username ?? u.email} <span className="text-zinc-600">({u.email})</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

function BusinessCard({
  business,
  offers,
  setOffers,
  redemptionCounts,
  campaigns,
  businesses,
  setBusinesses,
  businessCampaignLinks,
  setBusinessCampaignLinks,
}: {
  business: PartnerBusiness;
  offers: PartnerOffer[];
  setOffers: (o: PartnerOffer[]) => void;
  redemptionCounts: Record<string, number>;
  campaigns: Campaign[];
  businesses: PartnerBusiness[];
  setBusinesses: (b: PartnerBusiness[]) => void;
  businessCampaignLinks: BusinessCampaignLink[];
  setBusinessCampaignLinks: (l: BusinessCampaignLink[]) => void;
}) {
  const isPending = business.status === "pending";
  const [expanded, setExpanded] = useState(isPending);
  const [editing, setEditing] = useState(isPending);
  const [showCreateOffer, setShowCreateOffer] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const businessOffers = offers.filter(o => o.business_id === business.id);

  const handleCreateOffer = async (payload: OfferFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { data, error: insertErr } = await supabase
      .schema("public")
      .from("partner_offers")
      .insert({ ...payload, business_id: business.id, status: "active" })
      .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, max_total_redemptions, code, status, starts_at, ends_at, created_at")
      .single();

    if (insertErr) return insertErr.message;

    setOffers([...offers, data as PartnerOffer]);
    setShowCreateOffer(false);
    return null;
  };

  const businessCampaignIds = businessCampaignLinks.filter(l => l.business_id === business.id).map(l => l.campaign_id);

  const handleEditSubmit = async (payload: BusinessFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { campaignIds, ...rest } = payload;
    const { data, error: updateErr } = await supabase
      .schema("public")
      .from("partner_businesses")
      .update({ ...rest, status: isPending ? "active" : business.status })
      .eq("id", business.id)
      .select(
        "id, name, slug, description, logo_url, website_url, address_line1, address_line2, city, state, postal_code, country, lat, lng, google_maps_url, social_links, status, created_at"
      )
      .single();

    if (updateErr) return updateErr.code === "23505" ? "Slug already taken." : updateErr.message;

    const updated = data as PartnerBusiness;
    setBusinesses(businesses.map(b => (b.id === updated.id ? updated : b)));

    const currentLinked = new Set(businessCampaignIds);
    const nextLinked = new Set(campaignIds);
    const toAdd = campaignIds.filter(id => !currentLinked.has(id));
    const toRemove = [...currentLinked].filter(id => !nextLinked.has(id));

    if (toAdd.length > 0) {
      const { error: linkErr } = await supabase
        .schema("public")
        .from("campaign_partner_businesses")
        .insert(toAdd.map(campaign_id => ({ business_id: business.id, campaign_id })));
      if (linkErr) return `Business updated, but failed to link some campaigns: ${linkErr.message}`;
    }
    if (toRemove.length > 0) {
      const { error: unlinkErr } = await supabase
        .schema("public")
        .from("campaign_partner_businesses")
        .delete()
        .eq("business_id", business.id)
        .in("campaign_id", toRemove);
      if (unlinkErr) return `Business updated, but failed to unlink some campaigns: ${unlinkErr.message}`;
    }

    setBusinessCampaignLinks([
      ...businessCampaignLinks.filter(l => l.business_id !== business.id),
      ...campaignIds.map(campaign_id => ({ business_id: business.id, campaign_id })),
    ]);
    setEditing(false);
    return null;
  };

  const handleReject = async () => {
    if (!confirm(`Reject and delete "${business.name}"? This can't be undone.`)) return;
    setRejecting(true);
    const supabase = createClient();
    const { error: deleteErr } = await supabase
      .schema("public")
      .from("partner_businesses")
      .delete()
      .eq("id", business.id);
    setRejecting(false);
    if (deleteErr) {
      alert(deleteErr.message);
      return;
    }
    setBusinesses(businesses.filter(b => b.id !== business.id));
    setBusinessCampaignLinks(businessCampaignLinks.filter(l => l.business_id !== business.id));
  };

  return (
    <div className={`border rounded-xl overflow-hidden ${isPending ? "border-amber-800/60" : "border-zinc-800"}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-zinc-900/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-zinc-500 text-xs">{expanded ? "▾" : "▸"}</span>
          {business.logo_url ? (
            <img src={business.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
          ) : (
            <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-black text-zinc-400 shrink-0">
              {business.name[0]?.toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-200">{business.name}</p>
            <p className="text-xs text-zinc-600">{businessOffers.length} offer{businessOffers.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPending && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); handleReject(); }}
              className="text-xs text-red-500 hover:text-red-400 transition-colors px-2 py-1"
            >
              {rejecting ? "Rejecting…" : "Reject"}
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setEditing(!editing); setExpanded(true); }}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1"
          >
            {editing ? "Cancel edit" : "Edit"}
          </span>
          <StatusBadge status={business.status} />
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-3 bg-zinc-950/40">
          {isPending && (
            <p className="text-xs text-amber-400">
              Submitted by the business for review. Assign campaigns below and save to approve and publish it.
            </p>
          )}
          {editing && (
            <BusinessForm
              initial={business}
              initialCampaignIds={businessCampaignIds}
              campaigns={campaigns}
              onSubmit={handleEditSubmit}
              onCancel={() => setEditing(false)}
              submitLabel={isPending ? "Approve & publish" : "Save changes"}
            />
          )}
          {businessOffers.map(o => (
            <OfferRow
              key={o.id}
              offer={o}
              redemptionCount={redemptionCounts[o.id] ?? 0}
              onUpdated={(updated) => setOffers(offers.map(existing => existing.id === updated.id ? updated : existing))}
              onCancelled={(id) => setOffers(offers.map(existing => existing.id === id ? { ...existing, status: "cancelled" } : existing))}
            />
          ))}
          {businessOffers.length === 0 && !showCreateOffer && (
            <p className="text-xs text-zinc-600">No offers yet.</p>
          )}
          <button
            onClick={() => setShowCreateOffer(!showCreateOffer)}
            className="px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
          >
            {showCreateOffer ? "Cancel" : "+ New Offer"}
          </button>
          {showCreateOffer && (
            <OfferForm onSubmit={handleCreateOffer} onCancel={() => setShowCreateOffer(false)} submitLabel="Create offer" />
          )}
          {!isPending && <BusinessAdminsManager businessId={business.id} />}
        </div>
      )}
    </div>
  );
}

function PartnersTab({
  businesses,
  setBusinesses,
  offers,
  setOffers,
  redemptionCounts,
  campaigns,
  businessCampaignLinks,
  setBusinessCampaignLinks,
}: {
  businesses: PartnerBusiness[];
  setBusinesses: (b: PartnerBusiness[]) => void;
  offers: PartnerOffer[];
  setOffers: (o: PartnerOffer[]) => void;
  redemptionCounts: Record<string, number>;
  campaigns: Campaign[];
  businessCampaignLinks: BusinessCampaignLink[];
  setBusinessCampaignLinks: (l: BusinessCampaignLink[]) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const pendingBusinesses = businesses.filter(b => b.status === "pending");
  const publishedBusinesses = businesses.filter(b => b.status !== "pending");

  const handleCreateSubmit = async (payload: BusinessFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { campaignIds, ...rest } = payload;
    const { data, error: insertErr } = await supabase
      .schema("public")
      .from("partner_businesses")
      .insert({ ...rest, status: "active" })
      .select(
        "id, name, slug, description, logo_url, website_url, address_line1, address_line2, city, state, postal_code, country, lat, lng, google_maps_url, social_links, status, created_at"
      )
      .single();

    if (insertErr) return insertErr.code === "23505" ? "Slug already taken." : insertErr.message;

    const newBusiness = data as PartnerBusiness;
    setBusinesses([newBusiness, ...businesses]);

    if (campaignIds.length > 0) {
      const { error: linkErr } = await supabase
        .schema("public")
        .from("campaign_partner_businesses")
        .insert(campaignIds.map(campaign_id => ({ business_id: newBusiness.id, campaign_id })));
      if (linkErr) {
        setShowCreate(false);
        return `Business created, but failed to link campaigns: ${linkErr.message}`;
      }
      setBusinessCampaignLinks([
        ...businessCampaignLinks,
        ...campaignIds.map(campaign_id => ({ business_id: newBusiness.id, campaign_id })),
      ]);
    }
    setShowCreate(false);
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">{businesses.length} partner{businesses.length !== 1 ? "s" : ""}</span>
        <div className="flex items-center gap-2">
          <Link
            href="/partners/apply"
            target="_blank"
            className="px-3 py-1.5 text-xs border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg font-medium transition-colors"
          >
            Open apply form ↗
          </Link>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/partners/apply`);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 1500);
            }}
            className="px-3 py-1.5 text-xs border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg font-medium transition-colors"
          >
            {linkCopied ? "Copied!" : "Copy link"}
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
          >
            {showCreate ? "Cancel" : "+ New Partner"}
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Share <span className="text-zinc-400">/partners/apply</span> with a business to let them submit their own listing for review.
      </p>

      {showCreate && (
        <BusinessForm
          initialCampaignIds={[]}
          campaigns={campaigns}
          onSubmit={handleCreateSubmit}
          onCancel={() => setShowCreate(false)}
          submitLabel="Create"
        />
      )}

      {pendingBusinesses.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
            Pending review ({pendingBusinesses.length})
          </p>
          {pendingBusinesses.map(b => (
            <BusinessCard
              key={b.id}
              business={b}
              offers={offers}
              setOffers={setOffers}
              redemptionCounts={redemptionCounts}
              campaigns={campaigns}
              businesses={businesses}
              setBusinesses={setBusinesses}
              businessCampaignLinks={businessCampaignLinks}
              setBusinessCampaignLinks={setBusinessCampaignLinks}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {businesses.length === 0 && (
          <div className="border border-zinc-800 rounded-xl px-5 py-12 text-center text-zinc-600 text-sm">
            No partner businesses.
          </div>
        )}
        {publishedBusinesses.map(b => (
          <BusinessCard
            key={b.id}
            business={b}
            offers={offers}
            setOffers={setOffers}
            redemptionCounts={redemptionCounts}
            campaigns={campaigns}
            businesses={businesses}
            setBusinesses={setBusinesses}
            businessCampaignLinks={businessCampaignLinks}
            setBusinessCampaignLinks={setBusinessCampaignLinks}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────

type LeaderboardEntry = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_value: number;
  contribution_count: number;
  small_bags: number;
  large_bags: number;
  pounds: number;
  photo_count: number;
};

function mostRecentMonday(from: Date): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function LeaderboardTab({ campaigns }: { campaigns: Campaign[] }) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const thisMonday = mostRecentMonday(new Date());
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const [startDate, setStartDate] = useState(toDateInputValue(thisMonday));
  const [endDate, setEndDate] = useState(toDateInputValue(nextMonday));
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setThisWeek = () => {
    const monday = mostRecentMonday(new Date());
    const nextMon = new Date(monday);
    nextMon.setDate(nextMon.getDate() + 7);
    setStartDate(toDateInputValue(monday));
    setEndDate(toDateInputValue(nextMon));
  };

  const fetchLeaderboard = async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start", new Date(startDate).toISOString());
      if (endDate) params.set("end", new Date(endDate).toISOString());
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/campaigns/${campaignId}/leaderboard/range?${params.toString()}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to load leaderboard");
      setEntries(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Campaign</label>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className={inputCls}
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Start</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">End</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
        </div>
        <button
          onClick={setThisWeek}
          className="px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg transition-colors"
        >
          This week (Mon–Mon)
        </button>
        <button
          onClick={fetchLeaderboard}
          disabled={!campaignId || loading}
          className="px-4 py-2 text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {entries.length > 0 && (
        <div className="overflow-x-auto border border-zinc-800 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-800">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Small bags</th>
                <th className="px-3 py-2 text-right">Large bags</th>
                <th className="px-3 py-2 text-right">Submissions</th>
                <th className="px-3 py-2 text-right">Photos</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={entry.user_id} className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
                  <td className="px-3 py-2 text-zinc-500 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/leaderboard/${campaignId}/${entry.user_id}?start=${encodeURIComponent(new Date(startDate).toISOString())}&end=${encodeURIComponent(new Date(endDate).toISOString())}`}
                      className="text-emerald-400 hover:underline"
                    >
                      {entry.display_name || entry.username || entry.user_id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-100">{entry.total_value}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{entry.small_bags}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{entry.large_bags}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{entry.contribution_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={entry.photo_count === 0 ? "text-red-400 font-semibold" : "text-zinc-400"}>
                      {entry.photo_count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && entries.length === 0 && !error && (
        <p className="text-sm text-zinc-500">Pick a campaign and date range, then click Run.</p>
      )}
    </div>
  );
}

export default function AdminPanel({
  initialCampaigns,
  initialEvents,
  initialTriggers,
  initialBusinesses,
  initialOffers,
  initialOfferRedemptions,
  initialBusinessCampaignLinks,
}: {
  initialCampaigns: Campaign[];
  initialEvents: ActiveEvent[];
  initialTriggers: Trigger[];
  initialBusinesses: PartnerBusiness[];
  initialOffers: PartnerOffer[];
  initialOfferRedemptions: OfferRedemption[];
  initialBusinessCampaignLinks: BusinessCampaignLink[];
}) {
  const [tab, setTab] = useState<Tab>("campaigns");
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [events, setEvents] = useState(initialEvents);
  const [triggers, setTriggers] = useState(initialTriggers);
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [offers, setOffers] = useState(initialOffers);
  const redemptionCounts = initialOfferRedemptions.reduce<Record<string, number>>((acc, r) => {
    acc[r.offer_id] = (acc[r.offer_id] ?? 0) + 1;
    return acc;
  }, {});
  const [businessCampaignLinks, setBusinessCampaignLinks] = useState(initialBusinessCampaignLinks);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [seedDemoResult, setSeedDemoResult] = useState<string | null>(null);

  const handleSeedDemo = async () => {
    setSeedingDemo(true);
    setSeedDemoResult(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/admin/seed/demo-data`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed");
      const errs = data.errors?.length ? ` · ${data.errors.length} error(s)` : "";
      setSeedDemoResult(`✓ ${data.inserted} inserted, ${data.skipped} skipped${errs}`);
    } catch (err) {
      setSeedDemoResult(`✗ ${err instanceof Error ? err.message : "Error"}`);
    } finally {
      setSeedingDemo(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 w-full">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-100">Admin Panel</h1>
          <p className="text-sm text-zinc-500 mt-1">Internal campaign management</p>
        </div>
        {process.env.NODE_ENV === "development" && (
          <div className="flex flex-col items-end gap-1.5">
            <button
              onClick={handleSeedDemo}
              disabled={seedingDemo}
              className="px-4 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 rounded-xl transition-colors disabled:opacity-50"
            >
              {seedingDemo ? "Seeding…" : "Seed Demo Data"}
            </button>
            {seedDemoResult && (
              <span className={`text-xs ${seedDemoResult.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>
                {seedDemoResult}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-1 mb-6 border-b border-zinc-800">
        {(["campaigns", "triggers", "events", "partners", "leaderboard"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
              tab === t
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t}
            {t === "events" && events.filter(e => e.status === "active").length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-900/60 text-red-400 text-xs tabular-nums">
                {events.filter(e => e.status === "active").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "campaigns" && <CampaignsTab campaigns={campaigns} setCampaigns={setCampaigns} />}
      {tab === "triggers" && <TriggersTab campaigns={campaigns} triggers={triggers} setTriggers={setTriggers} />}
      {tab === "events" && <EventsTab campaigns={campaigns} events={events} setEvents={setEvents} />}
      {tab === "partners" && (
        <PartnersTab
          businesses={businesses}
          setBusinesses={setBusinesses}
          offers={offers}
          setOffers={setOffers}
          redemptionCounts={redemptionCounts}
          campaigns={campaigns}
          businessCampaignLinks={businessCampaignLinks}
          setBusinessCampaignLinks={setBusinessCampaignLinks}
        />
      )}
      {tab === "leaderboard" && <LeaderboardTab campaigns={campaigns} />}
    </main>
  );
}
