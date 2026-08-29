"use client";

import { useEffect, useRef, useState } from "react";
import {
  patchTeamEvent,
  addTeamEventOrganizer,
  removeTeamEventOrganizer,
  listTeamEventSubmissions,
  patchTeamEventSubmission,
  updateTeamEventTeam,
  addTeamEventTeam,
  uploadTeamEventLogo,
  uploadTeamEventImage,
  type TeamEventDetail,
  type TeamEventOrganizer,
  type TeamEventStatus,
  type TeamEventSubmissionMode,
  type TeamEventSubmission,
  type ReviewStatus,
} from "@/lib/teamEvents";
import { resolveTeamColor, TEAM_COLORS } from "@/lib/teamColors";

type UserSearchResult = { id: string; username: string | null; email: string };

const inputCls = "min-h-11 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-emerald-600 transition-colors duration-150";
const dateInputCls = `${inputCls} [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70`;
const labelCls = "block text-sm font-medium text-zinc-400 mb-1.5";
const cardCls = "rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-elevation-1 p-5 space-y-4";
const sectionTitleCls = "text-xs font-bold text-zinc-500 uppercase tracking-wider";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // not JSON
  }
  return fallback;
}

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUSES: TeamEventStatus[] = ["draft", "active", "completed", "cancelled"];
const REVIEW_STATUSES: ReviewStatus[] = ["pending", "approved", "flagged"];

const STATUS_BADGE: Record<TeamEventStatus, string> = {
  active: "bg-emerald-900/60 text-emerald-400 border-emerald-800",
  draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
  completed: "bg-zinc-800 text-zinc-400 border-zinc-700",
  cancelled: "bg-red-900/60 text-red-400 border-red-800",
};

export default function EditTeamEventView({
  event,
  requestingUserId,
  isAdmin,
}: {
  event: TeamEventDetail;
  requestingUserId: string;
  isAdmin: boolean;
}) {
  const [status, setStatus] = useState(event.status);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [startsAt, setStartsAt] = useState(toLocalDateTimeInput(event.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalDateTimeInput(event.ends_at));
  const [submissionMode, setSubmissionMode] = useState<TeamEventSubmissionMode>(event.submission_mode);
  const [requiresPhoto, setRequiresPhoto] = useState(event.requires_photo);
  const [imageUrl, setImageUrl] = useState(event.image_url);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);

  const [teams, setTeams] = useState(
    event.teams.map((t) => ({ ...t, logoFile: null as File | null, logoPreview: null as string | null }))
  );
  const [teamSavingId, setTeamSavingId] = useState<string | null>(null);
  const [teamErrors, setTeamErrors] = useState<Record<string, string>>({});
  const teamLogoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamColor, setNewTeamColor] = useState(TEAM_COLORS[0].value);
  const [newTeamLogoFile, setNewTeamLogoFile] = useState<File | null>(null);
  const [newTeamLogoPreview, setNewTeamLogoPreview] = useState<string | null>(null);
  const [addingTeam, setAddingTeam] = useState(false);
  const [addTeamError, setAddTeamError] = useState<string | null>(null);
  const newTeamLogoInputRef = useRef<HTMLInputElement | null>(null);

  const [organizers, setOrganizers] = useState<TeamEventOrganizer[]>(event.organizers);
  const [organizerQuery, setOrganizerQuery] = useState("");
  const [organizerResults, setOrganizerResults] = useState<UserSearchResult[]>([]);
  const [organizerSearching, setOrganizerSearching] = useState(false);
  const [organizerError, setOrganizerError] = useState<string | null>(null);

  const [submissions, setSubmissions] = useState<TeamEventSubmission[] | null>(null);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    listTeamEventSubmissions({ teamEventId: event.id, requestingUserId })
      .then(setSubmissions)
      .catch((err) => setSubmissionsError(extractErrorMessage(err, "Failed to load submissions")));
  }, [event.id, requestingUserId]);

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  const handleStatusChange = async (next: TeamEventStatus) => {
    setStatusSaving(true);
    setStatusError(null);
    try {
      await patchTeamEvent({ teamEventId: event.id, requestingUserId, status: next });
      setStatus(next);
    } catch (err) {
      setStatusError(extractErrorMessage(err, "Failed to update status"));
    } finally {
      setStatusSaving(false);
    }
  };

  const handleSaveDetails = async () => {
    setDetailsSaving(true);
    setDetailsError(null);
    setDetailsSaved(false);
    try {
      const nextImageUrl = imageFile ? await uploadTeamEventImage(imageFile) : imageUrl;
      await patchTeamEvent({
        teamEventId: event.id,
        requestingUserId,
        title,
        description,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        submissionMode,
        requiresPhoto,
        imageUrl: nextImageUrl,
      });
      setImageUrl(nextImageUrl);
      setImageFile(null);
      setImagePreview(null);
      setDetailsSaved(true);
    } catch (err) {
      setDetailsError(extractErrorMessage(err, "Failed to save details"));
    } finally {
      setDetailsSaving(false);
    }
  };

  const updateTeamDraft = (id: string, fields: Partial<{ name: string; color: string | null }>) => {
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));
  };

  const updateTeamLogoFile = (id: string, file: File | null) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === id ? { ...t, logoFile: file, logoPreview: file ? URL.createObjectURL(file) : null } : t))
    );
  };

  const handleSaveTeam = async (id: string) => {
    const team = teams.find((t) => t.id === id);
    if (!team) return;
    setTeamSavingId(id);
    setTeamErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const logoUrl = team.logoFile ? await uploadTeamEventLogo(team.logoFile) : team.logo_url;
      await updateTeamEventTeam({
        teamEventId: event.id,
        teamId: id,
        requestingUserId,
        name: team.name,
        color: team.color,
        logoUrl,
      });
      setTeams((prev) =>
        prev.map((t) => (t.id === id ? { ...t, logo_url: logoUrl, logoFile: null, logoPreview: null } : t))
      );
    } catch (err) {
      setTeamErrors((prev) => ({ ...prev, [id]: extractErrorMessage(err, "Failed to save team") }));
    } finally {
      setTeamSavingId(null);
    }
  };

  const handleAddTeam = async () => {
    if (!newTeamName.trim() || addingTeam) return;
    setAddingTeam(true);
    setAddTeamError(null);
    try {
      const logoUrl = newTeamLogoFile ? await uploadTeamEventLogo(newTeamLogoFile) : null;
      const created = await addTeamEventTeam({
        teamEventId: event.id,
        requestingUserId,
        name: newTeamName,
        color: newTeamColor,
        logoUrl,
      });
      setTeams((prev) => [
        ...prev,
        { id: created.id, name: newTeamName.trim(), color: newTeamColor, logo_url: logoUrl, has_boundary: false, logoFile: null, logoPreview: null },
      ]);
      setNewTeamName("");
      setNewTeamColor(TEAM_COLORS[(teams.length + 1) % TEAM_COLORS.length].value);
      setNewTeamLogoFile(null);
      setNewTeamLogoPreview(null);
    } catch (err) {
      setAddTeamError(extractErrorMessage(err, "Failed to add team"));
    } finally {
      setAddingTeam(false);
    }
  };

  useEffect(() => {
    if (organizerQuery.trim().length < 2) {
      setOrganizerResults([]);
      return;
    }
    setOrganizerSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(organizerQuery.trim())}`);
        setOrganizerSearching(false);
        if (res.ok) {
          setOrganizerError(null);
          setOrganizerResults(await res.json());
        } else {
          const body = await res.json().catch(() => null);
          setOrganizerError(body?.detail ?? "User search failed");
          setOrganizerResults([]);
        }
      } catch {
        setOrganizerSearching(false);
        setOrganizerError("User search failed");
        setOrganizerResults([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [organizerQuery]);

  const handleAddOrganizer = async (user: UserSearchResult) => {
    setOrganizerError(null);
    try {
      await addTeamEventOrganizer({ teamEventId: event.id, requestingUserId, userId: user.id });
      setOrganizers((prev) => [...prev, { user_id: user.id, username: user.username, email: user.email }]);
      setOrganizerQuery("");
      setOrganizerResults([]);
    } catch (err) {
      setOrganizerError(extractErrorMessage(err, "Failed to add organizer"));
    }
  };

  const handleRemoveOrganizer = async (userId: string) => {
    setOrganizerError(null);
    try {
      await removeTeamEventOrganizer({ teamEventId: event.id, requestingUserId, userId });
      setOrganizers((prev) => prev.filter((o) => o.user_id !== userId));
    } catch (err) {
      setOrganizerError(extractErrorMessage(err, "Failed to remove organizer"));
    }
  };

  const handlePatchSubmission = async (sub: TeamEventSubmission, fields: Partial<TeamEventSubmission>) => {
    setSavingId(sub.id);
    try {
      await patchTeamEventSubmission({
        teamEventId: event.id,
        contributionId: sub.id,
        requestingUserId,
        smallBags: fields.small_bags ?? undefined,
        largeBags: fields.large_bags ?? undefined,
        pounds: fields.pounds ?? undefined,
        value: fields.value ?? undefined,
        reviewStatus: fields.review_status ?? undefined,
      });
      setSubmissions((prev) => prev?.map((s) => (s.id === sub.id ? { ...s, ...fields } : s)) ?? prev);
    } catch (err) {
      setSubmissionsError(extractErrorMessage(err, "Failed to save submission"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            {event.title}
          </h1>
        </div>
        <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide ${STATUS_BADGE[status]}`}>
          {status}
        </span>
      </div>

      <div className={cardCls}>
        <h2 className={sectionTitleCls}>Teams</h2>
        {isAdmin ? (
          <div className="space-y-3">
            {teams.map((t) => (
              <div key={t.id} className="flex flex-col gap-2 pb-3 border-b border-zinc-800/60 last:border-b-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => teamLogoInputRefs.current[t.id]?.click()}
                    aria-label="Upload team logo"
                    className="relative w-11 h-11 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 shrink-0 hover:border-zinc-500 transition-colors duration-150 active:scale-[0.95] touch-manipulation group"
                  >
                    {t.logoPreview || t.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logoPreview ?? t.logo_url ?? ""} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span
                        className="flex items-center justify-center w-full h-full text-xs font-bold text-white"
                        style={{ backgroundColor: resolveTeamColor(t.color) }}
                      >
                        {t.name ? t.name[0].toUpperCase() : "+"}
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </button>
                  <input
                    ref={(el) => { teamLogoInputRefs.current[t.id] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => updateTeamLogoFile(t.id, e.target.files?.[0] ?? null)}
                  />
                  <input
                    className={`${inputCls} flex-1`}
                    value={t.name}
                    onChange={(e) => updateTeamDraft(t.id, { name: e.target.value })}
                  />
                  <button
                    onClick={() => handleSaveTeam(t.id)}
                    disabled={teamSavingId === t.id}
                    className="shrink-0 min-h-11 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-40 touch-manipulation"
                  >
                    {teamSavingId === t.id ? "Saving..." : "Save"}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-14">
                  {TEAM_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => updateTeamDraft(t.id, { color: c.value })}
                      aria-label={c.value}
                      className={`w-6 h-6 rounded-full ${c.swatch} transition-transform duration-150 ${
                        t.color === c.value ? "ring-2 ring-offset-2 ring-offset-zinc-900 ring-white scale-110" : "opacity-50 hover:opacity-80"
                      }`}
                    />
                  ))}
                </div>
                {teamErrors[t.id] && <p className="text-sm text-red-400 pl-14">{teamErrors[t.id]}</p>}
              </div>
            ))}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => newTeamLogoInputRef.current?.click()}
                  aria-label="Upload team logo"
                  className="relative w-11 h-11 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 shrink-0 hover:border-zinc-500 transition-colors duration-150 active:scale-[0.95] touch-manipulation group"
                >
                  {newTeamLogoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={newTeamLogoPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="flex items-center justify-center w-full h-full text-xs font-bold text-zinc-500">
                      {newTeamName ? newTeamName[0].toUpperCase() : "+"}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                </button>
                <input
                  ref={newTeamLogoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setNewTeamLogoFile(file);
                    setNewTeamLogoPreview(file ? URL.createObjectURL(file) : null);
                  }}
                />
                <input
                  className={`${inputCls} flex-1`}
                  placeholder="New team name"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                />
                <button
                  onClick={handleAddTeam}
                  disabled={!newTeamName.trim() || addingTeam}
                  className="shrink-0 min-h-11 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-40 touch-manipulation"
                >
                  {addingTeam ? "Adding..." : "Add team"}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pl-14">
                {TEAM_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setNewTeamColor(c.value)}
                    aria-label={c.value}
                    className={`w-6 h-6 rounded-full ${c.swatch} transition-transform duration-150 ${
                      newTeamColor === c.value ? "ring-2 ring-offset-2 ring-offset-zinc-900 ring-white scale-110" : "opacity-50 hover:opacity-80"
                    }`}
                  />
                ))}
              </div>
              {addTeamError && <p className="text-sm text-red-400 pl-14">{addTeamError}</p>}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {teams.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-950/60 border border-zinc-800"
              >
                {t.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.logo_url}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover shrink-0 border border-zinc-700"
                  />
                ) : (
                  <span
                    className="w-7 h-7 rounded-full shrink-0 border border-zinc-700"
                    style={{ backgroundColor: resolveTeamColor(t.color) }}
                  />
                )}
                <span className="text-sm font-semibold text-zinc-200">{t.name}</span>
                {t.color && (
                  <span className="text-[10px] font-mono text-zinc-600">{t.color}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className={cardCls}>
          <h2 className={sectionTitleCls}>Details</h2>
          <div>
            <label className={labelCls}>Cover image</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="relative w-20 h-14 rounded-lg overflow-hidden bg-zinc-800 border-2 border-zinc-700 shrink-0 hover:border-zinc-500 transition-colors duration-150 active:scale-[0.97] touch-manipulation group"
              >
                {imagePreview || imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview ?? imageUrl ?? ""} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <span className="flex items-center justify-center w-full h-full text-[10px] font-medium text-zinc-500">
                    Upload
                  </span>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setImageFile(file);
                  setImagePreview(file ? URL.createObjectURL(file) : null);
                }}
              />
              {(imagePreview || imageUrl) && (
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                    setImageUrl(null);
                  }}
                  className="min-h-11 px-4 rounded-lg border border-zinc-800 text-sm font-medium text-zinc-400 hover:bg-zinc-900 active:bg-zinc-900 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <input className={`${inputCls} w-full`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              className={`${inputCls} w-full`}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Starts</label>
              <input
                type="datetime-local"
                className={`${dateInputCls} w-full`}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Ends (optional)</label>
              <input
                type="datetime-local"
                className={`${dateInputCls} w-full`}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>How submissions get attributed</label>
            <select
              className={`${inputCls} w-full`}
              value={submissionMode}
              onChange={(e) => setSubmissionMode(e.target.value as TeamEventSubmissionMode)}
            >
              <option value="manual_opt_in">Manual opt-in: participant checks a box on the submission</option>
              <option value="automatic">Automatic: any active-event cleanup by a participant counts</option>
            </select>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-zinc-300">
            <input
              type="checkbox"
              className="w-4 h-4 accent-emerald-600"
              checked={requiresPhoto}
              onChange={(e) => setRequiresPhoto(e.target.checked)}
            />
            Require a photo with every submission
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveDetails}
              disabled={detailsSaving}
              className="min-h-11 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-40 touch-manipulation"
            >
              {detailsSaving ? "Saving..." : "Save details"}
            </button>
            {detailsSaved && !detailsSaving && <span className="text-sm text-emerald-400">Saved.</span>}
          </div>
          {detailsError && <p className="text-sm text-red-400">{detailsError}</p>}
        </div>
      )}

      {isAdmin && (
        <div className={cardCls}>
          <h2 className={sectionTitleCls}>Status</h2>
          <select
            className={inputCls}
            value={status}
            disabled={statusSaving}
            onChange={(e) => handleStatusChange(e.target.value as TeamEventStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {statusError && <p className="text-sm text-red-400">{statusError}</p>}
        </div>
      )}

      {isAdmin && (
        <div className={cardCls}>
          <h2 className={sectionTitleCls}>Delegated organizers</h2>
          <p className="text-xs text-zinc-500 -mt-2">
            Organizers can edit this event&apos;s details, add teams, and review submissions,
            the same access as an Event Manager, but scoped to this one event only. They can&apos;t
            add or remove other organizers.
          </p>
          {organizers.length === 0 ? (
            <p className="text-xs text-zinc-600">No delegated organizers yet.</p>
          ) : (
            <ul className="space-y-1">
              {organizers.map((o) => (
                <li key={o.user_id} className="flex items-center justify-between gap-2 text-xs bg-zinc-900/60 rounded-lg px-3 py-1.5">
                  <span className="text-zinc-300">
                    {o.username ?? o.email} <span className="text-zinc-600">({o.email})</span>
                  </span>
                  <button
                    onClick={() => handleRemoveOrganizer(o.user_id)}
                    className="shrink-0 px-2.5 py-2 rounded-lg border border-red-900/50 text-red-400 hover:bg-red-950/40 active:bg-red-950/40 active:scale-[0.97] transition-[background-color,transform] duration-150 touch-manipulation"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="relative">
            <input
              className={`${inputCls} w-full`}
              placeholder="Search by username or email..."
              value={organizerQuery}
              onChange={(e) => setOrganizerQuery(e.target.value)}
            />
            {organizerQuery.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 shadow-elevation-2 max-h-56 overflow-y-auto">
                {organizerSearching ? (
                  <p className="text-xs text-zinc-600 px-3 py-2">Searching...</p>
                ) : organizerResults.length === 0 ? (
                  <p className="text-xs text-zinc-600 px-3 py-2">No matching users.</p>
                ) : (
                  organizerResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleAddOrganizer(u)}
                      className="w-full text-left text-sm text-zinc-200 px-3 py-2 hover:bg-zinc-800 transition-colors duration-150"
                    >
                      {u.username ?? u.email} <span className="text-zinc-600">({u.email})</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {organizerError && <p className="text-sm text-red-400">{organizerError}</p>}
        </div>
      )}

      <div className={cardCls}>
        <h2 className={sectionTitleCls}>Submissions</h2>
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
                    <td className="py-2 pr-3">{s.team_id ? teamNameById.get(s.team_id) ?? "—" : "—"}</td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        className={`${inputCls} w-24`}
                        defaultValue={s.value ?? 0}
                        disabled={savingId === s.id}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== s.value) handlePatchSubmission(s, { value: v });
                        }}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        className={inputCls}
                        value={s.review_status ?? "pending"}
                        disabled={savingId === s.id}
                        onChange={(e) => handlePatchSubmission(s, { review_status: e.target.value as ReviewStatus })}
                      >
                        {REVIEW_STATUSES.map((rs) => (
                          <option key={rs} value={rs}>{rs}</option>
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
    </div>
  );
}
