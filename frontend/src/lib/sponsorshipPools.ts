export type PoolStatus = "open" | "active" | "expired" | "cancelled";

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
  payout_rule: { type: string; amount_cents?: number; cents_per_bag?: number; max_bags?: number };
  cap_per_user_cents: number | null;
  site_label: string;
  site_latitude: number;
  site_longitude: number;
  site_radius_meters: number;
  status: PoolStatus;
  deadline: string;
  sponsorship_id: string | null;
  contributors?: PoolContributor[];
  my_contribution_cents?: number;
  is_creator?: boolean;
}

export const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export function describeRule(rule: SponsorshipPool["payout_rule"]): string {
  if (rule.type === "per_bag") return `${usd(rule.cents_per_bag ?? 0)} per bag, up to ${rule.max_bags ?? 10} bags`;
  return `${usd(rule.amount_cents ?? 0)} per verified cleanup`;
}

export function daysLeft(deadline: string): number {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000));
}
