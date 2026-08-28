import { createClient } from "@/lib/supabase/client";
import type { SelectedArea } from "@/app/admin/EventAreaMapPicker";
import type { Json } from "@/types/database";

export type CreatedEvent = {
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
};

export async function uploadEventImage(file: File): Promise<string> {
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
}

export async function createTimedEvent({
  campaignId,
  title,
  description,
  imageFile,
  areas,
  multiplier,
  durationMinutes,
  startedAt,
}: {
  campaignId: string;
  title: string;
  description: string;
  imageFile: File | null;
  areas: SelectedArea[];
  multiplier: number;
  durationMinutes: number;
  /** ISO timestamp; omit/null to start immediately (DB defaults to now()). */
  startedAt?: string | null;
}): Promise<CreatedEvent> {
  const supabase = createClient();

  let imageUrl: string | null = null;
  if (imageFile) imageUrl = await uploadEventImage(imageFile);

  const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
  const endsAt = durationMinutes > 0
    ? new Date(startMs + durationMinutes * 60_000).toISOString()
    : null;

  const { data, error: insertErr } = await supabase
    .schema("public")
    .from("campaign_events")
    .insert({
      campaign_id: campaignId,
      geo_unit_id: areas[0]?.geoUnitId ?? null,
      event_type: "timed_event",
      title: title.trim(),
      description: description.trim() || null,
      image_url: imageUrl,
      effect_config: { type: "score_multiplier", multiplier },
      status: "active",
      ...(startedAt ? { started_at: startedAt } : {}),
      ends_at: endsAt,
    })
    .select("id, event_type, title, description, image_url, effect_config, status, started_at, ends_at, campaign_id")
    .single();

  if (insertErr) throw new Error(insertErr.message);

  if (areas.length > 0) {
    const { error: linkErr } = await supabase
      .schema("public")
      .from("campaign_event_geo_units")
      .insert(areas.map(a => ({ event_id: data.id, geo_unit_id: a.geoUnitId })));
    if (linkErr) throw new Error(`Event created, but failed to link areas: ${linkErr.message}`);
  }

  return data as CreatedEvent;
}

export type BonusSpot = {
  id: string;
  title: string;
  description: string | null;
  effect_config: Json | null;
  status: string;
  started_at: string | null;
  ends_at: string | null;
  radius_m: number;
  lat: number;
  lng: number;
  campaign_id: string;
};

export type BonusSpotSuggestion =
  | { found: false }
  | {
      found: true;
      report_id: string;
      lat: number;
      lng: number;
      severity: string;
      reported_at: string | null;
      nearby_report_count: number;
      near_partner: boolean;
    };

export async function createBonusSpot({
  campaignId,
  viewerUserId,
  lat,
  lng,
  radiusM,
  durationMinutes,
  multiplier,
  description,
  sourceProblemReportId,
}: {
  campaignId: string;
  viewerUserId: string;
  lat: number;
  lng: number;
  radiusM?: number;
  durationMinutes?: number;
  multiplier?: number;
  description?: string;
  sourceProblemReportId?: string;
}): Promise<BonusSpot> {
  const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  const res = await fetch(`${fastApiUrl}/api/events/campaign/${campaignId}/bonus-spot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      viewer_user_id: viewerUserId,
      lat,
      lng,
      radius_m: radiusM,
      duration_minutes: durationMinutes,
      multiplier,
      description,
      source_problem_report_id: sourceProblemReportId,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || "Failed to create bonus spot");
  }
  return res.json();
}

export async function suggestBonusSpot({
  campaignId,
  viewerUserId,
  excludeReportId,
}: {
  campaignId: string;
  viewerUserId: string;
  excludeReportId?: string;
}): Promise<BonusSpotSuggestion> {
  const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  const params = new URLSearchParams({ viewer_user_id: viewerUserId });
  if (excludeReportId) params.set("exclude_report_id", excludeReportId);
  const res = await fetch(`${fastApiUrl}/api/events/campaign/${campaignId}/bonus-spot/suggest?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || "Failed to suggest a bonus spot");
  }
  return res.json();
}

export type MapContextPoint = {
  id: string;
  kind: "cleanup" | "trash_report" | "partner";
  lat: number;
  lng: number;
  label: string | null;
};

export async function fetchMapContext(campaignId: string): Promise<MapContextPoint[]> {
  const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  const res = await fetch(`${fastApiUrl}/api/events/campaign/${campaignId}/map-context`);
  if (!res.ok) throw new Error("Failed to load map context");
  const data = await res.json();
  return data.points;
}

export async function updateEvent({
  eventId,
  title,
  description,
  imageFile,
  multiplier,
  endsAt,
}: {
  eventId: string;
  title: string;
  description: string;
  imageFile: File | null;
  multiplier: number | null;
  endsAt: string | null;
}): Promise<CreatedEvent> {
  const supabase = createClient();

  let imageUrl: string | undefined;
  if (imageFile) imageUrl = await uploadEventImage(imageFile);

  const update: Record<string, unknown> = {
    title: title.trim(),
    description: description.trim() || null,
    ends_at: endsAt,
  };
  if (imageUrl !== undefined) update.image_url = imageUrl;
  if (multiplier !== null) update.effect_config = { type: "score_multiplier", multiplier };

  const { data, error } = await supabase
    .schema("public")
    .from("campaign_events")
    .update(update)
    .eq("id", eventId)
    .select("id, event_type, title, description, image_url, effect_config, status, started_at, ends_at, campaign_id")
    .single();

  if (error) throw new Error(error.message);
  return data as CreatedEvent;
}
