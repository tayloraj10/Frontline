import { normalizeImageForUpload } from "@/lib/normalizeImage";

export type UploadKind = "contributions" | "groups" | "profiles" | "events" | "partners" | "team_events";

export async function uploadToR2(original: File, kind: UploadKind = "contributions"): Promise<string> {
  const file = await normalizeImageForUpload(original);
  const params = new URLSearchParams({ filename: file.name, content_type: file.type, kind });
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/upload/presign?${params}`,
  );
  if (!res.ok) throw new Error("Failed to get upload URL");
  const { upload_url, public_url } = (await res.json()) as {
    upload_url: string;
    public_url: string;
  };

  const put = await fetch(upload_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error("Photo upload failed");

  return public_url;
}
