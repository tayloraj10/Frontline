import { uploadEventImage } from "@/lib/events";
import type { RouteLineString } from "@/lib/cleanupRoutes";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export type CleanupEventRsvp = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  status: "going" | "maybe" | "cancelled";
  checked_in_at: string | null;
  is_organizer: boolean;
  small_bags: number;
  large_bags: number;
  pounds: number;
  points: number;
  photos: string[];
  is_late: boolean;
};

export type CleanupEventDetailData = {
  id: string;
  campaign_id: string;
  campaign_slug: string;
  title: string;
  description: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: string;
  image_url: string | null;
  lat: number;
  lng: number;
  route: RouteLineString | null;
  route_buffer: GeoJSON.Polygon | null;
  group_id: string;
  group_name: string;
  group_slug: string;
  group_logo_url: string | null;
  join_code: string | null;
  is_organizer: boolean;
  rsvps: CleanupEventRsvp[];
  viewer_rsvp: CleanupEventRsvp | null;
  max_attendees: number | null;
  going_count: number;
  is_full: boolean;
  total_small_bags: number;
  total_large_bags: number;
  total_pounds: number;
  photos: string[];
  external_link: string | null;
  check_in_window_start: string | null;
  check_in_window_end: string | null;
  check_in_radius_meters: number;
};

export type GroupCleanupEventListItem = {
  id: string;
  title: string;
  description: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: string;
  image_url: string | null;
  lat: number;
  lng: number;
  max_attendees: number | null;
  going_count: number;
  is_past: boolean;
  is_ongoing: boolean;
};

export async function listGroupCleanupEvents(groupId: string, viewerUserId?: string | null): Promise<GroupCleanupEventListItem[]> {
  const qs = viewerUserId ? `?viewer_user_id=${viewerUserId}` : "";
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/cleanup-events/group/${groupId}${qs}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<GroupCleanupEventListItem[]>;
}

export async function getCleanupEvent(cleanupId: string, viewerUserId?: string | null): Promise<CleanupEventDetailData> {
  const qs = viewerUserId ? `?viewer_user_id=${viewerUserId}` : "";
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/cleanup-events/${cleanupId}${qs}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CleanupEventDetailData>;
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export { uploadEventImage };

export type CreatedCleanupEvent = {
  id: string;
  join_code: string;
  geo_unit_id: string | null;
};

export async function createCleanupEvent({
  campaignId,
  groupId,
  organizerUserId,
  title,
  description,
  imageFile,
  scheduledStart,
  scheduledEnd,
  latitude,
  longitude,
  maxAttendees,
  externalLink,
  route,
}: {
  campaignId: string;
  groupId: string;
  organizerUserId: string;
  title: string;
  description: string;
  imageFile: File | null;
  scheduledStart: string;
  scheduledEnd: string | null;
  latitude: number;
  longitude: number;
  maxAttendees?: number | null;
  externalLink?: string | null;
  route?: RouteLineString | null;
}): Promise<CreatedCleanupEvent> {
  let imageUrl: string | null = null;
  if (imageFile) imageUrl = await uploadEventImage(imageFile);

  return postJson<CreatedCleanupEvent>("/cleanup-events", {
    campaign_id: campaignId,
    group_id: groupId,
    organizer_user_id: organizerUserId,
    title: title.trim(),
    description: description.trim() || null,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    latitude,
    longitude,
    image_url: imageUrl,
    max_attendees: maxAttendees ?? null,
    external_link: externalLink?.trim() || null,
    route: route ?? null,
  });
}

export async function updateCleanupEvent({
  cleanupId,
  organizerUserId,
  title,
  description,
  imageFile,
  scheduledStart,
  scheduledEnd,
  latitude,
  longitude,
  status,
  maxAttendees,
  externalLink,
  route,
  clearRoute,
}: {
  cleanupId: string;
  organizerUserId: string;
  title?: string;
  description?: string;
  imageFile?: File | null;
  scheduledStart?: string;
  scheduledEnd?: string | null;
  latitude?: number;
  longitude?: number;
  status?: string;
  maxAttendees?: number | null;
  externalLink?: string | null;
  route?: RouteLineString | null;
  clearRoute?: boolean;
}): Promise<{ id: string; updated: boolean }> {
  let imageUrl: string | undefined;
  if (imageFile) imageUrl = await uploadEventImage(imageFile);

  return patchJson(`/cleanup-events/${cleanupId}`, {
    organizer_user_id: organizerUserId,
    title: title?.trim(),
    description: description?.trim() || undefined,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    latitude,
    longitude,
    image_url: imageUrl,
    status,
    max_attendees: maxAttendees,
    external_link: externalLink,
    route: route ?? null,
    clear_route: clearRoute ?? false,
  });
}

export async function rsvpToCleanupEvent({
  cleanupId,
  userId,
  status = "going",
}: {
  cleanupId: string;
  userId: string;
  status?: "going" | "maybe" | "cancelled";
}): Promise<{ id: string; status: string; checked_in_at: string | null }> {
  return postJson(`/cleanup-events/${cleanupId}/rsvp`, { user_id: userId, status });
}

export async function checkInToCleanupEvent({
  cleanupId,
  userId,
  joinCode,
  latitude,
  longitude,
}: {
  cleanupId: string;
  userId: string;
  joinCode?: string;
  latitude?: number;
  longitude?: number;
}): Promise<{ id: string; checked_in_at: string }> {
  return postJson(`/cleanup-events/${cleanupId}/check-in`, {
    user_id: userId,
    join_code: joinCode,
    latitude,
    longitude,
  });
}

export async function logForAttendee({
  cleanupId,
  organizerUserId,
  attendeeUserId,
  smallBags,
  largeBags,
  pounds,
  scoringMethod = "bags",
  photoUrls,
}: {
  cleanupId: string;
  organizerUserId: string;
  attendeeUserId: string;
  smallBags?: number;
  largeBags?: number;
  pounds?: number;
  scoringMethod?: "bags" | "pounds";
  photoUrls?: string[];
}): Promise<{ contribution_id: string; value: number }> {
  return postJson(`/cleanup-events/${cleanupId}/log-for-attendee`, {
    organizer_user_id: organizerUserId,
    attendee_user_id: attendeeUserId,
    small_bags: smallBags,
    large_bags: largeBags,
    pounds,
    scoring_method: scoringMethod,
    photo_urls: photoUrls,
  });
}

export async function logTeamTotal({
  cleanupId,
  organizerUserId,
  smallBags,
  largeBags,
  pounds,
  photoUrls,
  attendeePool = "checked_in",
  scoringMethod = "bags",
  overrides,
}: {
  cleanupId: string;
  organizerUserId: string;
  smallBags?: number;
  largeBags?: number;
  pounds?: number;
  photoUrls?: string[];
  attendeePool?: "checked_in" | "going";
  scoringMethod?: "bags" | "pounds";
  overrides?: Record<string, number>;
}): Promise<{ credited_count: number; total_value: number; per_attendee_value: number }> {
  return postJson(`/cleanup-events/${cleanupId}/log-team-total`, {
    organizer_user_id: organizerUserId,
    small_bags: smallBags,
    large_bags: largeBags,
    pounds,
    photo_urls: photoUrls,
    attendee_pool: attendeePool,
    scoring_method: scoringMethod,
    overrides,
  });
}

export type TeamTotalLogEntry = {
  id: string;
  organizer_user_id: string | null;
  organizer_name: string;
  scoring_method: "bags" | "pounds";
  small_bags: number | null;
  large_bags: number | null;
  pounds: number | null;
  total_value: number;
  credited_count: number;
  created_at: string;
};

export async function getTeamTotalLogs(cleanupId: string): Promise<TeamTotalLogEntry[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/cleanup-events/${cleanupId}/team-total-logs`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<TeamTotalLogEntry[]>;
}

export async function promoteOrganizer({
  cleanupId,
  organizerUserId,
  targetUserId,
}: {
  cleanupId: string;
  organizerUserId: string;
  targetUserId: string;
}): Promise<{ user_id: string; is_organizer: boolean }> {
  return postJson(`/cleanup-events/${cleanupId}/organizers`, {
    organizer_user_id: organizerUserId,
    target_user_id: targetUserId,
  });
}

export async function demoteOrganizer({
  cleanupId,
  organizerUserId,
  targetUserId,
}: {
  cleanupId: string;
  organizerUserId: string;
  targetUserId: string;
}): Promise<{ user_id: string; is_organizer: boolean }> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/cleanup-events/${cleanupId}/organizers/${targetUserId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizer_user_id: organizerUserId, target_user_id: targetUserId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
