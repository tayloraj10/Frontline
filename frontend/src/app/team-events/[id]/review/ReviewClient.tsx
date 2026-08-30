"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  canReviewTeamEvent,
  deleteTeamEventSubmission,
  listTeamEventSubmissions,
  patchTeamEventSubmission,
  type TeamEventSubmission,
  type TeamEventTeam,
} from "@/lib/teamEvents";

const MiniMapPreview = dynamic(() => import("@/components/map/MiniMapPreview"), {
  ssr: false,
  loading: () => <div className="w-full h-[280px] rounded-lg bg-zinc-800 animate-pulse" />,
});

const RoutePreviewMap = dynamic(() => import("@/components/map/RoutePreviewMap"), {
  ssr: false,
  loading: () => <div className="w-full h-[280px] rounded-lg bg-zinc-800 animate-pulse" />,
});

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // not JSON
  }
  return err.message || fallback;
}

const inputCls = "bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-100 text-sm";

type EditableFields = { value: number | null; small_bags: number | null; large_bags: number | null; pounds: number | null };

export default function ReviewClient({
  teamEventId,
  userId,
  teams,
}: {
  teamEventId: string;
  userId: string | null;
  teams: TeamEventTeam[];
}) {
  const [allowed, setAllowed] = useState<boolean | null>(userId ? null : false);
  const [submissions, setSubmissions] = useState<TeamEventSubmission[] | null>(null);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<EditableFields>({ value: null, small_bags: null, large_bags: null, pounds: null });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mapSubmission, setMapSubmission] = useState<TeamEventSubmission | null>(null);

  useEffect(() => {
    if (!userId) return;
    canReviewTeamEvent({ teamEventId, userId }).then(setAllowed).catch(() => setAllowed(false));
  }, [teamEventId, userId]);

  useEffect(() => {
    if (!allowed || !userId) return;
    listTeamEventSubmissions({ teamEventId, requestingUserId: userId })
      .then(setSubmissions)
      .catch((err) => setSubmissionsError(extractErrorMessage(err, "Failed to load submissions")));
  }, [allowed, teamEventId, userId]);

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  const startEdit = (s: TeamEventSubmission) => {
    setEditingId(s.id);
    setEditFields({ value: s.value, small_bags: s.small_bags, large_bags: s.large_bags, pounds: s.pounds });
  };

  const saveEdit = async (s: TeamEventSubmission) => {
    if (!userId) return;
    setSavingId(s.id);
    setSubmissionsError(null);
    try {
      await patchTeamEventSubmission({
        teamEventId,
        contributionId: s.id,
        requestingUserId: userId,
        value: editFields.value ?? undefined,
        smallBags: editFields.small_bags ?? undefined,
        largeBags: editFields.large_bags ?? undefined,
        pounds: editFields.pounds ?? undefined,
      });
      setSubmissions((prev) => prev?.map((x) => (x.id === s.id ? { ...x, ...editFields } : x)) ?? null);
      setEditingId(null);
    } catch (err) {
      setSubmissionsError(extractErrorMessage(err, "Failed to update submission"));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (s: TeamEventSubmission) => {
    if (!userId) return;
    setSavingId(s.id);
    setSubmissionsError(null);
    try {
      await deleteTeamEventSubmission({ teamEventId, contributionId: s.id, requestingUserId: userId });
      setSubmissions((prev) => prev?.filter((x) => x.id !== s.id) ?? null);
      setConfirmDeleteId(null);
    } catch (err) {
      setSubmissionsError(extractErrorMessage(err, "Failed to delete submission"));
    } finally {
      setSavingId(null);
    }
  };

  if (allowed === null) return <p className="text-sm text-zinc-500">Loading...</p>;

  if (!allowed) {
    return <p className="text-sm text-red-400">You don&apos;t have permission to review this event.</p>;
  }

  return (
    <div className="space-y-3">
      {submissionsError && <p className="text-sm text-red-400">{submissionsError}</p>}
      {!submissions ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-zinc-500">No submissions yet.</p>
      ) : (
        submissions.map((s) => {
          const isEditing = editingId === s.id;
          const isSaving = savingId === s.id;
          const submitterLabel = s.display_name || s.username || "Unknown submitter";
          const images = Array.from(new Set([s.photo_url, ...(s.image_urls ?? [])].filter((u): u is string => Boolean(u))));

          return (
            <div key={s.id} className="border border-zinc-800 rounded-xl p-4 space-y-3 shadow-elevation-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{submitterLabel}</p>
                  <p className="text-xs text-zinc-500">
                    {s.team_id ? teamNameById.get(s.team_id) ?? s.team_name ?? "No team" : "No team"}
                    {" · "}
                    {s.representing_group_name ? `Representing ${s.representing_group_name}` : "Individual participant"}
                    {" · "}
                    {s.contribution_type}
                    {" · "}
                    {new Date(s.created_at).toLocaleString()}
                  </p>
                </div>
                {!isEditing && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(s)}
                      disabled={isSaving}
                      className="px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-150"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(s.id)}
                      disabled={isSaving}
                      className="px-2.5 py-1.5 rounded-lg border border-red-900/50 text-red-400 text-xs hover:bg-red-950/40 transition-colors duration-150"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="Submission" className="w-28 h-28 object-cover rounded-lg border border-zinc-800" />
                  ))}
                </div>
              )}

              {isEditing ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <label className="text-xs text-zinc-500 space-y-1">
                    Value
                    <input
                      type="number"
                      className={`${inputCls} w-full`}
                      value={editFields.value ?? ""}
                      onChange={(e) => setEditFields((f) => ({ ...f, value: e.target.value === "" ? null : Number(e.target.value) }))}
                    />
                  </label>
                  <label className="text-xs text-zinc-500 space-y-1">
                    Small bags
                    <input
                      type="number"
                      className={`${inputCls} w-full`}
                      value={editFields.small_bags ?? ""}
                      onChange={(e) => setEditFields((f) => ({ ...f, small_bags: e.target.value === "" ? null : Number(e.target.value) }))}
                    />
                  </label>
                  <label className="text-xs text-zinc-500 space-y-1">
                    Large bags
                    <input
                      type="number"
                      className={`${inputCls} w-full`}
                      value={editFields.large_bags ?? ""}
                      onChange={(e) => setEditFields((f) => ({ ...f, large_bags: e.target.value === "" ? null : Number(e.target.value) }))}
                    />
                  </label>
                  <label className="text-xs text-zinc-500 space-y-1">
                    Pounds
                    <input
                      type="number"
                      className={`${inputCls} w-full`}
                      value={editFields.pounds ?? ""}
                      onChange={(e) => setEditFields((f) => ({ ...f, pounds: e.target.value === "" ? null : Number(e.target.value) }))}
                    />
                  </label>
                  <div className="col-span-2 sm:col-span-4 flex gap-2">
                    <button
                      onClick={() => saveEdit(s)}
                      disabled={isSaving}
                      className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs hover:bg-emerald-600 transition-colors duration-150"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      disabled={isSaving}
                      className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-150"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-300">
                  <span>Value: <span className="text-zinc-100">{s.value ?? "—"}</span></span>
                  {s.small_bags != null && <span>Small bags: <span className="text-zinc-100">{s.small_bags}</span></span>}
                  {s.large_bags != null && <span>Large bags: <span className="text-zinc-100">{s.large_bags}</span></span>}
                  {s.pounds != null && <span>Pounds: <span className="text-zinc-100">{s.pounds}</span></span>}
                </div>
              )}

              {(s.description || s.notes) && (
                <p className="text-sm text-zinc-400">{s.description || s.notes}</p>
              )}

              {(s.route || (s.lat != null && s.lng != null)) && (
                <button
                  onClick={() => setMapSubmission(s)}
                  className="text-xs text-zinc-500 hover:text-emerald-400 underline decoration-dotted transition-colors duration-150"
                >
                  {s.route ? "View route" : `Location: ${s.lat!.toFixed(5)}, ${s.lng!.toFixed(5)}`}
                </button>
              )}

              {confirmDeleteId === s.id && (
                <div className="flex items-center gap-3 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-300">Delete this submission permanently? This can&apos;t be undone.</p>
                  <button
                    onClick={() => handleDelete(s)}
                    disabled={isSaving}
                    className="px-2.5 py-1 rounded-lg bg-red-700 text-white text-xs hover:bg-red-600 transition-colors duration-150"
                  >
                    Confirm delete
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={isSaving}
                    className="px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors duration-150"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      {mapSubmission && (mapSubmission.route || (mapSubmission.lat != null && mapSubmission.lng != null)) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setMapSubmission(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 w-full max-w-md space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-100">{mapSubmission.route ? "Submission route" : "Submission location"}</p>
              <button
                onClick={() => setMapSubmission(null)}
                className="text-zinc-500 hover:text-zinc-300 text-sm"
              >
                Close
              </button>
            </div>
            {mapSubmission.route ? (
              <RoutePreviewMap
                coordinates={mapSubmission.route.coordinates}
                photos={mapSubmission.route_photos}
                heightClassName="h-[280px]"
                interactive
              />
            ) : (
              <>
                <MiniMapPreview lat={mapSubmission.lat!} lng={mapSubmission.lng!} heightClassName="h-[280px]" interactive />
                <p className="text-xs text-zinc-500">
                  {mapSubmission.lat!.toFixed(5)}, {mapSubmission.lng!.toFixed(5)}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
