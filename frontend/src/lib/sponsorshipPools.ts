export type PoolStatus = "open" | "goal_missed" | "handoff" | "voting" | "choosing" | "active" | "expired" | "cancelled" | "closed";

export type PlanKind = "rule" | "group" | "vote" | "jobs";

export interface PoolJob {
  id: string;
  title: string;
  price_cents: number;
  status: string;
  cleaner_name: string | null;
  after_photos: string[];
  completed_at: string | null;
  release_after: string | null;
}

export interface VoteOption {
  choice: "flat" | "bag" | "split";
  votes: number;
  rule: SponsorshipPool["payout_rule"];
}

export interface PoolContributor {
  name: string;
  avatar_url: string | null;
  amount_cents: number;
}

export interface SponsorshipPool {
  id: string;
  creator_id: string;
  creator_name: string;
  title: string;
  message: string | null;
  goal_cents: number;
  raised_cents: number;
  contributor_count: number;
  /** Null while a contributor vote or a lapsed hand-off has not settled on a rule yet. */
  payout_rule: {
    type: string;
    amount_cents?: number;
    cents_per_bag?: number;
    max_bags?: number;
    min_large_bags?: number;
  } | null;
  plan_kind: PlanKind;
  handoff_group_id?: string | null;
  handoff_group_name?: string | null;
  handoff_group_slug?: string | null;
  handoff_note?: string | null;
  handoff_date?: string | null;
  handoff_deadline?: string | null;
  vote_deadline?: string | null;
  vote_options?: VoteOption[];
  my_vote?: string | null;
  can_vote?: boolean;
  can_respond_handoff?: boolean;
  /** When a pool that missed its goal refunds if the starter has not acted. */
  missed_deadline?: string | null;
  model: "site" | "group_area";
  area_name: string | null;
  center_latitude: number | null;
  center_longitude: number | null;
  /** Simplified outline of a group-area pool. */
  area_geojson?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  cap_per_user_cents: number | null;
  site_label: string | null;
  site_latitude: number | null;
  site_longitude: number | null;
  site_radius_meters: number | null;
  status: PoolStatus;
  deadline: string;
  sponsorship_id: string | null;
  contributors?: PoolContributor[];
  my_contribution_cents?: number;
  is_creator?: boolean;
  /** Jobs budget only. */
  balance_cents?: number;
  committed_cents?: number;
  jobs_frozen?: boolean;
  jobs_deadline?: string | null;
  can_approve?: boolean;
  jobs?: PoolJob[];
}

export const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export function describeRule(rule: SponsorshipPool["payout_rule"]): string {
  if (!rule) return "To be decided";
  if (rule.type === "per_bag") return `${usd(rule.cents_per_bag ?? 0)} per bag, up to ${rule.max_bags ?? 10} bags`;
  if (rule.type === "equal_split") return "Split equally among everyone who shows up";
  return `${usd(rule.amount_cents ?? 0)} per verified cleanup`;
}

/** The place a pool funds, for display: the site label or the group area's name. */
export const poolPlace = (p: Pick<SponsorshipPool, "model" | "site_label" | "area_name">) =>
  (p.model === "group_area" ? p.area_name : p.site_label) || "Cleanup area";

export function daysLeft(deadline: string): number {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000));
}
