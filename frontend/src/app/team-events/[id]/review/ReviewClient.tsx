"use client";

import { useEffect, useState } from "react";
import {
  canReviewTeamEvent,
  listTeamEventSubmissions,
  patchTeamEventSubmission,
  type TeamEventSubmission,
  type TeamEventTeam,
  type ReviewStatus,
} from "@/lib/teamEvents";

const REVIEW_STATUSES: ReviewStatus[] = ["pending", "approved", "flagged"];

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

const inputCls = "bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-100 text-xs";

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

  const handlePatch = async (s: TeamEventSubmission, patch: Partial<Pick<TeamEventSubmission, "value" | "review_status">>) => {
    if (!userId) return;
    setSavingId(s.id);
    setSubmissionsError(null);
    try {
      await patchTeamEventSubmission({
        teamEventId,
        contributionId: s.id,
        requestingUserId: userId,
        value: patch.value ?? undefined,
        reviewStatus: patch.review_status ?? undefined,
      });
      setSubmissions((prev) => prev?.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) ?? null);
    } catch (err) {
      setSubmissionsError(extractErrorMessage(err, "Failed to update submission"));
    } finally {
      setSavingId(null);
    }
  };

  if (allowed === null) return <p className="text-sm text-zinc-500">Loading...</p>;

  if (!allowed) {
    return <p className="text-sm text-red-400">You don&apos;t have permission to review this event.</p>;
  }

  return (
    <div className="border border-zinc-800 rounded-xl p-4 space-y-3 shadow-elevation-1">
      {submissionsError && <p className="text-sm text-red-400">{submissionsError}</p>}
      {!submissions ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-zinc-500">No submissions yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-800">
                <th className="py-2 pr-3 font-medium">Team</th>
                <th className="py-2 pr-3 font-medium">Value</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id} className="border-b border-zinc-900">
                  <td className="py-2 pr-3">{s.team_id ? teamNameById.get(s.team_id) ?? "Unknown" : "Unknown"}</td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      className={`${inputCls} w-24`}
                      defaultValue={s.value ?? 0}
                      disabled={savingId === s.id}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== s.value) handlePatch(s, { value: v });
                      }}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className={inputCls}
                      value={s.review_status ?? "pending"}
                      disabled={savingId === s.id}
                      onChange={(e) => handlePatch(s, { review_status: e.target.value as ReviewStatus })}
                    >
                      {REVIEW_STATUSES.map((rs) => (
                        <option key={rs} value={rs}>
                          {rs}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3 text-zinc-500">{new Date(s.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
