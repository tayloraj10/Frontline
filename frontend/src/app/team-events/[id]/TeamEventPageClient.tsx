"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getTeamEventScoreboard,
  getMyGroupsForEvent,
  canReviewTeamEvent,
  joinTeamEvent,
  leaveTeamEvent,
  type TeamEventDetail,
  type ScoreboardEntry,
  type MyGroupForEvent,
  type CascadeMode,
} from "@/lib/teamEvents";
import { resolveTeamColor } from "@/lib/teamColors";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed?.detail) && typeof parsed.detail[0]?.msg === "string") {
      return parsed.detail[0].msg.replace(/^Value error,\s*/, "");
    }
  } catch {
    // not JSON, fall through
  }
  return err.message || fallback;
}

function formatSchedule(start: string, end: string | null): string {
  const startDate = new Date(start);
  let text = startDate.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (end) {
    text += ` – ${new Date(end).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  }
  return text;
}

export default function TeamEventPageClient({
  initialEvent,
  userId,
  initialViewerTeamId,
  initialViewerRepresentingGroupId,
}: {
  initialEvent: TeamEventDetail;
  userId: string | null;
  initialViewerTeamId: string | null;
  initialViewerRepresentingGroupId: string | null;
}) {
  const [event, setEvent] = useState(initialEvent);
  const [viewerTeamId, setViewerTeamId] = useState(initialViewerTeamId);
  const [viewerRepresentingGroupId, setViewerRepresentingGroupId] = useState(initialViewerRepresentingGroupId);
  const [scoreboard, setScoreboard] = useState<ScoreboardEntry[] | null>(null);
  const [myGroups, setMyGroups] = useState<MyGroupForEvent[] | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [joiningTeamId, setJoiningTeamId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinAs, setJoinAs] = useState<"self" | string>("self");
  const [changingJoin, setChangingJoin] = useState(false);
  const [groupOptInOpen, setGroupOptInOpen] = useState<string | null>(null);
  const [groupOptInTeamId, setGroupOptInTeamId] = useState<string>("");
  const [groupOptInCascade, setGroupOptInCascade] = useState<CascadeMode>("cascade_all_members");
  const [groupOptInSaving, setGroupOptInSaving] = useState(false);
  const [groupLeavingId, setGroupLeavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getTeamEventScoreboard(event.id)
        .then((rows) => {
          if (!cancelled) setScoreboard(rows);
        })
        .catch(() => {
          // scoreboard is a nice-to-have; ignore transient failures
        });
    };
    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [event.id]);

  useEffect(() => {
    if (!userId) return;
    getMyGroupsForEvent({ teamEventId: event.id, userId }).then(setMyGroups).catch(() => setMyGroups([]));
    canReviewTeamEvent({ teamEventId: event.id, userId }).then(setCanReview).catch(() => setCanReview(false));
  }, [event.id, userId]);

  const refreshGroupParticipants = async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/team-events/${event.id}`, { cache: "no-store" });
    if (res.ok) setEvent(await res.json());
    if (userId) getMyGroupsForEvent({ teamEventId: event.id, userId }).then(setMyGroups).catch(() => {});
  };

  const handleJoin = async (teamId: string) => {
    if (!userId) return;
    const representingGroupId = joinAs === "self" ? null : joinAs;
    setJoiningTeamId(teamId);
    setError(null);
    try {
      const result = await joinTeamEvent({
        teamEventId: event.id,
        teamId: representingGroupId ? undefined : teamId,
        requestingUserId: userId,
        userId,
        representingGroupId,
      });
      setViewerTeamId(result.team_id);
      setViewerRepresentingGroupId(representingGroupId);
      setChangingJoin(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to join team"));
    } finally {
      setJoiningTeamId(null);
    }
  };

  const handleLeave = async () => {
    if (!userId) return;
    setLeaving(true);
    setError(null);
    try {
      await leaveTeamEvent({ teamEventId: event.id, requestingUserId: userId });
      setViewerTeamId(null);
      setViewerRepresentingGroupId(null);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to leave event"));
    } finally {
      setLeaving(false);
    }
  };

  const handleGroupOptIn = async (groupId: string) => {
    if (!userId || !groupOptInTeamId) return;
    setGroupOptInSaving(true);
    setError(null);
    try {
      await joinTeamEvent({
        teamEventId: event.id,
        teamId: groupOptInTeamId,
        requestingUserId: userId,
        participantType: "group",
        groupId,
        cascadeMode: groupOptInCascade,
      });
      setGroupOptInOpen(null);
      await refreshGroupParticipants();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to opt group in"));
    } finally {
      setGroupOptInSaving(false);
    }
  };

  const handleGroupLeave = async (groupId: string) => {
    if (!userId) return;
    setGroupLeavingId(groupId);
    setError(null);
    try {
      await leaveTeamEvent({ teamEventId: event.id, requestingUserId: userId, groupId });
      await refreshGroupParticipants();
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to withdraw group"));
    } finally {
      setGroupLeavingId(null);
    }
  };

  const isCancelled = event.status === "cancelled";
  const canJoin = userId && !isCancelled && (event.status === "draft" || event.status === "active");
  const scoreByTeam = new Map((scoreboard ?? []).map((s) => [s.team_id, s]));
  const maxValue = Math.max(1, ...(scoreboard ?? []).map((s) => s.total_value));
  const teamNameById = new Map(event.teams.map((t) => [t.id, t.name]));
  const groupParticipantByGroupId = new Map(event.group_participants.map((g) => [g.group_id, g]));
  const eligibleRepresentGroups = (myGroups ?? []).filter((g) => g.joined_team_id);
  const currentRepresentingGroup = viewerRepresentingGroupId
    ? (myGroups ?? []).find((g) => g.group_id === viewerRepresentingGroupId)
    : null;
  const showJoinFlow = canJoin && (!viewerTeamId || changingJoin);

  return (
    <div className="space-y-6">
      {event.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.image_url}
          alt=""
          className="w-full h-40 sm:h-56 object-cover rounded-xl border border-zinc-800"
        />
      )}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-black text-zinc-100 leading-tight break-words">{event.title}</h1>
          {isCancelled && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-800/60 bg-red-950/30 px-2.5 py-1 text-xs font-semibold text-red-400">
              Cancelled
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm text-zinc-400">{formatSchedule(event.starts_at, event.ends_at)}</p>
        {event.description && <p className="mt-3 text-sm text-zinc-300 leading-relaxed">{event.description}</p>}
        <div className="mt-4 flex gap-2">
          <Link
            href={`/team-events/${event.id}/stats`}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] border border-zinc-800 rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
          >
            📊 Stats
          </Link>
          {canReview && (
            <Link
              href={`/team-events/${event.id}/review`}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-800 active:scale-[0.97] border border-zinc-800 rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
            >
              📋 Review
            </Link>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {userId && myGroups && myGroups.length > 0 && (
        <div className="border border-zinc-800 rounded-xl p-4 space-y-3 shadow-elevation-1">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Your groups</p>
          {myGroups.map((g) => {
            const gp = groupParticipantByGroupId.get(g.group_id);
            return (
              <div key={g.group_id} className="text-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-200">{g.group_name}</span>
                  {gp ? (
                    <span className="text-xs text-zinc-500">
                      Joined {teamNameById.get(gp.team_id) ?? gp.team_id} ·{" "}
                      {gp.cascade_mode === "cascade_all_members" ? "all members" : "opt-in"}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-600">Not in this event</span>
                  )}
                </div>
                {g.is_admin && gp && (
                  <button
                    onClick={() => handleGroupLeave(g.group_id)}
                    disabled={groupLeavingId === g.group_id}
                    className="px-3 py-2 text-xs font-medium text-red-400 border border-red-900/50 bg-red-950/20 hover:bg-red-950/40 active:bg-red-950/40 active:scale-[0.97] disabled:opacity-50 rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
                  >
                    {groupLeavingId === g.group_id ? "Withdrawing…" : "Withdraw group from event"}
                  </button>
                )}
                {g.is_admin && !gp && canJoin && (
                  <div>
                    {groupOptInOpen === g.group_id ? (
                      <div className="space-y-2 border border-zinc-800 rounded-lg p-3">
                        <select
                          value={groupOptInTeamId}
                          onChange={(e) => setGroupOptInTeamId(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-100 text-xs"
                        >
                          <option value="">Choose a team…</option>
                          {event.teams.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <div className="flex gap-3 text-xs text-zinc-400">
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              checked={groupOptInCascade === "cascade_all_members"}
                              onChange={() => setGroupOptInCascade("cascade_all_members")}
                            />
                            All members auto-join
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              checked={groupOptInCascade === "individual_opt_in"}
                              onChange={() => setGroupOptInCascade("individual_opt_in")}
                            />
                            Members opt in themselves
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleGroupOptIn(g.group_id)}
                            disabled={!groupOptInTeamId || groupOptInSaving}
                            className="px-3 py-2 text-xs font-medium bg-sky-500 hover:bg-sky-400 active:bg-sky-400 active:scale-[0.97] disabled:opacity-50 text-sky-950 rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
                          >
                            {groupOptInSaving ? "Joining…" : "Confirm"}
                          </button>
                          <button
                            onClick={() => setGroupOptInOpen(null)}
                            className="px-3 py-2 text-xs font-medium text-zinc-400 border border-zinc-800 hover:bg-zinc-900 active:bg-zinc-900 active:scale-[0.97] rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setGroupOptInOpen(g.group_id);
                          setGroupOptInTeamId("");
                          setGroupOptInCascade("cascade_all_members");
                        }}
                        className="px-3 py-2 text-xs font-medium text-sky-400 border border-sky-900/50 bg-sky-950/20 hover:bg-sky-950/40 active:bg-sky-950/40 active:scale-[0.97] rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
                      >
                        Opt group into event
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showJoinFlow && eligibleRepresentGroups.length > 0 && (
        <div className="border border-zinc-800 rounded-xl p-4 space-y-2 shadow-elevation-1">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Join as</p>
          <div className="flex flex-col gap-1.5 text-sm text-zinc-300">
            <label className="flex items-center gap-2">
              <input type="radio" checked={joinAs === "self"} onChange={() => setJoinAs("self")} />
              Myself, no group attribution
            </label>
            {eligibleRepresentGroups.map((g) => (
              <label key={g.group_id} className="flex items-center gap-2">
                <input type="radio" checked={joinAs === g.group_id} onChange={() => setJoinAs(g.group_id)} />
                Representing {g.group_name} ({teamNameById.get(g.joined_team_id!) ?? g.joined_team_id})
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {event.teams.map((team) => {
          const score = scoreByTeam.get(team.id);
          const isMyTeam = viewerTeamId === team.id;
          const pct = score ? Math.round((score.total_value / maxValue) * 100) : 0;
          const representingSelected = joinAs !== "self";
          return (
            <div
              key={team.id}
              className={`border rounded-xl p-4 space-y-2 shadow-elevation-1 ${
                isMyTeam && !changingJoin ? "border-sky-600 bg-sky-950/20" : "border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  {team.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={team.logo_url}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover shrink-0 border border-zinc-700"
                    />
                  ) : team.color ? (
                    <span
                      className="inline-block w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: resolveTeamColor(team.color) }}
                    />
                  ) : null}
                  {team.name}
                  {isMyTeam && !changingJoin && (
                    <span className="text-[10px] font-semibold text-sky-400 bg-sky-400/10 border border-sky-400/30 rounded px-1.5 py-0.5">
                      Your team
                    </span>
                  )}
                </span>
                <span className="text-sm font-black text-zinc-100">
                  {(score?.total_value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} pts
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
                <div
                  className="h-full bg-sky-500 transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {showJoinFlow && !representingSelected && (!isMyTeam || changingJoin) && (
                <button
                  onClick={() => handleJoin(team.id)}
                  disabled={joiningTeamId !== null}
                  className="w-full mt-1 px-3 py-2 text-sm font-medium bg-sky-500 hover:bg-sky-400 active:bg-sky-400 active:scale-[0.97] disabled:opacity-50 text-sky-950 rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
                >
                  {joiningTeamId === team.id ? "Joining…" : isMyTeam ? `Stay on ${team.name}` : `Join ${team.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showJoinFlow && joinAs !== "self" && (
        <button
          onClick={() => handleJoin(eligibleRepresentGroups.find((g) => g.group_id === joinAs)?.joined_team_id ?? "")}
          disabled={joiningTeamId !== null}
          className="w-full px-3 py-2.5 text-sm font-medium bg-sky-500 hover:bg-sky-400 active:scale-[0.97] disabled:opacity-50 text-sky-950 rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
        >
          {joiningTeamId !== null
            ? "Joining…"
            : `Join representing ${eligibleRepresentGroups.find((g) => g.group_id === joinAs)?.group_name ?? "group"}`}
        </button>
      )}

      {!userId && !isCancelled && (
        <Link
          href={`/login?next=/team-events/${event.id}`}
          className="block text-center px-4 py-2.5 bg-sky-500 hover:bg-sky-400 active:bg-sky-400 active:scale-[0.97] text-sky-950 text-sm font-semibold rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
        >
          Log in to join a team
        </Link>
      )}

      {userId && viewerTeamId && !isCancelled && !changingJoin && (
        <div className="border border-zinc-800 rounded-xl p-4 text-center space-y-1.5 shadow-elevation-1">
          <p className="text-sm font-semibold text-zinc-200">
            You&apos;re in{currentRepresentingGroup ? `, representing ${currentRepresentingGroup.group_name}` : " as yourself"}!
          </p>
          {event.status === "active" && (
            <p className="text-xs text-zinc-500 max-w-xs mx-auto">
              {event.submission_mode === "manual_opt_in"
                ? "Log a cleanup as usual and check the box to attribute it to this event."
                : "Cleanups you log while this event is active will count toward your team automatically."}
            </p>
          )}
          <div className="flex items-center justify-center gap-2">
            {canJoin && (eligibleRepresentGroups.length > 0 || currentRepresentingGroup) && (
              <button
                onClick={() => {
                  setJoinAs(currentRepresentingGroup ? currentRepresentingGroup.group_id : "self");
                  setChangingJoin(true);
                }}
                className="px-3 py-2 text-xs font-medium text-sky-400 border border-sky-900/50 bg-sky-950/20 hover:bg-sky-950/40 active:bg-sky-950/40 active:scale-[0.97] rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
              >
                {currentRepresentingGroup ? "Switch to myself" : "Switch to a group"}
              </button>
            )}
            <button
              onClick={handleLeave}
              disabled={leaving}
              className="px-3 py-2 text-xs font-medium text-red-400 border border-red-900/50 bg-red-950/20 hover:bg-red-950/40 active:bg-red-950/40 active:scale-[0.97] disabled:opacity-50 rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
            >
              {leaving ? "Leaving…" : "Leave this event"}
            </button>
          </div>
        </div>
      )}
      {changingJoin && (
        <button
          onClick={() => setChangingJoin(false)}
          className="w-full px-3 py-2 text-xs font-medium text-zinc-400 border border-zinc-800 hover:bg-zinc-900 active:bg-zinc-900 active:scale-[0.97] rounded-lg transition-[background-color,transform] duration-150 touch-manipulation"
        >
          Cancel change
        </button>
      )}
    </div>
  );
}
