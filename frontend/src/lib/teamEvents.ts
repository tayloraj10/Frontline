async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
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

export type TeamEventStatus = "draft" | "active" | "completed" | "cancelled";
export type TeamEventSubmissionMode = "automatic" | "manual_opt_in";
export type ReviewStatus = "pending" | "approved" | "flagged";

export type TeamEventListItem = {
  id: string;
  slug: string;
  title: string;
  status: TeamEventStatus;
  starts_at: string;
  ends_at: string | null;
  image_url: string | null;
};

export type TeamEventTeam = {
  id: string;
  name: string;
  color: string | null;
  logo_url: string | null;
  has_boundary: boolean;
};

export type TeamEventOrganizer = {
  user_id: string;
  username: string | null;
  email: string;
};

export type CascadeMode = "cascade_all_members" | "individual_opt_in";

export type TeamEventGroupParticipant = {
  group_id: string;
  group_name: string;
  team_id: string;
  cascade_mode: CascadeMode;
};

export type TeamEventDetail = {
  id: string;
  campaign_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  status: TeamEventStatus;
  starts_at: string;
  ends_at: string | null;
  submission_mode: TeamEventSubmissionMode;
  requires_photo: boolean;
  image_url: string | null;
  teams: TeamEventTeam[];
  organizers: TeamEventOrganizer[];
  group_participants: TeamEventGroupParticipant[];
};

export type MyGroupForEvent = {
  group_id: string;
  group_name: string;
  is_admin: boolean;
  joined_team_id: string | null;
  cascade_mode: CascadeMode | null;
};

export type TeamEventStatsGroup = {
  group_id: string;
  group_name: string;
  member_count: number;
  total_value: number;
  submission_count: number;
};

export type TeamEventStatsIndividual = {
  user_id: string;
  username: string | null;
  total_value: number;
  submission_count: number;
};

export type TeamEventTeamStats = {
  team_id: string;
  name: string;
  color: string | null;
  total_value: number;
  submission_count: number;
  groups: TeamEventStatsGroup[];
  individuals: TeamEventStatsIndividual[];
};

export type ScoreboardEntry = {
  team_id: string;
  name: string;
  color: string | null;
  total_value: number;
  submission_count: number;
};

export type TeamEventSubmission = {
  id: string;
  user_id: string | null;
  team_id: string | null;
  contribution_type: string;
  value: number | null;
  small_bags: number | null;
  large_bags: number | null;
  pounds: number | null;
  photo_url: string | null;
  review_status: ReviewStatus | null;
  created_at: string;
};

export async function listTeamEvents(requestingUserId?: string | null): Promise<TeamEventListItem[]> {
  const qs = requestingUserId ? `?requesting_user_id=${requestingUserId}` : "";
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<TeamEventListItem[]>;
}

export async function getTeamEvent(teamEventId: string): Promise<TeamEventDetail> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<TeamEventDetail>;
}

export async function createTeamEvent({
  requestingUserId,
  campaignId,
  slug,
  title,
  description,
  startsAt,
  endsAt,
  submissionMode = "manual_opt_in",
  requiresPhoto = true,
  imageUrl,
  teams,
}: {
  requestingUserId: string;
  campaignId?: string | null;
  slug: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt?: string | null;
  submissionMode?: TeamEventSubmissionMode;
  requiresPhoto?: boolean;
  imageUrl?: string | null;
  teams: { name: string; color?: string | null; logoUrl?: string | null }[];
}): Promise<{ id: string; slug: string; team_ids: string[] }> {
  return postJson("/team-events", {
    requesting_user_id: requestingUserId,
    campaign_id: campaignId ?? null,
    slug,
    title: title.trim(),
    description: description?.trim() || null,
    starts_at: startsAt,
    ends_at: endsAt ?? null,
    submission_mode: submissionMode,
    requires_photo: requiresPhoto,
    image_url: imageUrl ?? null,
    teams: teams.map((t) => ({ name: t.name.trim(), color: t.color ?? null, logo_url: t.logoUrl ?? null })),
  });
}

async function uploadToR2(file: File, kind: string): Promise<string> {
  const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  const res = await fetch(
    `${fastApiUrl}/api/upload/presign?filename=${encodeURIComponent(file.name)}&content_type=${encodeURIComponent(file.type)}&kind=${kind}`
  );
  if (!res.ok) throw new Error("Failed to get upload URL");
  const { upload_url, public_url } = await res.json();
  const uploadRes = await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!uploadRes.ok) throw new Error("Upload failed");
  return public_url;
}

export async function uploadTeamEventLogo(file: File): Promise<string> {
  return uploadToR2(file, "team_events");
}

export async function uploadTeamEventImage(file: File): Promise<string> {
  return uploadToR2(file, "team_events");
}

export async function patchTeamEvent({
  teamEventId,
  requestingUserId,
  title,
  description,
  status,
  startsAt,
  endsAt,
  submissionMode,
  requiresPhoto,
  imageUrl,
}: {
  teamEventId: string;
  requestingUserId: string;
  title?: string;
  description?: string | null;
  status?: TeamEventStatus;
  startsAt?: string;
  endsAt?: string | null;
  submissionMode?: TeamEventSubmissionMode;
  requiresPhoto?: boolean;
  imageUrl?: string | null;
}): Promise<{ updated: boolean }> {
  return patchJson(`/team-events/${teamEventId}`, {
    requesting_user_id: requestingUserId,
    title,
    description,
    status,
    starts_at: startsAt,
    ends_at: endsAt,
    submission_mode: submissionMode,
    requires_photo: requiresPhoto,
    image_url: imageUrl,
  });
}

export async function updateTeamEventTeam({
  teamEventId,
  teamId,
  requestingUserId,
  name,
  color,
  logoUrl,
}: {
  teamEventId: string;
  teamId: string;
  requestingUserId: string;
  name?: string;
  color?: string | null;
  logoUrl?: string | null;
}): Promise<{ updated: boolean }> {
  return patchJson(`/team-events/${teamEventId}/teams/${teamId}`, {
    requesting_user_id: requestingUserId,
    name: name?.trim(),
    color,
    logo_url: logoUrl,
  });
}

export async function addTeamEventTeam({
  teamEventId,
  requestingUserId,
  name,
  color,
  logoUrl,
}: {
  teamEventId: string;
  requestingUserId: string;
  name: string;
  color?: string | null;
  logoUrl?: string | null;
}): Promise<{ id: string }> {
  return postJson(`/team-events/${teamEventId}/teams`, {
    requesting_user_id: requestingUserId,
    name: name.trim(),
    color: color ?? null,
    logo_url: logoUrl ?? null,
  });
}

export async function joinTeamEvent({
  teamEventId,
  teamId,
  requestingUserId,
  participantType = "user",
  userId,
  groupId,
  representingGroupId,
  cascadeMode,
}: {
  teamEventId: string;
  teamId?: string;
  requestingUserId: string;
  participantType?: "user" | "group";
  userId?: string;
  groupId?: string;
  representingGroupId?: string | null;
  cascadeMode?: CascadeMode;
}): Promise<{ joined: boolean; team_id: string }> {
  return postJson(`/team-events/${teamEventId}/join`, {
    team_id: teamId ?? null,
    participant_type: participantType,
    user_id: userId ?? null,
    group_id: groupId ?? null,
    representing_group_id: representingGroupId ?? null,
    cascade_mode: cascadeMode ?? "cascade_all_members",
    requesting_user_id: requestingUserId,
  });
}

export async function leaveTeamEvent({
  teamEventId,
  requestingUserId,
  groupId,
}: {
  teamEventId: string;
  requestingUserId: string;
  groupId?: string;
}): Promise<{ left: boolean }> {
  const qs = new URLSearchParams({ requesting_user_id: requestingUserId });
  if (groupId) qs.set("group_id", groupId);
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}/leave?${qs}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addTeamEventOrganizer({
  teamEventId,
  requestingUserId,
  userId,
}: {
  teamEventId: string;
  requestingUserId: string;
  userId: string;
}): Promise<{ added: boolean }> {
  return postJson(`/team-events/${teamEventId}/organizers`, {
    requesting_user_id: requestingUserId,
    user_id: userId,
  });
}

export async function removeTeamEventOrganizer({
  teamEventId,
  requestingUserId,
  userId,
}: {
  teamEventId: string;
  requestingUserId: string;
  userId: string;
}): Promise<{ removed: boolean }> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}/organizers/${userId}?requesting_user_id=${requestingUserId}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTeamEventScoreboard(teamEventId: string): Promise<ScoreboardEntry[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}/scoreboard`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ScoreboardEntry[]>;
}

export async function listTeamEventSubmissions({
  teamEventId,
  requestingUserId,
}: {
  teamEventId: string;
  requestingUserId: string;
}): Promise<TeamEventSubmission[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}/submissions?requesting_user_id=${requestingUserId}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<TeamEventSubmission[]>;
}

export async function getMyGroupsForEvent({
  teamEventId,
  userId,
}: {
  teamEventId: string;
  userId: string;
}): Promise<MyGroupForEvent[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}/my-groups?user_id=${userId}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<MyGroupForEvent[]>;
}

export async function canReviewTeamEvent({
  teamEventId,
  userId,
}: {
  teamEventId: string;
  userId: string;
}): Promise<boolean> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}/can-review?user_id=${userId}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return Boolean(data.can_review);
}

export async function getTeamEventStats(teamEventId: string): Promise<TeamEventTeamStats[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}/stats`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<TeamEventTeamStats[]>;
}

export async function patchTeamEventSubmission({
  teamEventId,
  contributionId,
  requestingUserId,
  smallBags,
  largeBags,
  pounds,
  value,
  reviewStatus,
}: {
  teamEventId: string;
  contributionId: string;
  requestingUserId: string;
  smallBags?: number;
  largeBags?: number;
  pounds?: number;
  value?: number;
  reviewStatus?: ReviewStatus;
}): Promise<{ updated: boolean }> {
  return patchJson(`/team-events/${teamEventId}/submissions/${contributionId}`, {
    requesting_user_id: requestingUserId,
    small_bags: smallBags,
    large_bags: largeBags,
    pounds,
    value,
    review_status: reviewStatus,
  });
}

export type StatsInterval = "today" | "week" | "month" | "all";

export type TeamEventLeaderboardIndividual = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  team_id: string;
  team_name: string;
  team_color: string;
  total_value: number;
  submission_count: number;
};

export type TeamEventLeaderboardGroup = {
  group_id: string;
  group_name: string;
  slug: string;
  logo_url: string | null;
  team_id: string;
  team_name: string;
  team_color: string;
  member_count: number;
  total_value: number;
  submission_count: number;
};

export type TeamEventGeoEntry = {
  team_id: string;
  team_name: string;
  team_color: string;
  geo_unit_id: string;
  geo_display_name: string | null;
  unit_type: string;
  total_value: number;
  submission_count: number;
};

export type TeamEventParticipantDetail = {
  type: "user" | "group";
  id: string;
  identity: Record<string, string | null>;
  total_value: number;
  submission_count: number;
  breakdown: { contribution_type: string; total_value: number; submission_count: number }[];
  trend: { bucket_start: string; total_value: number }[];
};

export type TeamEventAdminSummary = {
  total_value: number;
  submission_count: number;
  active_participants: number;
  pending_review_count: number;
  total_participants: number;
  total_groups: number;
  total_teams: number;
  trend: { bucket_start: string; total_value: number; submission_count: number }[];
  breakdown: { contribution_type: string; total_value: number; submission_count: number }[];
  teams: {
    team_id: string;
    name: string;
    color: string;
    participant_count: number;
    total_value: number;
    submission_count: number;
  }[];
  top_contributors: {
    user_id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    total_value: number;
    submission_count: number;
  }[];
};

function intervalParams(interval: StatsInterval, startDate?: string, endDate?: string): string {
  const params = new URLSearchParams({ interval });
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  return params.toString();
}

export async function getTeamEventLeaderboard(args: {
  teamEventId: string;
  scope: "individuals";
  interval?: StatsInterval;
  startDate?: string;
  endDate?: string;
  signal?: AbortSignal;
}): Promise<TeamEventLeaderboardIndividual[]>;
export async function getTeamEventLeaderboard(args: {
  teamEventId: string;
  scope: "groups";
  interval?: StatsInterval;
  startDate?: string;
  endDate?: string;
  signal?: AbortSignal;
}): Promise<TeamEventLeaderboardGroup[]>;
export async function getTeamEventLeaderboard({
  teamEventId,
  scope,
  interval = "all",
  startDate,
  endDate,
  signal,
}: {
  teamEventId: string;
  scope: "individuals" | "groups";
  interval?: StatsInterval;
  startDate?: string;
  endDate?: string;
  signal?: AbortSignal;
}): Promise<TeamEventLeaderboardIndividual[] | TeamEventLeaderboardGroup[]> {
  const qs = intervalParams(interval, startDate, endDate);
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}/leaderboard?scope=${scope}&${qs}`,
    { cache: "no-store", signal }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTeamEventGeo(teamEventId: string, signal?: AbortSignal): Promise<TeamEventGeoEntry[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}/geo`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<TeamEventGeoEntry[]>;
}

export async function getTeamEventParticipantDetail({
  teamEventId,
  type,
  id,
  interval = "all",
  startDate,
  endDate,
  signal,
}: {
  teamEventId: string;
  type: "user" | "group";
  id: string;
  interval?: StatsInterval;
  startDate?: string;
  endDate?: string;
  signal?: AbortSignal;
}): Promise<TeamEventParticipantDetail> {
  const qs = intervalParams(interval, startDate, endDate);
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}/participant-detail?type=${type}&id=${id}&${qs}`,
    { cache: "no-store", signal }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<TeamEventParticipantDetail>;
}

export async function getTeamEventAdminSummary({
  teamEventId,
  interval = "all",
  startDate,
  endDate,
  signal,
}: {
  teamEventId: string;
  interval?: StatsInterval;
  startDate?: string;
  endDate?: string;
  signal?: AbortSignal;
}): Promise<TeamEventAdminSummary> {
  const qs = intervalParams(interval, startDate, endDate);
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${teamEventId}/admin-summary?${qs}`,
    { cache: "no-store", signal }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<TeamEventAdminSummary>;
}
