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
