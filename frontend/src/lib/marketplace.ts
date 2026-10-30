/** Shared marketplace types and display helpers (safe for server and client components). */

export type TimeMode = "specific" | "window" | "flexible";

export const JOB_TYPE_LABELS: Record<string, string> = {
  litter: "Litter pickup",
  lot_cleanup: "Lot cleanup",
  sidewalk: "Sidewalk cleanup",
  light_yard_work: "Light yard work",
};

export const TIME_MODE_LABELS: Record<TimeMode, string> = {
  specific: "Exact time",
  window: "Window",
  flexible: "Flexible",
};

export type Job = {
  id: string;
  customer_id: string;
  cleaner_id: string | null;
  origin: "direct" | "board";
  title: string;
  description: string;
  job_type: string;
  size: "small" | "medium" | "large" | null;
  address_label: string | null;
  time_mode: TimeMode;
  starts_at: string | null;
  window_start: string | null;
  window_end: string | null;
  flexible_days: number | null;
  expires_at: string | null;
  price_type: "hourly" | "fixed";
  price_cents: number;
  platform_fee_cents: number;
  status: string;
  hold_status: string;
  cancel_reason: string | null;
  completed_at: string | null;
  release_after: string | null;
  cleaner_payout_cents?: number;
  listing_photos?: string[];
  price_flag_count?: number;
  price_flagged_by_me?: boolean;
  price_suggested_cents?: number | null;
  price_flag_notes?: string[];
  check_in_distance_m?: number | null;
  finish_distance_m?: number | null;
  location_flagged?: boolean;
  created_at: string;
  customer_username: string | null;
  cleaner_username: string | null;
  distance_km?: number | null;
  is_mine?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  radius_m?: number | null;
  area?: GeoJSON.Polygon | null;
  viewer_role?: "customer" | "cleaner" | "viewer";
};

export type CleanerCard = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  headline: string;
  bio?: string;
  services: string[];
  rate_type: "hourly" | "fixed";
  rate_cents: number | null;
  service_radius_km: number;
  area_label: string | null;
  rating_avg: number | null;
  rating_count: number;
  jobs_completed: number;
  distance_km?: number | null;
  reviews?: { rating: number; comment: string | null; created_at: string; username: string | null }[];
};

export type MeStatus = {
  cleaner_profile: (CleanerCard & { status: string; payouts_enabled: boolean }) | null;
  cleaner_agreement_accepted: boolean;
  customer_terms_accepted: boolean;
  job_types: string[];
  /** False when Stripe Connect is not configured, so the server does not gate taking jobs on payouts. */
  payouts_required: boolean;
};

/** True when this user has a cleaner profile but the server will refuse to let them take jobs until payouts are set up. */
export const payoutsBlocked = (me: MeStatus | null) =>
  !!me?.payouts_required && !!me.cleaner_profile && !me.cleaner_profile.payouts_enabled;

export const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const shortDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function whenLabel(
  j: Pick<Job, "time_mode" | "starts_at" | "window_start" | "window_end" | "flexible_days">,
): string {
  if (j.time_mode === "specific" && j.starts_at) return shortDateTime(j.starts_at);
  if (j.time_mode === "window" && j.window_start && j.window_end)
    return `${shortDate(j.window_start)} to ${shortDate(j.window_end)}`;
  if (j.time_mode === "flexible" && j.flexible_days) return `Within ${j.flexible_days} days`;
  return "";
}

export const STATUS_LABELS: Record<string, { label: string; tone: "success" | "pending" | "error" | "info" | "neutral" }> = {
  requested: { label: "Awaiting cleaner", tone: "pending" },
  open: { label: "Open", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  in_progress: { label: "In progress", tone: "info" },
  completed: { label: "Awaiting confirmation", tone: "pending" },
  confirmed: { label: "Complete", tone: "success" },
  released: { label: "Complete", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  disputed: { label: "In dispute", tone: "error" },
  refunded: { label: "Refunded", tone: "neutral" },
};

/** Fetch helper for client components; throws with the server's message. */
export async function mk<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/marketplace${path}`, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data && typeof data.detail === "string" ? data.detail : "Something went wrong.");
  return data as T;
}
