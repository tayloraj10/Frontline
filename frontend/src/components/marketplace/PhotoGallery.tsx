"use client";

import { useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { usePhotoViewer } from "@/components/marketplace/usePhotoViewer";

export type GalleryPhoto = {
  id: string;
  kind: string;
  url: string;
  /** Added after the work was submitted. */
  late?: boolean;
  /** Removed by the person who took it. Kept so reviewers can see it. */
  deleted_at?: string | null;
};

/**
 * Before and after galleries for a job or sponsored site. Every photo says whether it is an original,
 * was added later (after the work was submitted), or was removed. The person who did the work can add
 * more and remove their own while `canEdit` is on.
 */
export default function PhotoGallery({
  photos,
  canEdit = false,
  onAdd,
  onRemove,
  addHint,
  addKinds = ["before", "after"],
}: {
  photos: GalleryPhoto[];
  canEdit?: boolean;
  onAdd?: (kind: "before" | "after", file: File) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
  addHint?: string;
  addKinds?: Array<"before" | "after">;
}) {
  const before = photos.filter((p) => p.kind === "before");
  const after = photos.filter((p) => p.kind === "after");
  const all = [...before, ...after];
  const { open, viewer } = usePhotoViewer(all.map((p) => p.url));
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const flagged = all.some((p) => p.late || p.deleted_at);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const Group = ({ title, kind, list, offset }: { title: string; kind: "before" | "after"; list: GalleryPhoto[]; offset: number }) => (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
        {title} ({list.filter((p) => !p.deleted_at).length})
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-zinc-500">No {kind} photos.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {list.map((p, i) => {
            const removed = !!p.deleted_at;
            return (
              <li key={p.id} className="relative overflow-hidden rounded-xl bg-zinc-900">
                <button type="button" onClick={() => open(offset + i)} aria-label="Enlarge photo" className="block w-full touch-manipulation">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={`${kind} photo`} className={`aspect-square w-full object-cover ${removed ? "opacity-40 grayscale" : ""}`} />
                </button>
                <span
                  className={`pointer-events-none absolute left-1 top-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    removed ? "bg-red-500 text-white" : p.late ? "bg-amber-400 text-amber-950" : "bg-black/60 text-zinc-100"
                  }`}
                >
                  {removed ? "Removed" : p.late ? "Added later" : "Original"}
                </span>
                {canEdit && !removed && onRemove && (
                  <button
                    type="button"
                    aria-label="Remove photo"
                    disabled={busy !== null}
                    onClick={() => run(p.id, () => onRemove(p.id))}
                    className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-zinc-100 touch-manipulation active:scale-95 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && onAdd && addKinds.includes(kind) && (
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl bg-zinc-800 px-4 text-sm font-bold text-zinc-100 touch-manipulation hover:bg-zinc-700 active:scale-[0.97]">
          <Camera className="h-4 w-4" aria-hidden="true" />
          {busy === `add-${kind}` ? "Uploading..." : `Add ${kind} photos`}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={busy !== null}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length)
                void run(`add-${kind}`, async () => {
                  for (const f of files) await onAdd(kind, f);
                });
            }}
          />
        </label>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Group title="Before" kind="before" list={before} offset={0} />
      <Group title="After" kind="after" list={after} offset={before.length} />
      {canEdit && addHint && <p className="text-xs text-zinc-500">{addHint}</p>}
      {flagged && (
        <p className="text-xs text-zinc-500">
          Original photos were taken during the work. Added later photos were added after it was submitted. Removed photos are kept so reviewers can still see them.
        </p>
      )}
      {problem && <p className="text-sm text-red-300">{problem}</p>}
      {viewer}
    </div>
  );
}
