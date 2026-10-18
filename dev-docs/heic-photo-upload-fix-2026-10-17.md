# HEIC Photo Upload Fix (2026-10-17)

Status: code written, uncommitted, untested on a device. Tracks the fix, the test plan, rollout and follow-ups.

## Problem

Some photos uploaded from iPhones show as blank/dead images in desktop browsers (Chrome, Firefox), but render fine in the app on the phone.

Example: `https://pub-7494af6fb92d41d6a0c8a0df48bac7cf.r2.dev/uploads/contributions/71fdcaaf-b890-4e6c-abbd-128a6374ad40.jpg`

## Root cause

The stored object is a real HEIC file (first bytes `00 00 00 28 66 74 79 70 68 65 69 63`, i.e. an `ftypheic` box) that is named `.jpg` and served as `Content-Type: image/jpeg`.

- Safari and WKWebView decode HEIC, so it renders on the phone.
- Desktop Chrome and Firefox cannot decode HEIC, so the `<img>` is blank.

How the mislabel happens:

- Every uploader sent the picked `File` to R2 untouched, using `file.name` for the extension and `file.type` for the content type.
- The native Capacitor path (`mediaResultToFile` in `components/contributions/photoCapture.tsx`) hardcodes `.jpg` / `image/jpeg` for anything that is not PNG, so a HEIC from the iOS gallery is labeled JPEG regardless of its bytes.
- Backend `GET /api/upload/presign` (`backend/app/api/routes/upload.py`) trusts the client-supplied filename and content type.

## Fix

### New: `frontend/src/lib/normalizeImage.ts`

`normalizeImageForUpload(file)`:

1. Reads the first 12 bytes. If bytes 4 to 8 are `ftyp` and the brand is one of `heic, heix, hevc, hevx, heim, heis, mif1, msf1`, the file is HEIC/HEIF. Otherwise it is returned unchanged (early return, so non-HEIC uploads behave exactly as before).
2. For HEIC: `createImageBitmap(file, { imageOrientation: "from-image" })`, draw to a canvas, `canvas.toBlob("image/jpeg", 0.9)`, and return a new `File` named `<original base name>.jpg` with type `image/jpeg`.
3. If anything fails (decode error, no canvas context, null blob), the original file is returned so the upload is never blocked. The failure mode is the old behavior.

Conversion happens on the device that took the photo, because that is the one environment that can decode HEIC.

### Consolidated uploaders: `frontend/src/lib/uploadToR2.ts`

`uploadToR2(file, kind = "contributions")` is now the single upload path. It normalizes the image, requests a presigned URL (with `kind`), and PUTs the result. `UploadKind` mirrors the backend `UPLOAD_KINDS`.

Previously seven places had their own copy-pasted presign + PUT code. They now delegate to `uploadToR2`, keeping their existing function names and signatures so no callers changed:

| Location | Function | Kind |
|---|---|---|
| `lib/cleanupEvents.ts` | `uploadEventPhoto` | contributions (default) |
| `lib/events.ts` | `uploadEventImage` | events |
| `lib/teamEvents.ts` | `uploadTeamEventLogo`, `uploadTeamEventImage` (local `uploadToR2` copy removed) | team_events |
| `components/partners/BusinessForm.tsx` | `uploadPartnerLogo` | partners |
| `app/groups/apply/ApplyGroupForm.tsx` | `uploadLogo` | groups |
| `app/groups/[slug]/edit/GroupEditForm.tsx` | `uploadLogo` | groups |
| `app/settings/profile/ProfileEditForm.tsx` | `uploadAvatar` | profiles |
| `app/admin/AdminPanel.tsx` | `uploadEventImage` | events |

Already on the shared function (unchanged call sites): `ContributionPanel.tsx`, `GroupEventTrackRoute.tsx`.

Note on defaults: `uploadEventPhoto` previously sent no `kind`, and the backend default is `contributions`, so behavior is identical.

## Risks and behavior notes

- Non-HEIC files take the early-return path and are byte-identical to before.
- If HEIC conversion succeeds but produces a bad image (blank, wrong rotation), the original HEIC is not stored, only the JPEG. This is the one case a revert cannot recover for photos uploaded in the meantime. Considered unlikely.
- If conversion fails, the original HEIC is uploaded, which is the current bug. There is no signal for this; consider adding a `console.warn` in the catch if silent fallback proves to hide problems.
- `createImageBitmap` on HEIC depends on the WebView. Older iOS versions may reject it and hit the fallback.
- Very large images (panoramas, 48MP) can exceed iOS canvas size limits and hit the fallback.
- EXIF orientation is applied during decode (`imageOrientation: "from-image"`), and the re-encoded JPEG has no EXIF, so orientation is baked in. GPS EXIF is also dropped from converted photos. Photo coordinates in the app come from separate location capture, not EXIF, but verify route photos still carry their lat/lng (they are attached in `ContributionPanel` / `GroupEventTrackRoute`, not read from EXIF).
- Re-encoding at 0.9 quality changes file size. Typical iPhone HEIC to JPEG will grow somewhat.
- App is live in production. Web changes ship immediately and the Capacitor wrapper loads the remote URL, so native users get the fix with the deploy, no store release needed.

## Test plan

Run against the local dev server. HEIC cases need a real iPhone pointed at the dev server (Safari, and the Capacitor build if possible).

### 0. Environments and dev setup

Platform coverage matrix:

| Platform | What to verify |
|---|---|
| iPhone, Safari (web) | HEIC conversion (step 1), all uploaders (step 3) |
| iPhone, Capacitor build | HEIC conversion via `mediaResultToFile` (step 1), camera and gallery picks |
| Android, Chrome and Capacitor build | Quick pass: gallery pick of a HEIC/HEIF photo (some Samsung and Pixel cameras shoot it) plus a normal JPEG. Android was not analyzed in detail; confirm it neither breaks nor regresses |
| Desktop Chrome/Firefox | Regression on JPEG/PNG/WebP (step 2), viewing converted and legacy photos (step 1 verification) |
| Desktop Safari | Optional: can decode HEIC itself, so useful to confirm the converter also works there |

Dev setup needed for phone testing:

- A phone cannot reach `localhost`. Run the frontend and backend on the LAN IP, or use a tunnel, and set `NEXT_PUBLIC_FASTAPI_URL` to an address the phone can reach. Use existing dev servers; do not restart them without asking.
- Camera and some APIs need a secure context (HTTPS) on the phone, so a tunnel with HTTPS is likely easier than raw LAN HTTP.
- The R2 bucket's CORS policy must allow `PUT` from the origin the phone loads the app from, or the upload fails after the presign succeeds (looks like "Photo upload failed").
- Backend needs R2 credentials configured locally (`/upload/presign` returns 503 "R2 storage not configured" otherwise). Dev uploads land under `dev/uploads/...`.
- For the Capacitor build, confirm which URL the wrapper loads (remote-URL wrapper). To test unreleased code it must point at your dev server, not production.
- Getting a real HEIC test file: take a photo with iPhone camera set to "High Efficiency" (Settings, Camera, Formats), and pick it from the Photos or Files app. If Safari hands the page a JPEG (iOS sometimes auto-converts for `<input type=file>`), the native Capacitor gallery path or the Files picker is the reliable way to get raw HEIC. Record which path produced HEIC so the test is repeatable.
- A desktop-only sanity test of the converter's detection logic can be done by feeding a known HEIC file (for example the example URL above, downloaded) through the file input on desktop Safari.

### 1. HEIC conversion (the actual bug)

- Fresh camera photo and a photo picked via the Files app (more likely to still be HEIC).
- Upload as a contribution photo (ContributionPanel).
- Open the stored URL on a PC and confirm:
  - it renders;
  - it is upright (test one portrait, one landscape);
  - `curl -s <url> | head -c 4 | xxd` shows `ffd8`, not `ftyp`;
  - the key ends in `.jpg`.
- Repeat in the native Capacitor build (exercises `mediaResultToFile`, untested so far).
- Upload one very large photo (panorama or 48MP). If the bytes come back as `ftyp`, canvas limits are a real problem and we need a downscale step.

### 2. Regression on the normal path

Upload a plain JPEG, PNG and WebP from desktop in the same flows. Each should upload, render, and be byte-identical to the original (compare file sizes).

### 3. One upload per refactored uploader

Confirm the new URL has the right R2 prefix and the image renders. In dev the prefix is `dev/uploads/...`.

| Uploader | Where to trigger | Expected prefix |
|---|---|---|
| `uploadEventPhoto` | Cleanup event photos (`CleanupEventDetail`) | `uploads/contributions/` |
| `uploadEventImage` (`events.ts`) | Timed event form | `uploads/events/` |
| AdminPanel event image | Admin panel, event create or edit | `uploads/events/` |
| `teamEvents.ts` logo and image | Admin, new and edit team event | `uploads/team_events/` |
| `uploadPartnerLogo` | Partner / business form | `uploads/partners/` |
| Group logo | Group apply and group edit | `uploads/groups/` |
| Avatar | Settings, profile | `uploads/profiles/` |

Also re-check the already-shared callers still work: contribution photos (including report, cleanup and route node photos in `ContributionPanel`) and group event track route photos.

### 4. Failure paths

- Stop the backend and upload: expect the same "Failed to get upload URL" error as before, no hang.
- Rename a `.txt` to `.jpg` and upload: should upload as-is without crashing (not HEIC, so it skips conversion).

### 5. Before merging

- `npm run build` (not only `tsc --noEmit`).
- `grep -rn "upload/presign" frontend/src` should only match `lib/uploadToR2.ts`.
- Confirm route photos still show correct map positions after upload.

### 6. After deploy

Upload one fresh iPhone photo in prod and check the stored URL renders on desktop.

## Rollout

1. Commit as a single logical batch (user to decide when and on which branch; no commit has been made for the consolidated version).
2. Deploy web. No migration, no store release.
3. Run test step 6 in prod.
4. Rollback: revert the commit. Photos uploaded in the meantime remain valid JPEGs (or unchanged originals on fallback).

## Follow-ups

- **Backfill existing broken photos already in R2 (do not forget).** The fix only protects new uploads. Prod already contains HEIC objects labeled `.jpg` / `image/jpeg` (the example URL at the top is one, uploaded 2026-09-02, so the problem has existed for a while). Those stay blank on desktop until repaired. Plan:
  - Scan: list objects under `uploads/` (all kinds, not just contributions), read the first 12 bytes of each (ranged GET), and flag those with an `ftyp` HEIC/HEIF brand. Produce a count and list first, read-only, before changing anything.
  - Repair: download, convert with `pillow-heif` + Pillow (apply EXIF orientation, JPEG quality ~90), and overwrite at the same key with `Content-Type: image/jpeg`. Same key means no DB rows or URLs change. Keep the original bytes (copy to a `backup/heic-originals/` prefix or similar) until the result is verified.
  - Caveats: CDN or browser caches may serve the old object for a while after overwrite. Dev and prod use different prefixes (`dev/uploads` vs `uploads`); scope each run explicitly.
  - Must go through the Seeder registry and `POST /admin/seed` per project convention, never a standalone script. Run on dev first.
  - Prod run needs explicit go-ahead. This is an irreversible overwrite in production storage, so the originals backup is required, and migrations/prod writes remain the user's call.
  - Verify afterwards by opening a few previously broken URLs on desktop Chrome.
- **Server-side guard (optional).** The backend could verify magic bytes after upload or reject HEIC, as defense in depth for clients that bypass the frontend helper.
- **Fix `mediaResultToFile` labeling.** It still labels non-PNG as JPEG. The normalizer corrects the bytes downstream, but the label is misleading and could be made to use `result.metadata?.format`.
- **Silent fallback visibility.** Consider logging when HEIC conversion falls back.
