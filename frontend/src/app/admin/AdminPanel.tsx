"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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

type Tab = "campaigns" | "triggers" | "events";

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
};

function EventsTab({ events, setEvents }: {
  events: ActiveEvent[];
  setEvents: (e: ActiveEvent[]) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);

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

  const activeCount = events.filter(e => e.status === "active").length;
  const pausedCount = events.filter(e => e.status === "paused").length;

  return (
    <div className="space-y-4">
      <span className="text-sm text-zinc-500">
        {activeCount} active{pausedCount > 0 ? `, ${pausedCount} paused` : ""}
      </span>

      {events.length === 0 ? (
        <div className="border border-zinc-800 rounded-xl px-5 py-12 text-center text-zinc-600 text-sm">
          No active events.
        </div>
      ) : (
        <div className="space-y-2">
          {events.map(e => (
            <div key={e.id} className={`border rounded-xl px-5 py-4 flex items-start justify-between gap-4 ${e.status === "paused" ? "border-yellow-900/60 bg-yellow-950/10" : "border-zinc-800"}`}>
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
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────

export default function AdminPanel({ initialCampaigns, initialEvents, initialTriggers }: {
  initialCampaigns: Campaign[];
  initialEvents: ActiveEvent[];
  initialTriggers: Trigger[];
}) {
  const [tab, setTab] = useState<Tab>("campaigns");
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [events, setEvents] = useState(initialEvents);
  const [triggers, setTriggers] = useState(initialTriggers);
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
        {(["campaigns", "triggers", "events"] as Tab[]).map(t => (
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
      {tab === "events" && <EventsTab events={events} setEvents={setEvents} />}
    </main>
  );
}
