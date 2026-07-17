"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Lightbox from "@/components/Lightbox";

type Submission = {
  id: string;
  submitted_at: string | null;
  value: number;
  notes: string | null;
  location_verified: boolean;
  image_urls: string[];
  metrics_small_bags: number | null;
  metrics_large_bags: number | null;
  metrics_pounds: number | null;
  status: string | null;
};

export default function VerificationClient({
  campaignId,
  userId,
  start,
  end,
  displayName,
}: {
  campaignId: string;
  userId: string;
  start: string | null;
  end: string | null;
  displayName: string;
}) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (start) params.set("start", start);
        if (end) params.set("end", end);
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/campaigns/${campaignId}/users/${userId}/contributions/range?${params.toString()}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? "Failed to load submissions");
        setSubmissions(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load submissions");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [campaignId, userId, start, end]);

  const totalValue = submissions.reduce((sum, s) => sum + (s.value || 0), 0);

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 w-full">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">&larr; Back to admin</Link>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-black text-zinc-100">{displayName}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {submissions.length} submission{submissions.length === 1 ? "" : "s"} · {totalValue} total value
          {start && end && (
            <> · {new Date(start).toLocaleDateString()} &ndash; {new Date(end).toLocaleDateString()}</>
          )}
        </p>
      </div>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-4">
        {submissions.map((s) => (
          <div key={s.id} className="border border-zinc-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="text-sm text-zinc-400">
                {s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "Unknown date"}
              </div>
              <div className="text-sm font-semibold text-zinc-100">
                Value: {s.value}
                {!s.location_verified && (
                  <span className="ml-2 text-xs font-normal text-amber-400">location unverified</span>
                )}
              </div>
            </div>
            <div className="mt-2 text-sm text-zinc-400">
              {s.metrics_small_bags != null && <span className="mr-3">Small bags: {s.metrics_small_bags}</span>}
              {s.metrics_large_bags != null && <span className="mr-3">Large bags: {s.metrics_large_bags}</span>}
              {s.metrics_pounds != null && <span>Pounds: {s.metrics_pounds}</span>}
            </div>
            {s.notes && <p className="mt-2 text-sm text-zinc-500 italic">&ldquo;{s.notes}&rdquo;</p>}

            {s.image_urls.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {s.image_urls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt="Cleanup submission"
                    className="h-24 w-24 object-cover rounded-lg cursor-pointer border border-zinc-800 hover:border-emerald-600 transition-colors"
                    onClick={() => setLightbox({ images: s.image_urls, index: i })}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-red-400 font-semibold">No photos attached — cannot be verified visually.</p>
            )}
          </div>
        ))}
      </div>

      {!loading && submissions.length === 0 && !error && (
        <p className="text-sm text-zinc-500">No submissions found in this range.</p>
      )}

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(i) => setLightbox({ ...lightbox, index: i })}
        />
      )}
    </main>
  );
}
