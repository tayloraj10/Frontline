"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import PhotoGallery, { type GalleryPhoto } from "@/components/marketplace/PhotoGallery";
import { uploadToR2 } from "@/lib/uploadToR2";
import { getPosition } from "@/lib/getPosition";

interface Mine {
  claim_id: string;
  sponsorship_id: string;
  label: string;
  amount_cents: number;
  photos: GalleryPhoto[];
}

const usd = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);

async function fail(res: Response, fallback: string): Promise<never> {
  let msg = fallback;
  try {
    const p = JSON.parse(await res.text());
    if (typeof p?.detail === "string") msg = p.detail;
  } catch {
    // not JSON
  }
  throw new Error(msg);
}

/** Cleanups you submitted that an admin has not reviewed yet. Add photos here if they ask for more. */
export default function AwaitingReview() {
  const [items, setItems] = useState<Mine[]>([]);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sponsored/claims/mine", { cache: "no-store" });
      if (res.ok) setItems(await res.json());
    } catch {
      // panel is optional
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (items.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      <h2 className="text-sm font-bold text-zinc-100">Waiting for review</h2>
      <p className="text-xs text-zinc-400">If an admin asks for more photos, add them here. They are marked as added later.</p>
      {items.map((it) => (
        <Card key={it.claim_id} className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/earn/sites/${it.sponsorship_id}`} className="text-sm font-bold text-zinc-100 hover:underline">
              {it.label}
            </Link>
            <span className="text-sm text-zinc-300">{usd(it.amount_cents)}</span>
          </div>
          <PhotoGallery
            photos={it.photos}
            canEdit
            onAdd={async (kind, file) => {
              const pos = await getPosition().catch(() => null);
              const url = await uploadToR2(file);
              const res = await fetch(`/api/sponsored/${it.sponsorship_id}/claim/photos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, photo_url: url, latitude: pos?.coords.latitude, longitude: pos?.coords.longitude }),
              });
              if (!res.ok) await fail(res, "Could not add the photo");
              await load();
            }}
            onRemove={async (pid) => {
              const res = await fetch(`/api/sponsored/${it.sponsorship_id}/claim/photos/${pid}`, { method: "DELETE" });
              if (!res.ok) await fail(res, "Could not remove the photo");
              await load();
            }}
          />
        </Card>
      ))}
    </div>
  );
}
