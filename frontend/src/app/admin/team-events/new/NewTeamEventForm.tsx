"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTeamEvent, uploadTeamEventLogo, uploadTeamEventImage, type TeamEventSubmissionMode } from "@/lib/teamEvents";
import { TEAM_COLORS } from "@/lib/teamColors";

const inputCls = "w-full min-h-11 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-emerald-600 transition-colors duration-150";
const selectCls = `${inputCls} appearance-none bg-no-repeat pr-9`;
const dateInputCls = `${inputCls} [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70`;
const selectArrowStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2371717a'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")",
  backgroundPosition: "right 0.65rem center",
  backgroundSize: "16px 16px",
};
const labelCls = "block text-sm font-medium text-zinc-400 mb-1.5";
const cardCls = "rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-elevation-1 p-5 space-y-4";

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed?.detail) && typeof parsed.detail[0]?.msg === "string") {
      return parsed.detail[0].msg.replace(/^Value error,\s*/, "");
    }
  } catch {
    // not JSON, fall through to generic fallback
  }
  return fallback;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function NewTeamEventForm({
  requestingUserId,
  campaigns,
  onCreated,
}: {
  requestingUserId: string;
  campaigns: { id: string; slug: string; title: string }[];
  /** When provided, called with the new event's id instead of navigating to its edit page. */
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [campaignId, setCampaignId] = useState(
    campaigns.find((c) => c.slug === "trash-war")?.id ?? campaigns[0]?.id ?? ""
  );
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [submissionMode, setSubmissionMode] = useState<TeamEventSubmissionMode>("automatic");
  const [requiresPhoto, setRequiresPhoto] = useState(true);
  const [teams, setTeams] = useState<{ name: string; color: string; logoFile: File | null; logoPreview: string | null }[]>([
    { name: "", color: TEAM_COLORS[0].value, logoFile: null, logoPreview: null },
    { name: "", color: TEAM_COLORS[1].value, logoFile: null, logoPreview: null },
  ]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const updateTeamName = (i: number, value: string) => {
    setTeams((prev) => prev.map((t, idx) => (idx === i ? { ...t, name: value } : t)));
  };
  const updateTeamColor = (i: number, value: string) => {
    setTeams((prev) => prev.map((t, idx) => (idx === i ? { ...t, color: value } : t)));
  };
  const updateTeamLogo = (i: number, file: File | null) => {
    setTeams((prev) =>
      prev.map((t, idx) => (idx === i ? { ...t, logoFile: file, logoPreview: file ? URL.createObjectURL(file) : null } : t))
    );
  };

  const canSubmit = title.trim() && slug.trim() && startsAt && teams.filter((t) => t.name.trim()).length >= 2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      const namedTeams = teams.filter((t) => t.name.trim());
      const teamsWithLogos = await Promise.all(
        namedTeams.map(async (t) => ({
          name: t.name,
          color: t.color,
          logoUrl: t.logoFile ? await uploadTeamEventLogo(t.logoFile) : null,
        }))
      );
      const imageUrl = imageFile ? await uploadTeamEventImage(imageFile) : null;
      const created = await createTeamEvent({
        requestingUserId,
        campaignId: campaignId || null,
        slug: slug.trim(),
        title,
        description,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        submissionMode,
        requiresPhoto,
        imageUrl,
        teams: teamsWithLogos,
      });
      if (onCreated) {
        onCreated(created.id);
      } else {
        router.push(`/admin/team-events/${created.id}/edit`);
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to create event"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <p className="text-sm text-red-400 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2">{error}</p>
      )}

      <div className={cardCls}>
        <div>
          <label className={labelCls}>Title</label>
          <input
            className={inputCls}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
          />
        </div>

        <div>
          <label className={labelCls}>Slug</label>
          <input
            className={inputCls}
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
          />
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <textarea
            className={inputCls}
            rows={3}
            placeholder="What's this competition about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Cover image (optional)</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="relative w-20 h-14 rounded-lg overflow-hidden bg-zinc-800 border-2 border-zinc-700 shrink-0 hover:border-zinc-500 transition-colors duration-150 active:scale-[0.97] touch-manipulation group"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Cover" className="w-full h-full object-cover" />
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
            {imagePreview && (
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  setImagePreview(null);
                }}
                className="text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div>
          <label className={labelCls}>Campaign</label>
          <select className={selectCls} style={selectArrowStyle} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Schedule</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Starts</label>
            <input type="datetime-local" className={dateInputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Ends (optional)</label>
            <input type="datetime-local" className={dateInputCls} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Submissions</h2>
        <div>
          <label className={labelCls}>How submissions get attributed</label>
          <select
            className={selectCls}
            style={selectArrowStyle}
            value={submissionMode}
            onChange={(e) => setSubmissionMode(e.target.value as TeamEventSubmissionMode)}
          >
            <option value="automatic">Automatic: any active-event cleanup by a participant counts</option>
            <option value="manual_opt_in">Manual opt-in: participant checks a box on the submission</option>
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
      </div>

      <div className={cardCls}>
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Teams</h2>
        <div className="space-y-3">
          {teams.map((t, i) => (
            <div key={i} className="flex flex-col gap-2 pb-3 border-b border-zinc-800/60 last:border-b-0 last:pb-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => logoInputRefs.current[i]?.click()}
                  aria-label="Upload team logo"
                  className="relative w-11 h-11 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 shrink-0 hover:border-zinc-500 transition-colors duration-150 active:scale-[0.95] touch-manipulation group"
                >
                  {t.logoPreview ? (
                    <img src={t.logoPreview} alt="Team logo" className="w-full h-full object-cover" />
                  ) : (
                    <span className="flex items-center justify-center w-full h-full text-xs font-bold text-zinc-500">
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
                  ref={(el) => { logoInputRefs.current[i] = el; }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => updateTeamLogo(i, e.target.files?.[0] ?? null)}
                />
                <input
                  className={inputCls}
                  placeholder={`Team ${i + 1} name`}
                  value={t.name}
                  onChange={(e) => updateTeamName(i, e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pl-14">
                {TEAM_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => updateTeamColor(i, c.value)}
                    aria-label={c.value}
                    className={`w-6 h-6 rounded-full ${c.swatch} transition-transform duration-150 ${
                      t.color === c.value ? "ring-2 ring-offset-2 ring-offset-zinc-900 ring-white scale-110" : "opacity-50 hover:opacity-80"
                    }`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setTeams((prev) => [
              ...prev,
              { name: "", color: TEAM_COLORS[prev.length % TEAM_COLORS.length].value, logoFile: null, logoPreview: null },
            ])
          }
          className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors duration-150"
        >
          + Add another team
        </button>
      </div>

      <button
        type="submit"
        disabled={!canSubmit || loading}
        className="w-full min-h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold shadow-elevation-2 transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 touch-manipulation"
      >
        {loading ? "Creating..." : "Create event"}
      </button>
    </form>
  );
}
