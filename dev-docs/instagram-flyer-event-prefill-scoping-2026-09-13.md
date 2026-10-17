# Instagram flyer upload → prefill Host Event form — scoping

Not started — this doc is the design pass before any code work. Flagged
high priority per user (2026-09-13): most group organizers already make an
Instagram post to promote their cleanup event, and retyping the same
details into `CreateCleanupEventForm.tsx` is pure friction on top of work
they've already done once.

## Goal

Let an organizer upload a screenshot of their Instagram event post (flyer,
caption, or both) on the Host Event form and have the app extract title,
description, date/time, and location, then prefill the existing form
fields — organizer reviews/edits before submitting, nothing auto-creates.

## Resolved (2026-09-13)

1. **Extraction method: Claude vision API.** Backend sends the uploaded
   image (+ caption text if the organizer pastes it separately) to Claude
   with a prompt requesting a structured JSON extraction. Chosen over
   OCR-only because flyer text is often stylized/stacked/multi-font, and
   over GPT-4o because the app already standardizes on Claude elsewhere in
   this workflow (this scoping doc itself, decision made by user).
2. **The uploaded image also becomes the event's cover photo.** It's
   already the organizer's promo graphic; prefill `imageFile`/`imagePreview`
   with it directly. Organizer can still swap it before submitting, same as
   today.

## 1. Where this lives in the form

`CreateCleanupEventForm.tsx` (create mode only — editing an existing event
has no obvious "re-extract" use case and is out of scope). Add an upload
step ahead of the existing `basics` step, or a "prefill from flyer" action
inline in `basics` — see §5. Either way, extraction populates the same
`useState` fields the manual inputs already write to, so the rest of the
form (validation, `canSubmit`, submit payload) is untouched.

## 2. Fields we can realistically extract

From a typical Instagram cleanup-event flyer/caption:

| form field | extractable? | notes |
|---|---|---|
| `title` | yes | usually the flyer's headline |
| `description` | yes | caption body, or flyer subtext |
| `scheduledStart` / `scheduledEnd` | yes, imperfect | flyers often give a date + start time only, no end time — leave `scheduledEnd` blank when absent rather than guessing |
| location (`addressLine1`/`city`/`state`/`postalCode`/`lat`/`lng`) | partial | flyers usually give a venue name or partial address ("Meet at Fort Greene Park"), not a geocodable full address |
| `maxAttendees` | rare | only if explicitly stated ("limited to 30 spots") |
| `externalLink` | no | not on a flyer; leave for organizer |
| `route` | no | flyers don't encode a walkable route; leave for organizer |
| `loggingMode`, `cohostGroupIds` | no | app-specific config, not on a flyer |

**Location needs a second step.** Claude can extract a venue name/partial
address string, but the form needs `lat`/`lng` + structured address parts.
Feed the extracted location string into the same MapTiler geocoding
`AddressAutocomplete.tsx` already calls (`frontend/src/app/admin/AddressAutocomplete.tsx`)
as a pre-typed query, and let the organizer confirm/adjust the resulting
pin — never silently trust a geocoded guess for something GPS-radius-gated
elsewhere in the app (check-in proximity).

## 3. API shape

New backend endpoint, e.g. `POST /api/cleanup-events/extract-flyer`
(multipart: image file, optional caption text) →

```json
{
  "title": "Fort Greene Park Cleanup",
  "description": "Join us for our monthly cleanup...",
  "scheduled_start": "2026-10-04T10:00:00",
  "scheduled_end": null,
  "location_text": "Fort Greene Park, Brooklyn",
  "max_attendees": null,
  "confidence_notes": "Time zone assumed local; year inferred as current year since flyer only showed month/day."
}
```

Claude's response is parsed server-side (structured output / tool-call
style, not free text) so a malformed/unparseable response degrades
gracefully to "couldn't read that image, fill in manually" rather than a
500 or garbage data.

`location_text` (not lat/lng) crosses the wire; the frontend runs it
through the existing MapTiler autocomplete flow client-side per §2, same
as if the organizer had typed it.

## 4. New infra

- `ANTHROPIC_API_KEY` added to `backend/app/core/config.py` `Settings` —
  first use of an LLM API in this codebase, net-new secret/vendor.
- Cost: per-organizer, per-event-creation only (not a hot path) — expect
  low volume, but worth a basic rate limit (e.g. per-user per-hour cap) so
  a script/bot can't run up API spend through this endpoint.
- No new table needed — extraction is stateless, request/response only;
  nothing about the flyer image itself needs to persist beyond becoming
  the event's `image_urls` cover photo (existing R2 upload path).

## 5. UI flow

1. Host Event form, `basics` step: add an "Upload flyer to prefill" file
   input above the manual fields (optional — organizers can skip straight
   to manual entry as today).
2. On upload: show a loading state, call the extract endpoint, then fill
   `title`/`description`/`scheduledStart`/`scheduledEnd`/`maxAttendees`
   state directly; run `location_text` through `AddressAutocomplete`'s
   existing geocode call and prefill the address/lat/lng fields with the
   top match (organizer still sees/can change it via the normal address
   field, not auto-locked in).
3. Set `imageFile`/`imagePreview` to the uploaded flyer (per Resolved #2).
4. Every prefilled field stays a normal editable input — no "locked until
   confirmed" state. If extraction fails or returns partial data, whatever
   couldn't be filled just stays blank for manual entry; show a small
   inline note ("Couldn't read a location off this image — please fill it
   in") rather than a hard error, since partial prefill is still a win.
5. Uploading a flyer is **never required** — the existing all-manual path
   stays exactly as-is for organizers who don't use Instagram or prefer
   typing.

## 6. Open questions for build time (not blocking the scoping pass)

- Year inference: flyers often omit the year ("Sat Oct 4th"). Assume
  current year, but flag if that would produce a date in the past (likely
  means "next year's" that date) — surface a warning rather than silently
  submitting a stale date.
- Multi-image posts: Instagram posts can be carousels. v1 handles a single
  uploaded image only; if the organizer's best flyer is the 3rd slide,
  they upload that one directly. No multi-image upload in v1.
- Caption text input: worth a plain-text paste box alongside the image
  upload (some organizers put all the real details in the caption, not the
  graphic itself) — cheap to add, improves extraction accuracy. Recommend
  including in v1 build, not deferring.

## 7. Suggested build phases

1. Backend: `Settings.anthropic_api_key` + `POST /api/cleanup-events/extract-flyer`
   endpoint (image + optional caption in, structured JSON out), rate-limited.
2. Frontend: upload input + loading/error states in `CreateCleanupEventForm.tsx`
   `basics` step, wired to prefill existing state (no new form fields
   needed — reuses everything that exists today).
3. Location handoff: extracted `location_text` → `AddressAutocomplete`
   geocode call → prefilled address/pin, organizer-confirmable.
4. Cover-photo prefill from the same upload (Resolved #2).

## Related

- `frontend/src/components/cleanups/CreateCleanupEventForm.tsx` — form being extended.
- `frontend/src/app/admin/AddressAutocomplete.tsx` — MapTiler geocoding reused for location handoff.
- `backend/app/core/config.py` — where `ANTHROPIC_API_KEY` gets added.
- `dev-docs/master-backlog.md` — added as a high-priority item.
