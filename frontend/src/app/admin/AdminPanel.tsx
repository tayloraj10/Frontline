"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/cn";
import type { SelectedArea } from "./EventAreaMapPicker";
import BusinessLocationMapPicker from "./BusinessLocationMapPicker";
import AddressAutocomplete from "./AddressAutocomplete";
import TimedEventForm from "@/components/events/TimedEventForm";
import BonusSpotForm from "@/components/events/BonusSpotForm";
import BusinessForm, { type BusinessSocialLinks, type BusinessFormPayload } from "@/components/partners/BusinessForm";
import OfferForm, { type OfferFormPayload, type OfferFormLocation } from "@/components/partners/OfferForm";
import BackButton from "@/components/ui/BackButton";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { updateEvent } from "@/lib/events";
import { deleteGroup } from "@/lib/groups";
import { reconcileBusinessLocations } from "@/lib/partnerLocations";
import { listTeamEvents, getTeamEvent, type TeamEventListItem, type TeamEventDetail } from "@/lib/teamEvents";
import NewTeamEventForm from "./team-events/new/NewTeamEventForm";
import EditTeamEventView from "./team-events/[id]/edit/EditTeamEventView";
import AdminRolesTab from "./AdminRolesTab";
import type { Json, Database } from "@/types/database";

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
  counts_toward_spendable_points: boolean;
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
  condition_config: Json | null;
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
  social_links: BusinessSocialLinks | null;
  status: string;
  created_at: string;
};

export type PartnerBusinessLocation = {
  id: string;
  business_id: string;
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
  status: string;
  created_at: string;
};

export type PartnerOffer = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  redemption_mode: "spend" | "threshold" | "event_only";
  points_cost: number | null;
  points_threshold: number | null;
  max_redemptions_per_user: number | null;
  max_total_redemptions: number | null;
  event_redemption_limit: number | null;
  code: string | null;
  status: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  location_id: string | null;
  event_eligible: boolean;
};

export type OfferRedemption = {
  offer_id: string;
};

export type AdminGroup = Database["public"]["Tables"]["groups"]["Row"] & {
  applicant: { username: string | null; display_name: string | null } | null;
  admin_count: number;
};

export type GameSetting = {
  key: string;
  value: number;
  category: string;
  label: string;
  description: string | null;
  sort_order: number;
};

const TAB_VALUES = ["campaigns", "triggers", "events", "partners", "groups", "team_events", "leaderboard", "moderation", "admins", "settings"] as const;
type Tab = (typeof TAB_VALUES)[number];

const TAB_ICON: Record<Tab, string> = {
  campaigns: "🏁",
  triggers: "⚡",
  events: "🎉",
  partners: "🤝",
  groups: "👥",
  team_events: "⚔️",
  leaderboard: "🏆",
  moderation: "🚩",
  admins: "🛡️",
  settings: "⚙️",
};
const TAB_LABEL: Record<Tab, string> = {
  campaigns: "campaigns",
  triggers: "triggers",
  events: "events",
  partners: "partners",
  groups: "groups",
  team_events: "team events",
  leaderboard: "leaderboard",
  moderation: "moderation",
  admins: "admins",
  settings: "settings",
};
const MOBILE_PRIMARY_TABS: Tab[] = ["campaigns", "events", "groups", "partners"];
const MOBILE_OVERFLOW_TABS: Tab[] = ["triggers", "team_events", "leaderboard", "moderation", "admins", "settings"];

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

const CAMPAIGN_STATUS_ORDER: Record<string, number> = {
  active: 0,
  paused: 1,
  pending: 2,
  draft: 3,
  completed: 4,
  inactive: 5,
};

function sortCampaignsByStatus(campaigns: Campaign[]) {
  return [...campaigns].sort((a, b) => {
    const orderDiff = (CAMPAIGN_STATUS_ORDER[a.status] ?? 99) - (CAMPAIGN_STATUS_ORDER[b.status] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return a.title.localeCompare(b.title);
  });
}

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  active: "success",
  approved: "success",
  completed: "info",
  pending: "pending",
  paused: "pending",
  draft: "neutral",
  inactive: "neutral",
  rejected: "error",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_BADGE_VARIANT[status] ?? "neutral"} className="capitalize">
      {status}
    </Badge>
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
  bonus_spot:     { desc: "Admin-spawned point-on-the-map jackpot: cleanups within its radius earn a score multiplier until it expires or is claimed. Location can be picked manually or auto-suggested from nearby problem reports. Fully implemented.", implemented: true },
};

const inputCls = "w-full min-h-11 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-100 text-sm shadow-elevation-1 transition-[border-color] duration-150 focus:outline-none focus:border-zinc-500";

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

  const [spendableImpact, setSpendableImpact] = useState<{
    campaign: Campaign;
    enabled: boolean;
    users: { id: string; username: string; current_points: number; new_points: number; current_spendable_points: number; new_spendable_points: number }[];
  } | null>(null);
  const [spendableLoading, setSpendableLoading] = useState(false);
  const [spendableError, setSpendableError] = useState<string | null>(null);
  const [spendableApplying, setSpendableApplying] = useState(false);

  const [recomputeImpact, setRecomputeImpact] = useState<{
    users: { id: string; username: string; current_points: number; new_points: number; current_spendable_points: number; new_spendable_points: number }[];
  } | null>(null);
  const [recomputeLoading, setRecomputeLoading] = useState(false);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  const [recomputeApplying, setRecomputeApplying] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<string | null>(null);
  const [pendingRecomputeCount, setPendingRecomputeCount] = useState<number | null>(null);

  const checkRecomputePending = async () => {
    try {
      const res = await fetch("/api/admin/points/recompute-impact");
      const data = await res.json();
      if (res.ok) setPendingRecomputeCount(data.users.length);
    } catch {
      // best-effort indicator only; button just won't highlight
    }
  };

  useEffect(() => {
    checkRecomputePending();
  }, []);

  const openRecomputeImpact = async () => {
    setRecomputeError(null);
    setRecomputeResult(null);
    setRecomputeLoading(true);
    setRecomputeImpact(null);
    try {
      const res = await fetch("/api/admin/points/recompute-impact");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load impact preview.");
      setRecomputeImpact({ users: data.users });
    } catch (e) {
      setRecomputeError(e instanceof Error ? e.message : "Failed to load impact preview.");
    } finally {
      setRecomputeLoading(false);
    }
  };

  const confirmRecompute = async () => {
    setRecomputeApplying(true);
    setRecomputeError(null);
    try {
      const res = await fetch("/api/admin/points/recompute", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to apply recompute.");
      setRecomputeImpact(null);
      setRecomputeResult(`Updated ${data.users_changed} of ${data.users_checked} affected users.`);
      setPendingRecomputeCount(0);
    } catch (e) {
      setRecomputeError(e instanceof Error ? e.message : "Failed to apply recompute.");
    } finally {
      setRecomputeApplying(false);
    }
  };

  const openSpendableToggle = async (campaign: Campaign, enabled: boolean) => {
    setSpendableError(null);
    setSpendableLoading(true);
    setSpendableImpact(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/spendable-points-impact?enabled=${enabled}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load impact preview.");
      setSpendableImpact({ campaign, enabled, users: data.users });
    } catch (e) {
      setSpendableError(e instanceof Error ? e.message : "Failed to load impact preview.");
    } finally {
      setSpendableLoading(false);
    }
  };

  const confirmSpendableToggle = async () => {
    if (!spendableImpact) return;
    setSpendableApplying(true);
    setSpendableError(null);
    try {
      const { campaign, enabled } = spendableImpact;
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/spendable-points-toggle?enabled=${enabled}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to apply change.");
      setCampaigns(campaigns.map(c => c.id === campaign.id ? { ...c, counts_toward_spendable_points: enabled } : c));
      setSpendableImpact(null);
      checkRecomputePending();
    } catch (e) {
      setSpendableError(e instanceof Error ? e.message : "Failed to apply change.");
    } finally {
      setSpendableApplying(false);
    }
  };

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
      .select("id, slug, title, description, campaign_type, contribution_type, geo_unit, status, created_at, counts_toward_spendable_points")
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
        <div className="flex items-center gap-2">
          <button
            onClick={openRecomputeImpact}
            disabled={recomputeLoading}
            title={pendingRecomputeCount ? `${pendingRecomputeCount} user${pendingRecomputeCount !== 1 ? "s" : ""} have stale balances` : undefined}
            className={`px-3 py-1.5 min-h-9 text-xs disabled:opacity-40 disabled:active:scale-100 rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation ${
              pendingRecomputeCount
                ? "bg-amber-700 hover:bg-amber-600 active:bg-amber-800 text-white"
                : "bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300"
            }`}
          >
            {recomputeLoading
              ? "Checking…"
              : pendingRecomputeCount
                ? `Recompute all balances (${pendingRecomputeCount} pending)`
                : "Recompute all balances"}
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 min-h-9 text-xs bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation shadow-elevation-1"
          >
            {showCreate ? "Cancel" : "+ New Campaign"}
          </button>
        </div>
      </div>
      {recomputeResult && (
        <p className="text-xs text-emerald-400">{recomputeResult}</p>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/40 space-y-4 shadow-elevation-2">
          <p className="text-sm font-semibold text-zinc-300">Create Campaign</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-zinc-500">Title</label>
              <input className={inputCls} value={title} onChange={e => handleTitleChange(e.target.value)} required placeholder="Campaign name" />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-zinc-500">Slug</label>
              <input className={inputCls} value={slug} onChange={e => { setSlug(toSlug(e.target.value)); setSlugEdited(true); }} required placeholder="campaign-slug" />
            </div>
            <div className="sm:col-span-2 space-y-1">
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
            className="px-4 py-2 min-h-11 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 disabled:opacity-40 disabled:active:scale-100 text-white text-sm rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation shadow-elevation-1"
          >
            {loading ? "Creating…" : "Create"}
          </button>
        </form>
      )}

      {campaigns.length === 0 ? (
        <div className="border border-zinc-800 rounded-xl px-4 py-8 text-center text-zinc-600 text-sm shadow-elevation-1">No campaigns.</div>
      ) : (
        <>
          <div className="sm:hidden space-y-2">
            {campaigns.map(c => (
              <div key={c.id} className="border border-zinc-800 rounded-xl p-4 space-y-2 shadow-elevation-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/campaigns/${c.slug}`} className="text-zinc-200 hover:text-zinc-100 active:text-zinc-300 font-medium transition-colors duration-150">
                      {c.title}
                    </Link>
                    <p className="text-xs text-zinc-600 mt-0.5">/{c.slug} · {c.contribution_type}</p>
                  </div>
                  <TypeBadge type={c.campaign_type} />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/60">
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
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-sky-500"
                      checked={c.counts_toward_spendable_points}
                      onChange={e => openSpendableToggle(c, e.target.checked)}
                    />
                    {c.counts_toward_spendable_points ? "Counts" : "Doesn't count"}
                  </label>
                </div>
                <Link
                  href={`/admin/campaigns/${c.slug}/dashboard`}
                  className="block text-center text-xs font-medium text-emerald-400 hover:text-emerald-300 active:text-emerald-500 transition-colors duration-150 pt-1 border-t border-zinc-800/60"
                >
                  Dashboard →
                </Link>
              </div>
            ))}
          </div>
          <div className="hidden sm:block border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/40">
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Campaign</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Spendable points</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {campaigns.map(c => (
                  <tr key={c.id} className="hover:bg-zinc-900/20">
                    <td className="px-4 py-3">
                      <Link href={`/campaigns/${c.slug}`} className="text-zinc-200 hover:text-zinc-100 active:text-zinc-300 font-medium transition-colors duration-150">
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
                    <td className="px-4 py-3">
                      <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-sky-500"
                          checked={c.counts_toward_spendable_points}
                          onChange={e => openSpendableToggle(c, e.target.checked)}
                        />
                        {c.counts_toward_spendable_points ? "Counts" : "Doesn't count"}
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/campaigns/${c.slug}/dashboard`}
                        className="text-xs font-medium text-emerald-400 hover:text-emerald-300 active:text-emerald-500 transition-colors duration-150"
                      >
                        Dashboard →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(spendableLoading || spendableImpact || spendableError) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 max-w-lg w-full max-h-[80vh] overflow-y-auto space-y-4 shadow-elevation-4">
            {spendableLoading && <p className="text-sm text-zinc-400">Loading impact preview…</p>}
            {spendableError && (
              <>
                <p className="text-red-400 text-sm">{spendableError}</p>
                <button
                  onClick={() => { setSpendableError(null); setSpendableImpact(null); }}
                  className="px-3 py-1.5 min-h-9 text-xs bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 rounded-lg transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation"
                >
                  Close
                </button>
              </>
            )}
            {spendableImpact && !spendableError && (
              <>
                <p className="text-sm font-semibold text-zinc-200">
                  {spendableImpact.enabled ? "Enable" : "Disable"} spendable points for &ldquo;{spendableImpact.campaign.title}&rdquo;?
                </p>
                <p className="text-xs text-zinc-500">
                  {spendableImpact.enabled
                    ? "Contributions/reports on this campaign will start counting toward redeemable balances."
                    : "Contributions/reports on this campaign will stop counting toward redeemable balances."}
                  {" "}This only changes the rule going forward — no one's balance changes yet. The preview below shows what
                  would happen the next time you run &ldquo;Recompute all balances&rdquo;; you'll need to run that separately
                  afterward to actually apply it and notify affected users.
                </p>
                {spendableImpact.users.length === 0 ? (
                  <p className="text-xs text-zinc-600">No users would be affected — everyone's spendable balance already matches what it would be.</p>
                ) : (
                  <div className="border border-zinc-800 rounded-lg overflow-x-auto shadow-elevation-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/60">
                          <th className="text-left px-3 py-2 text-zinc-500 font-medium">User</th>
                          <th className="text-right px-3 py-2 text-zinc-500 font-medium">Points</th>
                          <th className="text-right px-3 py-2 text-zinc-500 font-medium">Points change</th>
                          <th className="text-right px-3 py-2 text-zinc-500 font-medium">Spendable</th>
                          <th className="text-right px-3 py-2 text-zinc-500 font-medium">Spendable change</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {[...spendableImpact.users]
                          .sort((a, b) => Math.abs(b.new_spendable_points - b.current_spendable_points) - Math.abs(a.new_spendable_points - a.current_spendable_points))
                          .map(u => {
                            const pointsChange = u.new_points - u.current_points;
                            const spendableChange = u.new_spendable_points - u.current_spendable_points;
                            return (
                              <tr key={u.id}>
                                <td className="px-3 py-2 text-zinc-300">{u.username}</td>
                                <td className="px-3 py-2 text-right text-zinc-400">
                                  {u.current_points} → {u.new_points}
                                </td>
                                <td className={`px-3 py-2 text-right font-medium ${pointsChange === 0 ? "text-zinc-600" : pointsChange > 0 ? "text-emerald-400" : "text-amber-400"}`}>
                                  {pointsChange > 0 ? `+${pointsChange}` : pointsChange}
                                </td>
                                <td className="px-3 py-2 text-right text-zinc-400">
                                  {u.current_spendable_points} → {u.new_spendable_points}
                                </td>
                                <td className={`px-3 py-2 text-right font-medium ${spendableChange === 0 ? "text-zinc-600" : spendableChange > 0 ? "text-emerald-400" : "text-amber-400"}`}>
                                  {spendableChange > 0 ? `+${spendableChange}` : spendableChange}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setSpendableImpact(null)}
                    disabled={spendableApplying}
                    className="px-3 py-1.5 min-h-9 text-xs bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-40 disabled:active:scale-100 text-zinc-300 rounded-lg transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSpendableToggle}
                    disabled={spendableApplying}
                    className="px-3 py-1.5 min-h-9 text-xs bg-sky-700 hover:bg-sky-600 active:bg-sky-800 disabled:opacity-40 disabled:active:scale-100 text-white rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation"
                  >
                    {spendableApplying ? "Saving…" : `${spendableImpact.enabled ? "Enable" : "Disable"} (won't apply balances yet)`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {(recomputeLoading || recomputeImpact || recomputeError) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-elevation-4">
            {recomputeLoading && (
              <p className="text-sm text-zinc-400">Checking affected users…</p>
            )}
            {recomputeError && (
              <>
                <p className="text-sm text-red-400 mb-4">{recomputeError}</p>
                <div className="flex justify-end">
                  <button
                    onClick={() => setRecomputeError(null)}
                    className="px-3 py-1.5 min-h-9 text-xs bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 rounded-lg transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
            {recomputeImpact && (
              <>
                <h3 className="text-sm font-semibold text-zinc-200 mb-1">Recompute all balances</h3>
                <p className="text-xs text-zinc-500 mb-3">
                  {recomputeImpact.users.length === 0
                    ? "No users would be affected — everyone's stored balances already match their contributions."
                    : `${recomputeImpact.users.length} user${recomputeImpact.users.length !== 1 ? "s" : ""} would be affected and will each get a notification about their balance change.`}
                </p>
                <p className="text-xs text-amber-400/80 mb-3 flex items-start gap-1.5">
                  <span aria-hidden="true">ℹ️</span>
                  <span>
                    This only catches drift from the trash report point value, since that&rsquo;s calculated live. It does <strong>not re-price</strong>{" "}
                    existing bag/pound cleanup contributions or the hotspot/claim multipliers if you change those settings, since those are baked into each contribution at the time it was submitted and can&rsquo;t be safely recalculated after the fact.
                  </span>
                </p>
                {recomputeImpact.users.some(u => u.new_spendable_points < 0) && (
                  <p className="text-xs text-red-400 mb-2 flex items-center gap-1.5">
                    <span aria-hidden="true">⚠️</span>
                    One or more users would end up with a negative spendable balance — this means they&rsquo;ve
                    already redeemed more points than they&rsquo;ll have left under the new totals. Review those
                    rows before confirming.
                  </p>
                )}
                {recomputeImpact.users.length > 0 && (
                  <div className="overflow-x-auto mb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left px-3 py-2 text-zinc-500 font-medium">User</th>
                        <th className="text-right px-3 py-2 text-zinc-500 font-medium">Points</th>
                        <th className="text-right px-3 py-2 text-zinc-500 font-medium">Points change</th>
                        <th className="text-right px-3 py-2 text-zinc-500 font-medium">Spendable</th>
                        <th className="text-right px-3 py-2 text-zinc-500 font-medium">Spendable change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...recomputeImpact.users]
                        .sort((a, b) =>
                          (Math.abs(b.new_points - b.current_points) + Math.abs(b.new_spendable_points - b.current_spendable_points)) -
                          (Math.abs(a.new_points - a.current_points) + Math.abs(a.new_spendable_points - a.current_spendable_points))
                        )
                        .map(u => {
                          const pointsChange = u.new_points - u.current_points;
                          const spendableChange = u.new_spendable_points - u.current_spendable_points;
                          const goingNegative = u.new_spendable_points < 0;
                          return (
                            <tr key={u.id} className={`border-b border-zinc-800/50 ${goingNegative ? "bg-red-950/40" : ""}`}>
                              <td className="px-3 py-2 text-zinc-300">
                                <span className="inline-flex items-center gap-1.5">
                                  {goingNegative && <span aria-label="Warning: negative balance" title="Would end up with a negative spendable balance">⚠️</span>}
                                  {u.username}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-zinc-400">
                                {u.current_points} → {u.new_points}
                              </td>
                              <td className={`px-3 py-2 text-right font-medium ${pointsChange === 0 ? "text-zinc-600" : pointsChange > 0 ? "text-emerald-400" : "text-amber-400"}`}>
                                {pointsChange > 0 ? `+${pointsChange}` : pointsChange}
                              </td>
                              <td className={`px-3 py-2 text-right ${goingNegative ? "text-red-400 font-semibold" : "text-zinc-400"}`}>
                                {u.current_spendable_points} → {u.new_spendable_points}
                              </td>
                              <td className={`px-3 py-2 text-right font-medium ${goingNegative ? "text-red-400" : spendableChange === 0 ? "text-zinc-600" : spendableChange > 0 ? "text-emerald-400" : "text-amber-400"}`}>
                                {spendableChange > 0 ? `+${spendableChange}` : spendableChange}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setRecomputeImpact(null)}
                    disabled={recomputeApplying}
                    className="px-3 py-1.5 min-h-9 text-xs bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-40 disabled:active:scale-100 text-zinc-300 rounded-lg transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRecompute}
                    disabled={recomputeApplying || recomputeImpact.users.length === 0}
                    className="px-3 py-1.5 min-h-9 text-xs bg-sky-700 hover:bg-sky-600 active:bg-sky-800 disabled:opacity-40 disabled:active:scale-100 text-white rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation"
                  >
                    {recomputeApplying ? "Applying…" : "Confirm"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Triggers Tab ─────────────────────────────────────────────────────────────

function TriggersTab({ campaigns, triggers, setTriggers, hotspotMultiplier }: {
  campaigns: Campaign[];
  triggers: Trigger[];
  setTriggers: (t: Trigger[]) => void;
  hotspotMultiplier: number;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns.find((c) => c.slug === "trash-war")?.id ?? campaigns[0]?.id ?? "");
  const [name, setName] = useState("");
  const [conditionType, setConditionType] = useState("threshold_reached");
  const [conditionConfigRaw, setConditionConfigRaw] = useState(
    JSON.stringify(CONDITION_TEMPLATES.threshold_reached, null, 2)
  );
  const [eventType, setEventType] = useState("boss_spawn");
  const [effectConfigRaw, setEffectConfigRaw] = useState(
    JSON.stringify({ ...EFFECT_TEMPLATES.boss_spawn, multiplier: hotspotMultiplier }, null, 2)
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
    if (t) {
      setEffectConfigRaw(
        JSON.stringify(val === "boss_spawn" ? { ...t, multiplier: hotspotMultiplier } : t, null, 2)
      );
    }
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
      .select("id, name, condition_type, condition_config, event_type, cooldown_hours, is_active, campaign_id")
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

  const triggerValueLabel = (trigger: Trigger): string => {
    const config = trigger.condition_config;
    if (!config || typeof config !== "object" || Array.isArray(config)) return "—";
    const c = config as Record<string, unknown>;
    if (trigger.condition_type === "report_count" || trigger.condition_type === "threshold_reached") {
      return typeof c.threshold === "number" ? String(c.threshold) : "—";
    }
    if (trigger.condition_type === "time_elapsed") {
      return typeof c.hours === "number" ? `${c.hours}h` : "—";
    }
    return typeof c.threshold === "number" ? String(c.threshold) : "—";
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
          className="px-3 py-1.5 min-h-9 text-xs bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation shadow-elevation-1"
        >
          {showCreate ? "Cancel" : "+ New Trigger"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/40 space-y-4 shadow-elevation-2">
          <p className="text-sm font-semibold text-zinc-300">Create Trigger</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-zinc-500">Campaign</label>
              <select className={inputCls} value={campaignId} onChange={e => setCampaignId(e.target.value)} required>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1">
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
                <div className="mt-1.5 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs space-y-1 shadow-elevation-1">
                  <p className="text-zinc-400 leading-relaxed">{EVENT_TYPE_INFO[eventType].desc}</p>
                  {EVENT_TYPE_INFO[eventType].implemented
                    ? <span className="text-emerald-400">✓ Trigger logic implemented</span>
                    : <span className="text-amber-400">⚠ Stub — effect not yet implemented</span>
                  }
                </div>
              )}
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-zinc-500">Condition config (JSON)</label>
              <textarea className={`${inputCls} resize-none font-mono text-xs`} rows={5} value={conditionConfigRaw} onChange={e => setConditionConfigRaw(e.target.value)} />
            </div>
            <div className="sm:col-span-2 space-y-1">
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
            className="px-4 py-2 min-h-11 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 disabled:opacity-40 disabled:active:scale-100 text-white text-sm rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation shadow-elevation-1"
          >
            {loading ? "Creating…" : "Create"}
          </button>
        </form>
      )}

      {triggers.length === 0 ? (
        <div className="border border-zinc-800 rounded-xl px-4 py-8 text-center text-zinc-600 text-sm shadow-elevation-1">No triggers.</div>
      ) : (
        <>
          <div className="sm:hidden space-y-2">
            {triggers.map(t => (
              <div key={t.id} className="border border-zinc-800 rounded-xl p-4 space-y-1.5 shadow-elevation-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-zinc-300 font-medium text-sm">{t.name}</p>
                  <button
                    onClick={() => handleToggle(t)}
                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${t.is_active ? "bg-emerald-600" : "bg-zinc-700"}`}
                    aria-label={t.is_active ? "Deactivate" : "Activate"}
                  >
                    <span className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-150 ${t.is_active ? "left-5" : "left-1"}`} />
                  </button>
                </div>
                <p className="text-xs text-zinc-500">{t.campaigns?.title ?? t.campaign_id.slice(0, 8)}</p>
                <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
                  <span>{t.condition_type}</span>
                  <span className="text-zinc-300">{triggerValueLabel(t)}</span>
                  <span>{t.event_type}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden sm:block border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/40">
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Campaign</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Condition</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Value</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Fires</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {triggers.map(t => (
                  <tr key={t.id} className="hover:bg-zinc-900/20">
                    <td className="px-4 py-3 text-zinc-300 font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{t.campaigns?.title ?? t.campaign_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs font-mono">{t.condition_type}</td>
                    <td className="px-4 py-3 text-zinc-300 text-xs font-mono">{triggerValueLabel(t)}</td>
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
        </>
      )}
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
  bonus_spot: "💎",
};

function EventsTab({ campaigns, events, setEvents, currentUserId }: {
  campaigns: Campaign[];
  events: ActiveEvent[];
  setEvents: (e: ActiveEvent[]) => void;
  currentUserId: string;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns.find((c) => c.slug === "trash-war")?.id ?? campaigns[0]?.id ?? "");
  const [eventType, setEventType] = useState("bonus_spot");
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
          className="px-3 py-1.5 min-h-9 text-xs bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation shadow-elevation-1"
        >
          {showCreate ? "Cancel" : "+ New Event"}
        </button>
      </div>

      {showCreate && (
        <div className="border border-zinc-700 rounded-xl p-5 bg-zinc-900/40 space-y-4 shadow-elevation-2">
          <p className="text-sm font-semibold text-zinc-300">Create Event</p>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Event type</label>
            <select className={inputCls} value={eventType} onChange={e => setEventType(e.target.value)}>
              <option value="bonus_spot">bonus_spot</option>
              <option value="timed_event">timed_event</option>
              <option value="boss_spawn">boss_spawn</option>
            </select>
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
          ) : eventType === "bonus_spot" ? (
            <BonusSpotForm
              campaignId={campaignId}
              campaigns={campaigns}
              onCampaignChange={setCampaignId}
              viewerUserId={currentUserId}
              onCreated={(spot) => {
                const campaign = campaigns.find(c => c.id === spot.campaign_id);
                const newEvent: ActiveEvent = {
                  id: spot.id,
                  event_type: "bonus_spot",
                  title: spot.title,
                  description: spot.description,
                  image_url: null,
                  effect_config: spot.effect_config,
                  status: spot.status,
                  started_at: spot.started_at ?? new Date().toISOString(),
                  ends_at: spot.ends_at,
                  campaign_id: spot.campaign_id,
                  campaigns: campaign ? { title: campaign.title, slug: campaign.slug } : null,
                };
                setEvents([newEvent, ...events]);
                setShowCreate(false);
              }}
              onCancel={() => setShowCreate(false)}
            />
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs text-zinc-500">Campaign</label>
                  <select className={inputCls} value={campaignId} onChange={e => setCampaignId(e.target.value)} required>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs text-zinc-500">Title</label>
                  <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. Weekend Cleanup Blitz" />
                </div>
                <div className="sm:col-span-2 space-y-1">
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
                <div className="sm:col-span-2 space-y-1">
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
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs text-zinc-500">Event image</label>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500 active:scale-95 transition-[border-color,transform] duration-150 touch-manipulation group shrink-0 shadow-elevation-1"
                    >
                      {imagePreview ? (
                        <img src={imagePreview} alt="Event" className="w-full h-full object-cover" />
                      ) : (
                        <span className="flex items-center justify-center w-full h-full text-2xl">
                          {EVENT_ICON[eventType] ?? "⚡"}
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
                className="px-4 py-2 min-h-11 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 disabled:opacity-40 disabled:active:scale-100 text-white text-sm rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation shadow-elevation-1"
              >
                {createLoading ? "Creating…" : "Create"}
              </button>
            </form>
          )}
        </div>
      )}

      {events.length === 0 ? (
        <div className="border border-zinc-800 rounded-xl px-5 py-12 text-center text-zinc-600 text-sm shadow-elevation-1">
          No active events.
        </div>
      ) : (
        <div className="space-y-2">
          {events.map(e => (
            <div key={e.id} className={`border rounded-xl px-5 py-4 shadow-elevation-1 ${e.status === "paused" ? "border-yellow-900/60 bg-yellow-950/10" : "border-zinc-800"}`}>
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
                  className="px-3 py-1.5 min-h-9 text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 active:scale-95 rounded-lg transition-[border-color,color,transform] duration-150 touch-manipulation"
                >
                  {editingId === e.id ? "Close" : "Edit"}
                </button>
                {e.status === "active" && (
                  <button
                    onClick={() => updateStatus(e.id, "paused")}
                    disabled={pendingId === e.id}
                    className="px-3 py-1.5 min-h-9 text-xs border border-zinc-700 text-zinc-400 hover:text-yellow-400 hover:border-yellow-900 active:scale-95 disabled:active:scale-100 rounded-lg transition-[border-color,color,transform] duration-150 touch-manipulation disabled:opacity-40"
                  >
                    Pause
                  </button>
                )}
                {e.status === "paused" && (
                  <button
                    onClick={() => updateStatus(e.id, "active")}
                    disabled={pendingId === e.id}
                    className="px-3 py-1.5 min-h-9 text-xs border border-zinc-700 text-zinc-400 hover:text-emerald-400 hover:border-emerald-900 active:scale-95 disabled:active:scale-100 rounded-lg transition-[border-color,color,transform] duration-150 touch-manipulation disabled:opacity-40"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={() => updateStatus(e.id, "cancelled")}
                  disabled={pendingId === e.id}
                  className="px-3 py-1.5 min-h-9 text-xs border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-900 active:scale-95 disabled:active:scale-100 rounded-lg transition-[border-color,color,transform] duration-150 touch-manipulation disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>

            {editingId === e.id && (() => {
              const hasMultiplier = getMultiplier(e.effect_config) !== null;
              return (
                <form onSubmit={ev => handleEditSubmit(ev, e)} className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs text-zinc-500">Title</label>
                      <input className={inputCls} value={editTitle} onChange={ev => setEditTitle(ev.target.value)} required />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
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
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs text-zinc-500">Event image</label>
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => editImageInputRef.current?.click()}
                          className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500 active:scale-95 transition-[border-color,transform] duration-150 touch-manipulation group shrink-0 shadow-elevation-1"
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
                          <div className="absolute inset-0 bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center">
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
                      className="px-4 py-2 min-h-11 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 disabled:opacity-40 disabled:active:scale-100 text-white text-sm rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation shadow-elevation-1"
                    >
                      {editLoading ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="px-4 py-2 min-h-11 text-sm bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation"
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

      <CleanupEventWipeTool />
    </div>
  );
}

// ─── Cleanup Event Reset (danger zone) ─────────────────────────────────────────

function CleanupEventWipeTool() {
  const [cleanupId, setCleanupId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingWipe, setConfirmingWipe] = useState(false);

  const handleWipe = async () => {
    const id = cleanupId.trim();
    if (!id) return;
    setConfirmingWipe(false);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/cleanup-events/${id}/wipe`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed");
      setResult(
        `✓ Deleted ${data.contributions_deleted} contribution(s), ` +
        `${data.territory_claims_deleted} zip claim(s) removed, ` +
        `${data.territory_claims_updated} recomputed, ` +
        `${data.team_total_logs_deleted} group-log record(s) removed.`
      );
      setCleanupId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-red-900/60 rounded-xl p-5 bg-red-950/10 space-y-3 mt-6 shadow-elevation-2">
      <p className="text-sm font-semibold text-red-400">Reset a cleanup event's logged data</p>
      <p className="text-xs text-zinc-500 leading-relaxed">
        Use this to undo bad logging on a cleanup event — e.g. an individual log made before
        "log group total" existed, followed by a group-total run that didn't cover everyone.
        Wipes all contributions, the zip claim, and group-log history for the event so
        it can be re-logged from scratch. Does not delete the event itself or its RSVPs.
      </p>
      <div className="flex items-center gap-2">
        <input
          className={inputCls}
          value={cleanupId}
          onChange={e => setCleanupId(e.target.value)}
          placeholder="Cleanup event ID (UUID)"
        />
        <button
          onClick={() => setConfirmingWipe(true)}
          disabled={loading || !cleanupId.trim()}
          className="px-4 py-2 min-h-11 text-sm bg-red-900/60 hover:bg-red-900 active:bg-red-950 border border-red-800 disabled:opacity-40 disabled:active:scale-100 text-red-300 rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation shrink-0"
        >
          {loading ? "Wiping…" : "Wipe event data"}
        </button>
      </div>
      {result && <p className="text-xs text-emerald-400">{result}</p>}
      {error && <p className="text-xs text-red-400">✗ {error}</p>}
      <ConfirmModal
        open={confirmingWipe}
        title="Wipe event data?"
        message="This deletes every contribution logged for this cleanup event (individual and group-total), removes/recomputes the zip claim, deletes its group-log audit history, and resets its bag/pound totals to 0. Affected users' points update automatically. This can't be undone."
        confirmLabel="Wipe data"
        onConfirm={handleWipe}
        onCancel={() => setConfirmingWipe(false)}
      />
    </div>
  );
}

// ─── Partners Tab ─────────────────────────────────────────────────────────────

type RedemptionDetail = {
  id: string;
  redeemed_at: string;
  used_at: string | null;
  points_spent: number;
  profiles: { username: string | null; display_name: string | null } | null;
};

export function OfferRow({ offer, redemptionCount, locations, onUpdated, onCancelled }: {
  offer: PartnerOffer;
  redemptionCount: number;
  locations?: OfferFormLocation[];
  onUpdated: (o: PartnerOffer) => void;
  onCancelled: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [showRedemptions, setShowRedemptions] = useState(false);
  const [redemptions, setRedemptions] = useState<RedemptionDetail[] | null>(null);
  const [loadingRedemptions, setLoadingRedemptions] = useState(false);

  const toggleRedemptions = async () => {
    if (showRedemptions) {
      setShowRedemptions(false);
      return;
    }
    setShowRedemptions(true);
    if (redemptions !== null) return;
    setLoadingRedemptions(true);
    const supabase = createClient();
    const { data } = await supabase
      .schema("public")
      .from("partner_redemptions")
      .select("id, redeemed_at, used_at, points_spent, profiles(username, display_name)")
      .eq("offer_id", offer.id)
      .order("redeemed_at", { ascending: false });
    setRedemptions((data ?? []) as unknown as RedemptionDetail[]);
    setLoadingRedemptions(false);
  };

  const handleEditOffer = async (payload: OfferFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { data, error: updateErr } = await supabase
      .schema("public")
      .from("partner_offers")
      .update(payload)
      .eq("id", offer.id)
      .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, max_total_redemptions, event_redemption_limit, code, status, starts_at, ends_at, created_at, location_id, event_eligible")
      .single();

    if (updateErr) return updateErr.message;

    onUpdated(data as PartnerOffer);
    setEditing(false);
    return null;
  };

  const handleCancelOffer = async () => {
    setConfirmingCancel(false);
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
        locations={locations}
        onSubmit={handleEditOffer}
        onCancel={() => setEditing(false)}
        submitLabel="Save changes"
      />
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg px-4 py-3 shadow-elevation-1">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-200">{offer.title}</p>
          {offer.description && <p className="text-xs text-zinc-500 mt-0.5">{offer.description}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{offer.redemption_mode}</span>
            {offer.redemption_mode === "spend"
              ? <span className="text-zinc-500">{offer.points_cost} pts</span>
              : offer.redemption_mode === "threshold"
              ? <span className="text-zinc-500">{offer.points_threshold}+ pts to unlock</span>
              : <span className="text-zinc-500">event check-in only</span>}
            <StatusBadge status={offer.status} />
            {offer.event_eligible && (
              <span
                title="Event offers can be attached to a cleanup event by its organizer. Attendees who check in can redeem it for free, no points required, within 4 hours after the event ends."
                className="px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-800/60 text-amber-400 font-semibold flex items-center gap-1 cursor-help"
              >
                Event offer
              </span>
            )}
            {redemptionCount > 0 ? (
              <button
                type="button"
                onClick={toggleRedemptions}
                className="text-zinc-500 hover:text-zinc-300 active:text-zinc-200 underline decoration-dotted transition-colors duration-150"
              >
                {redemptionCount}/{offer.max_total_redemptions ?? "∞"} redeemed
              </button>
            ) : (
              <span className="text-zinc-600">{redemptionCount}/{offer.max_total_redemptions ?? "∞"} redeemed</span>
            )}
            {offer.code && <span className="text-zinc-600 font-mono">code: {offer.code}</span>}
          </div>
        </div>
        {offer.status !== "cancelled" && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="px-2.5 py-1 min-h-9 text-xs border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 active:scale-95 rounded-lg transition-[border-color,color,transform] duration-150 touch-manipulation"
            >
              Edit
            </button>
            <button
              onClick={() => setConfirmingCancel(true)}
              disabled={cancelling}
              className="px-2.5 py-1 min-h-9 text-xs border border-red-900/60 text-red-500 hover:text-red-400 hover:border-red-800 active:scale-95 disabled:active:scale-100 rounded-lg transition-[border-color,color,transform] duration-150 touch-manipulation disabled:opacity-40"
            >
              {cancelling ? "Cancelling…" : "Cancel offer"}
            </button>
          </div>
        )}
      </div>
      {showRedemptions && (
        <div className="mt-2 w-full border border-zinc-800 rounded-lg divide-y divide-zinc-800/60 overflow-hidden shadow-elevation-1">
          {loadingRedemptions ? (
            <p className="px-3 py-2 text-xs text-zinc-600">Loading…</p>
          ) : redemptions && redemptions.length > 0 ? (
            redemptions.map((r) => (
              <div key={r.id} className="px-3 py-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 text-xs">
                <span className="text-zinc-400">
                  {r.profiles?.display_name ?? r.profiles?.username ?? "Unknown user"}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-zinc-600">
                    {new Date(r.redeemed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  {r.used_at ? (
                    <span
                      title={`Used ${new Date(r.used_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                      className="text-emerald-400 border border-emerald-700/60 rounded px-1.5 py-0.5 cursor-help"
                    >
                      Used
                    </span>
                  ) : (
                    <span className="text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5">
                      Not used
                    </span>
                  )}
                </span>
              </div>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-zinc-600">No redemptions yet.</p>
          )}
        </div>
      )}
      <ConfirmModal
        open={confirmingCancel}
        title="Cancel offer?"
        message={`Cancel "${offer.title}"? It will stop showing to users.`}
        confirmLabel="Cancel offer"
        cancelLabel="Keep offer"
        onConfirm={handleCancelOffer}
        onCancel={() => setConfirmingCancel(false)}
      />
    </div>
  );
}

export type BusinessCampaignLink = { business_id: string; campaign_id: string };

type BusinessAdmin = { id: string; user_id: string; username: string | null; email: string; business_only: boolean };
type UserSearchResult = { id: string; username: string | null; email: string };

function BusinessAdminsManager({ businessId }: { businessId: string }) {
  const [admins, setAdmins] = useState<BusinessAdmin[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [removingAdmin, setRemovingAdmin] = useState<BusinessAdmin | null>(null);
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
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query.trim())}`);
      setSearching(false);
      if (res.ok) {
        setError(null);
        setResults(await res.json());
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.detail ?? "User search failed");
        setResults([]);
      }
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

  const handleToggleBusinessOnly = async (adminId: string, businessOnly: boolean) => {
    setTogglingId(adminId);
    setError(null);
    const res = await fetch(`${fastApiUrl}/api/partners/businesses/${businessId}/admins/${adminId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_only: businessOnly }),
    });
    setTogglingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.detail ?? "Failed to update admin");
      return;
    }
    setAdmins((prev) => (prev ?? []).map((a) => (a.id === adminId ? { ...a, business_only: businessOnly } : a)));
  };

  const handleRemove = async (adminId: string) => {
    setRemovingAdmin(null);
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
              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-1.5 text-zinc-500" title="Business-only user — sign-in takes them straight to their dashboard">
                  <input
                    type="checkbox"
                    checked={a.business_only}
                    disabled={togglingId === a.id}
                    onChange={(e) => handleToggleBusinessOnly(a.id, e.target.checked)}
                    className="accent-sky-500"
                  />
                  Business-only
                </label>
                <button onClick={() => setRemovingAdmin(a)} className="text-red-500 hover:text-red-400 active:text-red-300 transition-colors duration-150">
                  Remove
                </button>
              </div>
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
                  className="w-full text-left px-3 py-1.5 min-h-9 text-xs text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 disabled:active:scale-100 transition-[background-color,transform] duration-150 active:scale-[0.98] touch-manipulation disabled:opacity-40"
                >
                  {u.username ?? u.email} <span className="text-zinc-600">({u.email})</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <ConfirmModal
        open={removingAdmin !== null}
        title="Remove business admin?"
        message={`Remove ${removingAdmin?.username ?? removingAdmin?.email ?? "this person"}'s access to manage this business?`}
        confirmLabel="Remove"
        onConfirm={() => removingAdmin && handleRemove(removingAdmin.id)}
        onCancel={() => setRemovingAdmin(null)}
      />
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
  businessLocations,
  setBusinessLocations,
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
  businessLocations: PartnerBusinessLocation[];
  setBusinessLocations: (l: PartnerBusinessLocation[]) => void;
}) {
  const isPending = business.status === "pending";
  const isRejected = business.status === "rejected";
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showCreateOffer, setShowCreateOffer] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);

  const businessOffers = offers.filter(o => o.business_id === business.id);

  const handleCreateOffer = async (payload: OfferFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { data, error: insertErr } = await supabase
      .schema("public")
      .from("partner_offers")
      .insert({ ...payload, business_id: business.id, status: "active" })
      .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, max_total_redemptions, event_redemption_limit, code, status, starts_at, ends_at, created_at, location_id, event_eligible")
      .single();

    if (insertErr) return insertErr.message;

    setOffers([...offers, data as PartnerOffer]);
    setShowCreateOffer(false);
    return null;
  };

  const businessCampaignIds = businessCampaignLinks.filter(l => l.business_id === business.id).map(l => l.campaign_id);
  const businessLocationRows = businessLocations.filter(l => l.business_id === business.id);

  const handleEditSubmit = async (payload: BusinessFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { campaignIds, locations, ...rest } = payload;
    const { data, error: updateErr } = await supabase
      .schema("public")
      .from("partner_businesses")
      .update({ ...rest, status: isPending ? "active" : business.status })
      .eq("id", business.id)
      .select(
        "id, name, slug, description, logo_url, website_url, social_links, status, created_at"
      )
      .single();

    if (updateErr) return updateErr.code === "23505" ? "Slug already taken." : updateErr.message;

    const updated = data as PartnerBusiness;
    setBusinesses(businesses.map(b => (b.id === updated.id ? updated : b)));

    const locationsResult = await reconcileBusinessLocations<PartnerBusinessLocation>(
      supabase,
      business.id,
      businessLocationRows,
      locations,
      "id, business_id, label, address_line1, address_line2, city, state, postal_code, country, lat, lng, google_maps_url, status, created_at"
    );
    if (locationsResult.rows === null) return locationsResult.error;

    setBusinessLocations([
      ...businessLocations.filter(l => l.business_id !== business.id),
      ...locationsResult.rows,
    ]);

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
    setConfirmingReject(false);
    setRejecting(true);
    const supabase = createClient();
    const { data, error: updateErr } = await supabase
      .schema("public")
      .from("partner_businesses")
      .update({ status: "rejected" })
      .eq("id", business.id)
      .select(
        "id, name, slug, description, logo_url, website_url, social_links, status, created_at"
      )
      .single();
    setRejecting(false);
    if (updateErr) {
      alert(updateErr.message);
      return;
    }
    const updated = data as PartnerBusiness;
    setBusinesses(businesses.map(b => (b.id === updated.id ? updated : b)));
  };

  return (
    <div className={`border rounded-xl overflow-hidden shadow-elevation-1 ${isPending ? "border-amber-800/60" : isRejected ? "border-red-900/60" : "border-zinc-800"}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 min-h-11 hover:bg-zinc-900/30 active:bg-zinc-900/50 transition-[background-color,transform] duration-150 active:scale-[0.99] touch-manipulation text-left"
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
            <p className="text-sm font-semibold text-zinc-200 truncate">{business.name}</p>
            <p className="text-xs text-zinc-600">{businessOffers.length} offer{businessOffers.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end shrink-0">
          {isPending && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setConfirmingReject(true); }}
              className="text-xs text-red-500 hover:text-red-400 active:text-red-300 transition-colors duration-150 px-2 py-1"
            >
              {rejecting ? "Rejecting…" : "Reject"}
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setEditing(!editing); setExpanded(true); }}
            className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-200 transition-colors duration-150 px-2 py-1"
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
          {isRejected && (
            <p className="text-xs text-red-400">This application was rejected and kept as a record.</p>
          )}
          {editing && (
            <BusinessForm
              initial={{
                ...business,
                locations: businessLocationRows.map(l => ({
                  id: l.id,
                  label: l.label,
                  address_line1: l.address_line1,
                  address_line2: l.address_line2,
                  city: l.city,
                  state: l.state,
                  postal_code: l.postal_code,
                  country: l.country,
                  lat: l.lat,
                  lng: l.lng,
                  google_maps_url: l.google_maps_url,
                })),
              }}
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
              locations={businessLocationRows}
              onUpdated={(updated) => setOffers(offers.map(existing => existing.id === updated.id ? updated : existing))}
              onCancelled={(id) => setOffers(offers.map(existing => existing.id === id ? { ...existing, status: "cancelled" } : existing))}
            />
          ))}
          {businessOffers.length === 0 && !showCreateOffer && (
            <p className="text-xs text-zinc-600">No offers yet.</p>
          )}
          <button
            onClick={() => setShowCreateOffer(!showCreateOffer)}
            className="px-3 py-1.5 min-h-9 text-xs bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation shadow-elevation-1"
          >
            {showCreateOffer ? "Cancel" : "+ New Offer"}
          </button>
          {showCreateOffer && (
            <OfferForm onSubmit={handleCreateOffer} locations={businessLocationRows} onCancel={() => setShowCreateOffer(false)} submitLabel="Create offer" />
          )}
          {!isPending && <BusinessAdminsManager businessId={business.id} />}
        </div>
      )}
      <ConfirmModal
        open={confirmingReject}
        title="Reject business?"
        message={`Reject "${business.name}"?`}
        confirmLabel="Reject"
        onConfirm={handleReject}
        onCancel={() => setConfirmingReject(false)}
      />
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
  businessLocations,
  setBusinessLocations,
}: {
  businesses: PartnerBusiness[];
  setBusinesses: (b: PartnerBusiness[]) => void;
  offers: PartnerOffer[];
  setOffers: (o: PartnerOffer[]) => void;
  redemptionCounts: Record<string, number>;
  campaigns: Campaign[];
  businessCampaignLinks: BusinessCampaignLink[];
  setBusinessCampaignLinks: (l: BusinessCampaignLink[]) => void;
  businessLocations: PartnerBusinessLocation[];
  setBusinessLocations: (l: PartnerBusinessLocation[]) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const pendingBusinesses = businesses.filter(b => b.status === "pending");
  const rejectedBusinesses = businesses.filter(b => b.status === "rejected");
  const publishedBusinesses = businesses.filter(b => b.status !== "pending" && b.status !== "rejected");

  const handleCreateSubmit = async (payload: BusinessFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { campaignIds, locations, ...rest } = payload;
    const { data, error: insertErr } = await supabase
      .schema("public")
      .from("partner_businesses")
      .insert({ ...rest, status: "active" })
      .select(
        "id, name, slug, description, logo_url, website_url, social_links, status, created_at"
      )
      .single();

    if (insertErr) return insertErr.code === "23505" ? "Slug already taken." : insertErr.message;

    const newBusiness = data as PartnerBusiness;
    setBusinesses([newBusiness, ...businesses]);

    if (locations.length > 0) {
      const { data: newLocations, error: locationsErr } = await supabase
        .schema("public")
        .from("partner_business_locations")
        .insert(locations.map(({ id: _id, ...loc }) => ({ ...loc, business_id: newBusiness.id })))
        .select("id, business_id, label, address_line1, address_line2, city, state, postal_code, country, lat, lng, google_maps_url, status, created_at");
      if (locationsErr) {
        setShowCreate(false);
        return `Business created, but failed to save locations: ${locationsErr.message}`;
      }
      setBusinessLocations([...businessLocations, ...(newLocations as PartnerBusinessLocation[])]);
    }

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
            className="px-3 py-1.5 min-h-9 text-xs border border-zinc-700 hover:border-zinc-500 active:scale-95 text-zinc-300 rounded-lg font-medium transition-[border-color,transform] duration-150 touch-manipulation"
          >
            Open apply form ↗
          </Link>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/partners/apply`);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 1500);
            }}
            className="px-3 py-1.5 min-h-9 text-xs border border-zinc-700 hover:border-zinc-500 active:scale-95 text-zinc-300 rounded-lg font-medium transition-[border-color,transform] duration-150 touch-manipulation"
          >
            {linkCopied ? "Copied!" : "Copy link"}
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 min-h-9 text-xs bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation shadow-elevation-1"
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
          initialCampaignIds={
            [campaigns.find(c => c.slug === "trash-war")?.id ?? campaigns[0]?.id].filter((id): id is string => !!id)
          }
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
              businessLocations={businessLocations}
              setBusinessLocations={setBusinessLocations}
            />
          ))}
        </div>
      )}

      {rejectedBusinesses.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">
            Rejected ({rejectedBusinesses.length})
          </p>
          {rejectedBusinesses.map(b => (
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
              businessLocations={businessLocations}
              setBusinessLocations={setBusinessLocations}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {businesses.length === 0 && (
          <div className="border border-zinc-800 rounded-xl px-5 py-12 text-center text-zinc-600 text-sm shadow-elevation-1">
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
            businessLocations={businessLocations}
            setBusinessLocations={setBusinessLocations}
          />
        ))}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  groups,
  setGroups,
  currentUserId,
}: {
  group: AdminGroup;
  groups: AdminGroup[];
  setGroups: (g: AdminGroup[]) => void;
  currentUserId: string;
}) {
  const isPending = group.status === "pending";
  const isRejected = group.status === "rejected";
  const isApproved = group.status === "approved";
  const hasNoAdmin = isApproved && group.admin_count === 0;
  const [expanded, setExpanded] = useState(isPending);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [confirmingQuickDelete, setConfirmingQuickDelete] = useState(false);

  const handleApprove = async () => {
    setWorking(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateErr } = await supabase
      .from("groups")
      .update({ status: "approved" })
      .eq("id", group.id)
      .select("*")
      .single();
    if (updateErr) {
      setWorking(false);
      setError(updateErr.message);
      return;
    }
    if (group.created_by) {
      const { error: memberErr } = await supabase
        .from("group_members")
        .insert({ group_id: group.id, user_id: group.created_by, role: "admin" });
      if (memberErr) {
        setWorking(false);
        setError(`Approved, but failed to grant admin membership: ${memberErr.message}`);
        setGroups(groups.map(g => (g.id === group.id ? { ...g, ...(data as AdminGroup) } : g)));
        return;
      }
    }
    setWorking(false);
    setGroups(groups.map(g => (g.id === group.id ? { ...g, ...(data as AdminGroup) } : g)));
  };

  const handleReject = async () => {
    setConfirmingReject(false);
    setWorking(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateErr } = await supabase
      .from("groups")
      .update({ status: "rejected" })
      .eq("id", group.id)
      .select("*")
      .single();
    setWorking(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setGroups(groups.map(g => (g.id === group.id ? { ...g, ...(data as AdminGroup) } : g)));
  };

  const handleDelete = async () => {
    setConfirmingQuickDelete(false);
    setWorking(true);
    setError(null);
    try {
      await deleteGroup(group.id, group.created_by ?? "");
      setGroups(groups.filter(g => g.id !== group.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setWorking(false);
    }
  };

  const handleConfirmedDelete = async () => {
    setWorking(true);
    setError(null);
    try {
      await deleteGroup(group.id, currentUserId);
      setGroups(groups.filter(g => g.id !== group.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setWorking(false);
    }
  };

  const socialEntries = group.social_links
    ? (Object.entries(group.social_links).filter(([, v]) => v) as [string, string][])
    : [];

  return (
    <div className={`border rounded-xl overflow-hidden shadow-elevation-1 ${isPending ? "border-amber-800/60" : isRejected ? "border-red-900/60" : "border-zinc-800"}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 min-h-11 hover:bg-zinc-900/30 active:bg-zinc-900/50 transition-[background-color,transform] duration-150 active:scale-[0.99] touch-manipulation text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-zinc-500 text-xs">{expanded ? "▾" : "▸"}</span>
          {group.image_url ? (
            <img src={group.image_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
          ) : (
            <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-black text-zinc-400 shrink-0">
              {group.name[0]?.toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-200 truncate">{group.name}</p>
            <p className="text-xs text-zinc-600 truncate">
              {group.applicant?.display_name ?? group.applicant?.username ?? "Unknown applicant"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end shrink-0">
          {isPending && (
            <>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); handleApprove(); }}
                className="text-xs text-emerald-500 hover:text-emerald-400 active:text-emerald-300 transition-colors duration-150 px-2 py-1"
              >
                {working ? "Working…" : "Approve"}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setConfirmingReject(true); }}
                className="text-xs text-red-500 hover:text-red-400 active:text-red-300 transition-colors duration-150 px-2 py-1"
              >
                Reject
              </span>
            </>
          )}
          {(isPending || isRejected) && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setConfirmingQuickDelete(true); }}
              className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-200 transition-colors duration-150 px-2 py-1"
            >
              Delete
            </span>
          )}
          {isApproved && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setExpanded(true); setConfirmingDelete(true); }}
              className="text-xs text-zinc-500 hover:text-red-400 active:text-red-300 transition-colors duration-150 px-2 py-1"
            >
              Delete
            </span>
          )}
          {hasNoAdmin && (
            <span
              title="This group has no admin. Add someone to group_members with role='admin' to give it one."
              className="text-xs text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5 cursor-help"
            >
              ⚠️ No admin
            </span>
          )}
          <StatusBadge status={group.status} />
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-3 bg-zinc-950/40">
          {isPending && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-amber-400">
                Submitted for review. Approving grants the applicant admin membership and publishes the group.
              </p>
              <button
                type="button"
                onClick={() => setShowDetailModal(true)}
                className="shrink-0 text-xs px-2.5 py-1 min-h-9 rounded-lg border border-amber-800/60 text-amber-400 hover:bg-amber-900/20 active:bg-amber-900/30 active:scale-95 transition-[background-color,transform] duration-150 touch-manipulation"
              >
                View full submission
              </button>
            </div>
          )}
          {isRejected && (
            <p className="text-xs text-red-400">This application was rejected and kept as a record.</p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}

          {isApproved ? (
            <Link
              href={`/groups/${group.slug}`}
              target="_blank"
              className="inline-block text-xs text-emerald-500 hover:text-emerald-400 active:text-emerald-300 underline transition-colors duration-150"
            >
              View public group page → /groups/{group.slug}
            </Link>
          ) : (
            <p className="text-xs text-zinc-600">/groups/{group.slug}</p>
          )}

          {group.description && <p className="text-sm text-zinc-400">{group.description}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-500">
            <p>
              <span className="text-zinc-600">Applicant: </span>
              {group.applicant?.display_name ?? group.applicant?.username ?? "Unknown"}
              {group.applicant?.username && group.applicant?.display_name ? ` (@${group.applicant.username})` : ""}
            </p>
            <p>
              <span className="text-zinc-600">Submitted: </span>
              {new Date(group.created_at).toLocaleDateString()}
            </p>
            {group.categories && group.categories.length > 0 && (
              <p className="sm:col-span-2">
                <span className="text-zinc-600">Categories: </span>
                {group.categories.join(", ")}
              </p>
            )}
          </div>

          {socialEntries.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {socialEntries.map(([platform, url]) => (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded-full border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 active:scale-95 transition-[border-color,color,transform] duration-150 touch-manipulation"
                >
                  {platform}
                </a>
              ))}
            </div>
          )}

          {isApproved && (
            <div className="pt-2 border-t border-zinc-800/60">
              {!confirmingDelete ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setConfirmingDelete(true)}
                  className="text-xs text-red-500 hover:text-red-400 active:text-red-300 transition-colors duration-150"
                >
                  Delete this group…
                </span>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-400">
                    This permanently deletes &quot;{group.name}&quot;. Type the group name to confirm.
                  </p>
                  <input
                    type="text"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder={group.name}
                    className="w-full max-w-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-red-700"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={typedName !== group.name || working}
                      onClick={handleConfirmedDelete}
                      className="text-xs px-3 py-1.5 min-h-9 rounded-lg bg-red-900/40 border border-red-800 text-red-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 hover:bg-red-900/60 active:bg-red-900/80 active:scale-95 transition-[background-color,transform] duration-150 touch-manipulation"
                    >
                      {working ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setConfirmingDelete(false); setTypedName(""); }}
                      className="text-xs px-3 py-1.5 min-h-9 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 active:scale-95 transition-[color,transform] duration-150 touch-manipulation"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showDetailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="w-full max-w-lg max-h-full overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-elevation-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <h3 className="text-lg font-bold text-zinc-100">{group.name}</h3>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="text-zinc-500 hover:text-zinc-300 active:text-zinc-200 active:scale-90 transition-[color,transform] duration-150 text-xl leading-none touch-manipulation"
              >
                ×
              </button>
            </div>

            {group.image_url ? (
              <img
                src={group.image_url}
                alt={group.name}
                className="w-full max-h-80 object-contain rounded-xl bg-zinc-900 mb-4"
              />
            ) : (
              <div className="w-full h-40 rounded-xl bg-zinc-900 flex items-center justify-center text-3xl font-black text-zinc-700 mb-4">
                {group.name[0]?.toUpperCase()}
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-zinc-600 mb-0.5">Slug</p>
                <p className="text-zinc-300">/groups/{group.slug}</p>
              </div>

              <div>
                <p className="text-xs text-zinc-600 mb-0.5">Applicant</p>
                <p className="text-zinc-300">
                  {group.applicant?.display_name ?? group.applicant?.username ?? "Unknown"}
                  {group.applicant?.username && group.applicant?.display_name ? ` (@${group.applicant.username})` : ""}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-600 mb-0.5">Submitted</p>
                <p className="text-zinc-300">{new Date(group.created_at).toLocaleString()}</p>
              </div>

              {group.description && (
                <div>
                  <p className="text-xs text-zinc-600 mb-0.5">Description</p>
                  <p className="text-zinc-300 whitespace-pre-wrap">{group.description}</p>
                </div>
              )}

              {group.categories && group.categories.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-600 mb-0.5">Categories</p>
                  <p className="text-zinc-300">{group.categories.join(", ")}</p>
                </div>
              )}

              {socialEntries.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-600 mb-1">Links</p>
                  <div className="flex flex-wrap gap-2">
                    {socialEntries.map(([platform, url]) => (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2.5 py-1 rounded-full border border-zinc-800 text-zinc-300 hover:border-zinc-700 active:scale-95 transition-[border-color,transform] duration-150 touch-manipulation"
                      >
                        {platform}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6 pt-4 border-t border-zinc-800">
              <span
                role="button"
                tabIndex={0}
                onClick={() => { setShowDetailModal(false); handleApprove(); }}
                className="text-xs px-3 py-1.5 min-h-9 rounded-lg bg-emerald-900/40 border border-emerald-800 text-emerald-300 hover:bg-emerald-900/60 active:bg-emerald-900/80 active:scale-95 transition-[background-color,transform] duration-150 touch-manipulation cursor-pointer"
              >
                {working ? "Working…" : "Approve"}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={() => { setShowDetailModal(false); setConfirmingReject(true); }}
                className="text-xs px-3 py-1.5 min-h-9 rounded-lg border border-red-900 text-red-400 hover:bg-red-900/20 active:bg-red-900/30 active:scale-95 transition-[background-color,transform] duration-150 touch-manipulation cursor-pointer"
              >
                Reject
              </span>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmingReject}
        title="Reject group?"
        message={`Reject "${group.name}"?`}
        confirmLabel="Reject"
        onConfirm={handleReject}
        onCancel={() => setConfirmingReject(false)}
      />
      <ConfirmModal
        open={confirmingQuickDelete}
        title="Delete group?"
        message={`Permanently delete "${group.name}"? This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingQuickDelete(false)}
      />
    </div>
  );
}

function GroupsTab({ groups, setGroups, currentUserId }: { groups: AdminGroup[]; setGroups: (g: AdminGroup[]) => void; currentUserId: string }) {
  const pendingGroups = groups.filter(g => g.status === "pending");
  const rejectedGroups = groups.filter(g => g.status === "rejected");
  const approvedGroups = groups.filter(g => g.status === "approved");
  const noAdminCount = approvedGroups.filter(g => g.admin_count === 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-zinc-500">{groups.length} group{groups.length !== 1 ? "s" : ""}</span>
        {noAdminCount > 0 && (
          <span className="text-xs text-amber-400 border border-amber-700/60 rounded px-1.5 py-0.5">
            ⚠️ {noAdminCount} with no admin
          </span>
        )}
      </div>

      {pendingGroups.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
            Pending review ({pendingGroups.length})
          </p>
          {pendingGroups.map(g => <GroupCard key={g.id} group={g} groups={groups} setGroups={setGroups} currentUserId={currentUserId} />)}
        </div>
      )}

      {rejectedGroups.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">
            Rejected ({rejectedGroups.length})
          </p>
          {rejectedGroups.map(g => <GroupCard key={g.id} group={g} groups={groups} setGroups={setGroups} currentUserId={currentUserId} />)}
        </div>
      )}

      <div className="space-y-2">
        {groups.length === 0 && (
          <div className="border border-zinc-800 rounded-xl px-5 py-12 text-center text-zinc-600 text-sm shadow-elevation-1">
            No groups.
          </div>
        )}
        {approvedGroups.map(g => <GroupCard key={g.id} group={g} groups={groups} setGroups={setGroups} currentUserId={currentUserId} />)}
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
  const [campaignId, setCampaignId] = useState(campaigns.find((c) => c.slug === "trash-war")?.id ?? campaigns[0]?.id ?? "");
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
          className="px-3 py-2 min-h-11 text-sm bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 text-zinc-300 rounded-lg transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation"
        >
          This week (Mon–Mon)
        </button>
        <button
          onClick={fetchLeaderboard}
          disabled={!campaignId || loading}
          className="px-4 py-2 min-h-11 text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg transition-[background-color,transform] duration-150 active:scale-95 disabled:active:scale-100 touch-manipulation disabled:opacity-50"
        >
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {entries.length > 0 && (
        <>
          <div className="sm:hidden space-y-2">
            {entries.map((entry, i) => (
              <div key={entry.user_id} className="border border-zinc-800 rounded-xl p-4 space-y-2 shadow-elevation-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500 text-xs tabular-nums shrink-0">#{i + 1}</span>
                  <Link
                    href={`/admin/leaderboard/${campaignId}/${entry.user_id}?start=${encodeURIComponent(new Date(startDate).toISOString())}&end=${encodeURIComponent(new Date(endDate).toISOString())}`}
                    className="text-emerald-400 hover:underline active:text-emerald-300 transition-colors duration-150 text-sm truncate"
                  >
                    {entry.display_name || entry.username || entry.user_id}
                  </Link>
                  <span className="tabular-nums font-semibold text-zinc-100 text-sm shrink-0">{entry.total_value}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-zinc-400 tabular-nums pt-1 border-t border-zinc-800/60">
                  <span>{entry.small_bags} small</span>
                  <span>{entry.large_bags} large</span>
                  <span>{entry.contribution_count} subs</span>
                  <span className={entry.photo_count === 0 ? "text-red-400 font-semibold" : "text-zinc-400"}>
                    {entry.photo_count} photos
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto border border-zinc-800 rounded-xl shadow-elevation-1">
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
                        className="text-emerald-400 hover:underline active:underline"
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
        </>
      )}

      {!loading && entries.length === 0 && !error && (
        <p className="text-sm text-zinc-500">Pick a campaign and date range, then click Run.</p>
      )}
    </div>
  );
}

// ─── Moderation Tab ───────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<string, string> = {
  contribution_photo: "Contribution photo",
  cleanup_log_photo: "Cleanup gallery photo",
  cleanup_event_photo: "Cleanup gallery photo",
  avatar: "Profile avatar",
  problem_report: "Trash report",
};

type ContentFlagGroup = {
  content_type: string;
  content_id: string;
  photo_url: string;
  flag_count: number;
  reasons: string[];
  first_flagged_at: string;
  last_flagged_at: string;
  context?: {
    label: string | null;
    user_id: string | null;
    username: string | null;
    map_link: { campaign_slug: string; lat: number; lng: number } | null;
  };
};

type ResolvedContentFlagGroup = ContentFlagGroup & {
  resolution: "hidden" | "dismissed";
  resolved_at: string;
  resolved_by: {
    user_id: string | null;
    label: string | null;
  };
};

function ModerationTab() {
  const [flags, setFlags] = useState<ContentFlagGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [history, setHistory] = useState<ResolvedContentFlagGroup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const keyOf = (f: ContentFlagGroup) => `${f.content_type}:${f.content_id}:${f.photo_url}`;

  const fetchQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/content-flags/queue");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to load flag queue");
      setFlags(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load flag queue");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/admin/content-flags/history");
      const data = await res.json();
      if (res.ok) setHistory(data ?? []);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    fetchHistory();
  }, []);

  const resolve = async (f: ContentFlagGroup, resolution: "hide" | "dismiss") => {
    setResolvingKey(keyOf(f));
    try {
      const res = await fetch("/api/admin/content-flags/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: f.content_type,
          content_id: f.content_id,
          photo_url: f.photo_url,
          resolution,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to resolve flag");
      setFlags(prev => prev.filter(x => keyOf(x) !== keyOf(f)));
      fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve flag");
    } finally {
      setResolvingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Reported photos and trash reports waiting for review. Hiding removes a photo from wherever it&apos;s displayed (or pulls a trash report off the map); dismissing leaves it up and clears the report.
        </p>
        <button
          onClick={fetchQueue}
          disabled={loading}
          className="shrink-0 px-3 py-2 min-h-11 text-sm bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 text-zinc-300 rounded-lg transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && flags.length === 0 && !error && (
        <p className="text-sm text-zinc-500">No open reports. Nothing to review.</p>
      )}

      {flags.length > 0 && (
        <div className="space-y-3">
          {flags.map((f) => {
            const key = keyOf(f);
            const busy = resolvingKey === key;
            return (
              <div key={key} className="flex flex-col sm:flex-row gap-4 border border-zinc-800 rounded-xl p-4 shadow-elevation-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.photo_url}
                  alt=""
                  className="w-full sm:w-32 h-32 object-cover rounded-lg border border-zinc-800 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{CONTENT_TYPE_LABELS[f.content_type] ?? f.content_type}</Badge>
                    <span className="px-1.5 py-0.5 rounded-full bg-red-900/60 text-red-400 text-xs tabular-nums font-semibold">
                      {f.flag_count} report{f.flag_count === 1 ? "" : "s"}
                    </span>
                  </div>
                  {f.context?.label && (
                    <p className="text-sm text-zinc-200 font-medium truncate">{f.context.label}</p>
                  )}
                  {f.reasons.length > 0 && (
                    <p className="text-xs text-zinc-400 truncate">Reasons: {f.reasons.join(", ")}</p>
                  )}
                  <p className="text-xs text-zinc-500">
                    First reported {new Date(f.first_flagged_at).toLocaleString()} · Last {new Date(f.last_flagged_at).toLocaleString()}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => resolve(f, "hide")}
                      disabled={busy}
                      className="px-3 py-2 min-h-11 text-sm font-semibold bg-red-800 hover:bg-red-700 active:bg-red-900 text-white rounded-lg transition-[background-color,transform] duration-150 active:scale-95 disabled:active:scale-100 touch-manipulation disabled:opacity-50"
                    >
                      {busy ? "Working…" : f.content_type === "problem_report" ? "Pull from map" : "Hide photo"}
                    </button>
                    <button
                      onClick={() => resolve(f, "dismiss")}
                      disabled={busy}
                      className="px-3 py-2 min-h-11 text-sm bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 text-zinc-300 rounded-lg transition-[background-color,transform] duration-150 active:scale-95 disabled:active:scale-100 touch-manipulation disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                    {f.context?.map_link && (
                      <a
                        href={`/campaigns/${f.context.map_link.campaign_slug}?lat=${f.context.map_link.lat}&lng=${f.context.map_link.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 min-h-11 text-sm bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 text-zinc-300 rounded-lg transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation inline-flex items-center"
                      >
                        See on map
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-4 border-t border-zinc-800">
        <button
          onClick={() => setShowHistory(s => !s)}
          className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          {showHistory ? "Hide" : "Show"} past moderations {history.length > 0 && `(${history.length})`}
        </button>

        {showHistory && (
          <div className="mt-3 space-y-2">
            {historyLoading && <p className="text-sm text-zinc-500">Loading…</p>}
            {!historyLoading && history.length === 0 && (
              <p className="text-sm text-zinc-500">No resolved reports yet.</p>
            )}
            {history.map((f) => {
              const key = `${keyOf(f)}:${f.resolved_at}`;
              return (
                <div
                  key={key}
                  className="flex flex-col sm:flex-row gap-4 border border-zinc-800/60 rounded-xl p-4 opacity-50 grayscale"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.photo_url}
                    alt=""
                    className="w-full sm:w-24 h-24 object-cover rounded-lg border border-zinc-800 shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{CONTENT_TYPE_LABELS[f.content_type] ?? f.content_type}</Badge>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                          f.resolution === "hidden" ? "bg-red-900/40 text-red-400" : "bg-zinc-700/60 text-zinc-300"
                        }`}
                      >
                        {f.resolution === "hidden" ? "Hidden" : "Dismissed"}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-xs tabular-nums">
                        {f.flag_count} report{f.flag_count === 1 ? "" : "s"}
                      </span>
                    </div>
                    {f.context?.label && <p className="text-sm text-zinc-300 truncate">{f.context.label}</p>}
                    {f.reasons.length > 0 && (
                      <p className="text-xs text-zinc-500 truncate">Reasons: {f.reasons.join(", ")}</p>
                    )}
                    <p className="text-xs text-zinc-500">
                      Resolved {new Date(f.resolved_at).toLocaleString()} by {f.resolved_by.label ?? "Unknown admin"}
                    </p>
                    {f.context?.map_link && (
                      <a
                        href={`/campaigns/${f.context.map_link.campaign_slug}?lat=${f.context.map_link.lat}&lng=${f.context.map_link.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors"
                      >
                        See on map
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BlockedUsersSection />
    </div>
  );
}

type BlockedUserEntry = {
  id: string;
  reason: string | null;
  created_at: string;
  blocker: { id: string; username: string | null; display_name: string | null };
  blocked: { id: string; username: string | null; display_name: string | null };
};

function BlockedUsersSection() {
  const [blocks, setBlocks] = useState<BlockedUserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/blocked-users");
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? "Failed to load blocked users");
        setBlocks(data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load blocked users");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const label = (p: { username: string | null; display_name: string | null }) =>
    p.display_name || (p.username ? `@${p.username}` : "Unknown user");

  return (
    <div className="pt-4 border-t border-zinc-800 space-y-3">
      <h3 className="text-sm font-semibold text-zinc-300">User blocks</h3>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {!loading && blocks.length === 0 && !error && (
        <p className="text-sm text-zinc-500">No users have blocked anyone yet.</p>
      )}
      {blocks.length > 0 && (
        <div className="space-y-2">
          {blocks.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-2 border border-zinc-800/60 rounded-lg px-3 py-2 text-sm">
              <span className="text-zinc-200">{label(b.blocker)}</span>
              <span className="text-zinc-600">blocked</span>
              <span className="text-zinc-200">{label(b.blocked)}</span>
              <span className="text-xs text-zinc-500 ml-auto">{new Date(b.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  points: "Points",
  multipliers: "Multipliers",
  claim_timing: "Claim timing",
  proximity: "Proximity",
  triggers: "Trigger defaults",
  moderation: "Moderation",
  milestones: "Milestone ladders",
  notifications: "Email notifications",
  bonus_spots: "Bonus spots",
};

// Settings that are conceptually booleans (stored as 0/1 in the numeric game_settings
// column) get a toggle switch instead of a number input.
const BOOLEAN_SETTING_KEYS = new Set([
  "email_partner_coordination_enabled",
  "email_attendee_reminder_enabled",
  "email_organizer_stats_reminder_enabled",
]);

const METERS_TO_FEET = 3.28084;

// Unit shown next to each non-proximity setting's input (proximity rows get their own
// meters/feet split below instead). Omitted keys are plain counts/scores — no unit shown.
const UNIT_LABELS: Record<string, string> = {
  claim_before_window_minutes: "min",
  claim_after_window_minutes_low: "min",
  claim_after_window_minutes_medium: "min",
  claim_after_window_minutes_high: "min",
  claim_reclaim_cooldown_minutes: "min",
  cleanup_event_grace_minutes_before: "min",
  cleanup_event_grace_minutes_after: "min",
  cleanup_event_late_submission_hours: "hr",
  hotspot_event_duration_hours: "hr",
  threshold_reached_event_duration_hours: "hr",
  time_elapsed_default_hours: "hr",
  time_elapsed_event_duration_hours_default: "hr",
  claim_challenge_multiplier: "×",
  hotspot_multiplier: "×",
  bonus_spot_multiplier: "×",
  bonus_spot_default_duration_minutes: "min",
  small_bag_value: "pts",
  large_bag_value: "pts",
  pound_value: "pts",
  trash_report_value: "pts",
  trash_war_solarpunk_credit: "pts",
  threshold_reached_default: "pts",
  points_milestone_1: "pts",
  points_milestone_2: "pts",
  points_milestone_3: "pts",
  points_milestone_4: "pts",
  points_milestone_5: "pts",
  cleanup_bag_milestone_1: "bags",
  cleanup_bag_milestone_2: "bags",
  cleanup_bag_milestone_3: "bags",
  cleanup_bag_milestone_4: "bags",
  cleanup_bag_milestone_5: "bags",
  cleanup_pound_milestone_1: "lbs",
  cleanup_pound_milestone_2: "lbs",
  cleanup_pound_milestone_3: "lbs",
  cleanup_pound_milestone_4: "lbs",
  cleanup_pound_milestone_5: "lbs",
};

function SettingsTab({ settings, setSettings }: {
  settings: GameSetting[];
  setSettings: (s: GameSetting[]) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(
    () => Object.fromEntries(settings.map(s => [s.key, String(s.value)]))
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<string, GameSetting[]> = {};
    for (const s of settings) {
      (groups[s.category] ??= []).push(s);
    }
    return groups;
  }, [settings]);

  const handleSave = async (setting: GameSetting, overrideValue?: number) => {
    let parsed = overrideValue;
    if (parsed === undefined) {
      const raw = drafts[setting.key];
      parsed = Number(raw);
      if (raw === "" || Number.isNaN(parsed)) {
        setErrorKey(setting.key);
        return;
      }
    }
    setSavingKey(setting.key);
    setErrorKey(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .schema("public")
      .from("game_settings")
      .update({ value: parsed, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
      .eq("key", setting.key);
    setSavingKey(null);
    if (error) {
      setErrorKey(setting.key);
      return;
    }
    setSettings(settings.map(s => s.key === setting.key ? { ...s, value: parsed! } : s));
    setDrafts(d => ({ ...d, [setting.key]: String(parsed) }));
    setSavedKey(setting.key);
    setTimeout(() => setSavedKey(k => k === setting.key ? null : k), 1500);
  };

  return (
    <div className="flex items-start gap-8">
      <nav className="hidden md:block sticky top-20 shrink-0 w-40 space-y-1">
        {Object.keys(grouped).map(category => (
          <a
            key={category}
            href={`#settings-${category}`}
            className="block text-xs text-zinc-400 hover:text-emerald-400 active:text-emerald-400 transition-colors duration-150 py-1"
          >
            {CATEGORY_LABELS[category] ?? category}
          </a>
        ))}
      </nav>
      <div className="flex-1 min-w-0 space-y-8">
      {Object.entries(grouped).map(([category, rows]) => (
        <div key={category} id={`settings-${category}`} className="space-y-3 scroll-mt-20">
          <h2 className="text-sm font-semibold text-zinc-300">{CATEGORY_LABELS[category] ?? category}</h2>
          {(category === "points" || category === "multipliers") && (
            <p className="text-xs text-amber-400/80 -mt-1.5">
              Changing a value here only affects new submissions going forward. Existing bag/pound cleanup
              contributions keep the point value they were awarded at submission time — there is no way to
              retroactively re-price them, and &ldquo;Recompute all balances&rdquo; does not cover them. The one
              exception is trash report value, which is calculated live and is fully covered by recompute.
            </p>
          )}
          <div className="border border-zinc-800 rounded-xl divide-y divide-zinc-800/60 shadow-elevation-1">
            {rows.map(setting => {
              const dirty = drafts[setting.key] !== String(setting.value);
              const isProximity = setting.category === "proximity" || setting.key === "bonus_spot_default_radius_m";
              const isSolarpunkTieIn = setting.key === "trash_war_solarpunk_credit";
              const isBoolean = BOOLEAN_SETTING_KEYS.has(setting.key);
              const metersDraft = Number(drafts[setting.key]);
              const feetDraft = Number.isFinite(metersDraft) ? Math.round(metersDraft * METERS_TO_FEET) : NaN;
              if (isBoolean) {
                const on = setting.value !== 0;
                return (
                  <div key={setting.key} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-zinc-200">{setting.label}</p>
                      {setting.description && (
                        <p className="text-xs text-zinc-500 mt-0.5">{setting.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {savedKey === setting.key && <span className="text-xs text-emerald-400">Saved ✓</span>}
                      {errorKey === setting.key && <span className="text-xs text-red-400">Error</span>}
                      <button
                        role="switch"
                        aria-checked={on}
                        disabled={savingKey === setting.key}
                        onClick={() => handleSave(setting, on ? 0 : 1)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150 disabled:opacity-50 touch-manipulation ${
                          on ? "bg-emerald-600" : "bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-150 ${
                            on ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={setting.key}
                  className={`flex items-center gap-4 px-4 py-3 ${isSolarpunkTieIn ? "opacity-60 bg-zinc-900/20" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium flex items-center gap-2 ${isSolarpunkTieIn ? "text-xs text-zinc-400" : "text-sm text-zinc-200"}`}>
                      {setting.label}
                      {isSolarpunkTieIn && (
                        <span className="text-[10px] font-normal uppercase tracking-wide text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">
                          Solarpunk tie-in
                        </span>
                      )}
                    </p>
                    {setting.description && (
                      <p className="text-xs text-zinc-500 mt-0.5">{setting.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      step="any"
                      className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm text-right focus:outline-none focus:border-zinc-500"
                      value={drafts[setting.key] ?? ""}
                      onChange={e => setDrafts({ ...drafts, [setting.key]: e.target.value })}
                    />
                    {isProximity ? (
                      <span className="text-xs text-zinc-500">m</span>
                    ) : UNIT_LABELS[setting.key] ? (
                      <span className="text-xs text-zinc-500">{UNIT_LABELS[setting.key]}</span>
                    ) : null}
                    {isProximity && (
                      <>
                        <input
                          type="number"
                          step="any"
                          className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm text-right focus:outline-none focus:border-zinc-500"
                          value={Number.isNaN(feetDraft) ? "" : feetDraft}
                          onChange={e => {
                            const feet = Number(e.target.value);
                            setDrafts({
                              ...drafts,
                              [setting.key]: e.target.value === "" || Number.isNaN(feet)
                                ? ""
                                : (feet / METERS_TO_FEET).toFixed(2),
                            });
                          }}
                        />
                        <span className="text-xs text-zinc-500">ft</span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => handleSave(setting)}
                    disabled={!dirty || savingKey === setting.key}
                    className="px-3 py-1.5 min-h-9 text-xs bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 disabled:opacity-40 disabled:hover:bg-emerald-700 disabled:active:scale-100 text-white rounded-lg font-medium transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation shrink-0"
                  >
                    {savingKey === setting.key ? "Saving…" : savedKey === setting.key ? "Saved ✓" : "Save"}
                  </button>
                  {errorKey === setting.key && (
                    <span className="text-xs text-red-400 shrink-0">Error</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {settings.length === 0 && (
        <p className="text-sm text-zinc-500">No settings found — has migration 055_game_settings.sql been applied?</p>
      )}
      </div>
    </div>
  );
}

function TeamEventsTab({ campaigns, teamEvents, setTeamEvents, currentUserId }: {
  campaigns: Campaign[];
  teamEvents: TeamEventListItem[];
  setTeamEvents: (e: TeamEventListItem[]) => void;
  currentUserId: string;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<TeamEventDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const openEvent = async (id: string) => {
    setLoadError(null);
    setEditingId(id);
    setEditingEvent(null);
    try {
      const detail = await getTeamEvent(id);
      setEditingEvent(detail);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load event");
    }
  };

  const refreshList = async () => {
    try {
      setTeamEvents(await listTeamEvents(currentUserId));
    } catch {
      // keep showing stale list on refresh failure
    }
  };

  const closeEvent = () => {
    setEditingId(null);
    setEditingEvent(null);
    setLoadError(null);
    refreshList();
  };

  if (editingId) {
    return (
      <div className="space-y-4">
        <button
          onClick={closeEvent}
          className="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors duration-150"
        >
          ← Back to team events
        </button>
        {loadError && (
          <p className="text-sm text-red-400 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2">{loadError}</p>
        )}
        {editingEvent && (
          <EditTeamEventView event={editingEvent} requestingUserId={currentUserId} isAdmin={true} />
        )}
        {!editingEvent && !loadError && (
          <p className="text-sm text-zinc-500">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-zinc-500">{teamEvents.length} team event{teamEvents.length !== 1 ? "s" : ""}</span>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="self-start px-3 py-1.5 min-h-9 text-sm font-medium bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-lg transition-[background-color,transform] duration-150 active:scale-95 touch-manipulation"
        >
          {showCreate ? "Cancel" : "+ New event"}
        </button>
      </div>

      {showCreate && (
        <NewTeamEventForm
          requestingUserId={currentUserId}
          campaigns={campaigns}
          onCreated={(id) => {
            setShowCreate(false);
            refreshList();
            openEvent(id);
          }}
        />
      )}

      <div className="space-y-2">
        {teamEvents.length === 0 && (
          <div className="border border-zinc-800 rounded-xl px-5 py-12 text-center text-zinc-600 text-sm shadow-elevation-1">
            No team events yet.
          </div>
        )}
        {teamEvents.map((e) => (
          <button
            key={e.id}
            onClick={() => openEvent(e.id)}
            className="w-full text-left flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-elevation-1 px-4 py-3 hover:border-zinc-700 transition-colors duration-150"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">{e.title}</p>
              <p className="text-xs text-zinc-500">{new Date(e.starts_at).toLocaleDateString()}</p>
            </div>
            <span
              className={cn(
                "shrink-0 text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full",
                e.status === "active" && "bg-emerald-900/60 text-emerald-400",
                e.status === "draft" && "bg-zinc-800 text-zinc-400",
                e.status === "completed" && "bg-sky-900/60 text-sky-400",
                e.status === "cancelled" && "bg-red-900/60 text-red-400"
              )}
            >
              {e.status}
            </span>
          </button>
        ))}
      </div>
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
  initialBusinessLocations,
  initialGroups,
  initialTeamEvents,
  currentUserId,
  initialSettings,
}: {
  initialCampaigns: Campaign[];
  initialEvents: ActiveEvent[];
  initialTriggers: Trigger[];
  initialBusinesses: PartnerBusiness[];
  initialOffers: PartnerOffer[];
  initialOfferRedemptions: OfferRedemption[];
  initialBusinessCampaignLinks: BusinessCampaignLink[];
  initialBusinessLocations: PartnerBusinessLocation[];
  initialGroups: AdminGroup[];
  initialTeamEvents: TeamEventListItem[];
  currentUserId: string;
  initialSettings: GameSetting[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTabState] = useState<Tab>(
    tabParam && (TAB_VALUES as readonly string[]).includes(tabParam) ? (tabParam as Tab) : "campaigns"
  );
  const setTab = (t: Tab) => {
    setTabState(t);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", t);
    router.replace(`?${params.toString()}`, { scroll: false });
  };
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const mobileMoreRef = useRef<HTMLDivElement>(null);
  useClickOutside(mobileMoreRef, () => setMobileMoreOpen(false), mobileMoreOpen);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const sortedCampaigns = useMemo(() => sortCampaignsByStatus(campaigns), [campaigns]);
  const activeCampaigns = useMemo(() => sortedCampaigns.filter(c => c.status === "active"), [sortedCampaigns]);
  const [events, setEvents] = useState(initialEvents);
  const [triggers, setTriggers] = useState(initialTriggers);
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [offers, setOffers] = useState(initialOffers);
  const redemptionCounts = initialOfferRedemptions.reduce<Record<string, number>>((acc, r) => {
    acc[r.offer_id] = (acc[r.offer_id] ?? 0) + 1;
    return acc;
  }, {});
  const [businessCampaignLinks, setBusinessCampaignLinks] = useState(initialBusinessCampaignLinks);
  const [businessLocations, setBusinessLocations] = useState(initialBusinessLocations);
  const [groups, setGroups] = useState(initialGroups);
  const [teamEvents, setTeamEvents] = useState(initialTeamEvents);
  const [settings, setSettings] = useState(initialSettings);
  const hotspotMultiplier = settings.find(s => s.key === "hotspot_multiplier")?.value ?? 1;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24 sm:pb-10 w-full">
      <div className="mb-6">
        <BackButton href="/" label="Back to app" className="sm:hidden mb-1 text-xs" />
        <h1 className="text-2xl font-black text-zinc-100">Admin Panel</h1>
        <p className="text-sm text-zinc-500 mt-1">Internal campaign management</p>
      </div>

      <div className="hidden sm:flex items-center gap-1 mb-6 border-b border-zinc-800">
        {TAB_VALUES.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-[color,border-color,transform] duration-150 -mb-px active:scale-[0.97] whitespace-nowrap ${
              tab === t
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300 active:text-zinc-300 transition-colors duration-150"
            }`}
          >
            {TAB_LABEL[t]}
            {t === "events" && events.filter(e => e.status === "active").length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-900/60 text-red-400 text-xs tabular-nums">
                {events.filter(e => e.status === "active").length}
              </span>
            )}
            {t === "groups" && groups.filter(g => g.status === "pending").length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-900/60 text-amber-400 text-xs tabular-nums">
                {groups.filter(g => g.status === "pending").length}
              </span>
            )}
            {t === "partners" && businesses.filter(b => b.status === "pending").length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-900/60 text-amber-400 text-xs tabular-nums">
                {businesses.filter(b => b.status === "pending").length}
              </span>
            )}
          </button>
        ))}
      </div>

      <nav className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-sm shadow-elevation-3 pb-safe">
        <div className="flex items-stretch px-1 pt-1">
          {MOBILE_PRIMARY_TABS.map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setMobileMoreOpen(false); }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] text-[11px] font-medium capitalize relative active:scale-95 transition-transform duration-100 touch-manipulation"
            >
              <span className="relative flex items-center justify-center w-9 h-7">
                {tab === t && (
                  <motion.span
                    layoutId="admin-tab-pill"
                    className="absolute inset-0 rounded-full bg-emerald-500/15"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span
                  className={cn(
                    "relative z-10 text-lg leading-none transition-colors",
                    tab === t ? "text-emerald-400" : "text-zinc-500"
                  )}
                >
                  {TAB_ICON[t]}
                </span>
              </span>
              <span className={cn("transition-colors", tab === t ? "text-emerald-400" : "text-zinc-500")}>{TAB_LABEL[t]}</span>
              {t === "events" && events.filter(e => e.status === "active").length > 0 && (
                <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
              )}
              {t === "groups" && groups.filter(g => g.status === "pending").length > 0 && (
                <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)]" />
              )}
              {t === "partners" && businesses.filter(b => b.status === "pending").length > 0 && (
                <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)]" />
              )}
            </button>
          ))}
          <div className="relative flex-1" ref={mobileMoreRef}>
            <button
              onClick={() => setMobileMoreOpen(o => !o)}
              aria-label="More admin tabs"
              aria-expanded={mobileMoreOpen}
              className={cn(
                "w-full h-full flex flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] text-[11px] font-medium transition-colors active:scale-95 duration-100 touch-manipulation",
                mobileMoreOpen || MOBILE_OVERFLOW_TABS.includes(tab) ? "text-emerald-400" : "text-zinc-500"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center w-9 h-7 rounded-full text-lg leading-none transition-colors",
                  mobileMoreOpen || MOBILE_OVERFLOW_TABS.includes(tab) ? "bg-emerald-500/15 text-emerald-400" : "text-zinc-500"
                )}
              >
                ⋯
              </span>
              <span>More</span>
            </button>
            <AnimatePresence>
              {mobileMoreOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 4 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-full right-0 mb-2 w-48 max-w-[calc(100vw-1rem)] bg-zinc-900 border border-zinc-800 rounded-xl shadow-elevation-4 py-1 text-sm origin-bottom-right"
                >
                  {MOBILE_OVERFLOW_TABS.map(t => (
                    <button
                      key={t}
                      onClick={() => { setTab(t); setMobileMoreOpen(false); }}
                      className={cn(
                        "w-full text-left block px-4 py-2.5 min-h-[44px] flex items-center gap-2 capitalize transition-colors hover:bg-zinc-800 active:bg-zinc-800",
                        tab === t ? "text-emerald-400" : "text-zinc-300"
                      )}
                    >
                      <span>{TAB_ICON[t]}</span>
                      {TAB_LABEL[t]}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>

      {tab === "campaigns" && <CampaignsTab campaigns={sortedCampaigns} setCampaigns={setCampaigns} />}
      {tab === "triggers" && <TriggersTab campaigns={activeCampaigns} triggers={triggers} setTriggers={setTriggers} hotspotMultiplier={hotspotMultiplier} />}
      {tab === "events" && <EventsTab campaigns={activeCampaigns} events={events} setEvents={setEvents} currentUserId={currentUserId} />}
      {tab === "partners" && (
        <PartnersTab
          businesses={businesses}
          setBusinesses={setBusinesses}
          offers={offers}
          setOffers={setOffers}
          redemptionCounts={redemptionCounts}
          campaigns={activeCampaigns}
          businessCampaignLinks={businessCampaignLinks}
          setBusinessCampaignLinks={setBusinessCampaignLinks}
          businessLocations={businessLocations}
          setBusinessLocations={setBusinessLocations}
        />
      )}
      {tab === "groups" && <GroupsTab groups={groups} setGroups={setGroups} currentUserId={currentUserId} />}
      {tab === "team_events" && (
        <TeamEventsTab campaigns={activeCampaigns} teamEvents={teamEvents} setTeamEvents={setTeamEvents} currentUserId={currentUserId} />
      )}
      {tab === "leaderboard" && <LeaderboardTab campaigns={activeCampaigns} />}
      {tab === "moderation" && <ModerationTab />}
      {tab === "admins" && <AdminRolesTab requestingUserId={currentUserId} />}
      {tab === "settings" && <SettingsTab settings={settings} setSettings={setSettings} />}
    </main>
  );
}
