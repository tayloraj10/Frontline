# Trash War — Competitor Feedback Backlog

Source: feature comparison against a similar app ("Trash"), reviewed 2026-07-19. Scope is limited to the Trash War campaign. Each item below reflects the decision reached after discussion, not the raw original feedback.

Status legend: `[ ]` not started · `[~]` needs more design/logic before implementation · `[x]` already covered by existing functionality

---

## 1. Camera capture for reports/contributions — done

- [x] Added direct `getUserMedia` camera capture as an option on photo upload (reports + Log Cleanup). New shared `PhotoCaptureInput` + `CameraModal` components in `frontend/src/components/contributions/ContributionPanel.tsx`, offering "Take Photo" (live camera preview + capture) and "Choose from Gallery" (existing file picker) side by side.
- [x] Existing gallery/file-picker option kept — camera is additive, not a replacement.
- Applies to both the "Report Trash" flow (`ReportModal`) and the Log Cleanup / Submit Photo flow (`ContributeModal`).

## 2. Log Cleanup modal — no change

- Decision: keep the current modal as-is. It's not considered too heavy, and the flat structure makes it easier to extend as new fields (pounds, bag split, etc.) get added. Progressive disclosure was considered and rejected.

## 3. Claim-a-report challenge mode (new mechanic, additive): done

Current flow (unchanged, stays as the default/simple path): log a cleanup within range of a "Report Trash" pin → clears the report.

New optional flow, added alongside it:
- [x] Added a **"Claim"** action when clicking a Report Trash pin.
- [x] On claim: timer #1 starts, user has `CLAIM_BEFORE_WINDOW_MINUTES` (30 min) to arrive on-site and submit a **before** photo.
- [x] On before-photo submission: timer #2 starts, user has `CLAIM_AFTER_WINDOW_MINUTES` (20/30/45 min, scaled by report severity low/medium/high) to submit an **after** (cleaned-up) photo.
- [x] If either timer expires, the claim is released/expires (report reverts to unclaimed, available for others); a `CLAIM_RECLAIM_COOLDOWN_MINUTES` (15 min) cooldown applies before the same user can reclaim it.
- [x] Successfully completing the claim flow grants a **score multiplier** (`CLAIM_CHALLENGE_MULTIPLIER` = 1.5x) vs. a plain in-range log.
- [x] Before/after claim photos carry over (already-uploaded R2 URLs, no reupload) into the final Log Cleanup form, prefilled and independently removable.
- [x] Claim photo previews are bigger, centered, and click-to-enlarge via the shared `Lightbox` component.

## 4. Nav weight for new/anonymous users — no change

- Decision: current nav is not considered too heavy. Everything already lives behind its own page rather than being surfaced at once. No participant-mode nav planned. (Worth a quick sanity check on what an anonymous/first-login user's nav actually shows today, but not treated as a backlog item unless that check turns up a real gap.)

## 5. First-load instructions modal — done

- [x] Added a first-time instructions modal explaining current features (territory flipping, claiming, scoring, etc.).
- [x] "Don't show this again" checkbox, persisted per-user.
- [x] Persistent entry point (e.g. a help/"?" button) to reopen the same modal on demand at any time.
- [x] Process note: modal content must be kept in sync as new features ship — treat as a living doc, not a one-time write.

## 6. Group cleanup event stats — done

Research finding: most of this already exists at the schema/query level.
- [x] Small vs. large bag split already exists as separate columns (`metrics_small_bags`, `metrics_large_bags` on `cleanups`, `supabase/migrations/016_dogs_alignment.sql`) — not a single generic bag count.
- [x] Per-contributor bag breakdown already exists (`backend/app/api/routes/cleanup_events.py`, aggregates small/large bags per RSVP'd user).
- [x] **Fixed a related bug while doing this:** the per-user aggregation went through `cleanup_rsvps.contribution_id`, a single FK that gets overwritten on every resubmit, so an attendee who logged multiple times to the same event only ever saw their most recent submission's bags counted. Added `contributions.cleanup_event_id` (migration 039) as a direct, non-overwritable link and rewrote the aggregation to `SUM` across all of a user's contributions to the event.
- [x] Per-contributor **pounds** added to the same aggregation query (`SUM(cl.metrics_pounds)`), exposed as `pounds` on each rsvp entry and `total_pounds` on the event.
- [x] Photo gallery — event detail response now returns a flattened `photos: string[]` (all `image_urls` across all contributions to the event, not just `image_urls[0]`), rendered as a grid with lightbox in `CleanupEventDetail.tsx`.
- [x] Encourage (not require) pounds + photos when submitting to an event — UI nudge on the submission form (`ContributionPanel.tsx`: pounds + photo labels/borders turn amber with a short prompt when `isEventMode` is true and the field is still empty), not a schema or validation change.

## 7.5 Bag-size terminology + contractor-bag tier

- [x] Standardized "small bags" / "large bags" as the only user-facing labels app-wide, dropping material references ("plastic grocery" / "kitchen trash") that assumed everyone bags the same way. Size intuition is now conveyed via a muted hint next to the label ("~grocery bag size" / "~kitchen trash bag size") instead of the label itself. Fixed in `ContributionPanel.tsx` and `CleanupEventDetail.tsx` (form labels, value-caption text, event summary banner, per-attendee breakdown + tooltip); `AdminPanel.tsx` and `VerificationClient.tsx` already used neutral language.
- [x] Reviewed the small→large 3x conversion (`LARGE_BAG_VALUE = 3` in `ContributionPanel.tsx`) — holds up: ~2-4 gal grocery bag vs. 13-gal kitchen bag is roughly a 3-4x volume ratio, so 3x is a reasonable round approximation. No change made.
- [ ] Add a third size tier for contractor bags (~42-55 gal, roughly 10-13x a small bag) — currently anyone filling one has no way to log it beyond "large," undercounting their real contribution. Needs: new `metrics_contractor_bags`-style column + migration, a scoring multiplier, and surfacing everywhere small/large already appear (submission forms, event aggregation, admin table, verification view).

## 7. Contested-zone alerts

Research finding: infrastructure to build this on already exists.
- `user_notifications` table (`supabase/migrations/007_user_notifications.sql`) already supports recipient/type/title/body/read, with RLS scoped to the owning user.
- Existing DB-trigger pattern to copy: `notify_territory_claimed()` (fires on `territory_claims` insert/update) and `notify_contributors_of_campaign_event()` (fires on `campaign_events` insert). A new trigger follows the same shape with `type = 'zone_contested'` (or similar).
- Gap to fill: there is currently no "margin to flip" concept anywhere. `territory_claims` stores only the leader's `total_value`, nothing about the runner-up. Need trigger logic that compares leading vs. second-place `total_value` per geo unit (likely via a `contributions`/`territory_claims` join grouped by geo_unit_id) and fires when the margin drops under a threshold.
- No cron/job infra needed, this is a DB write-triggered notification like the other two, not a polling job.
- [ ] Design the margin-to-flip query/threshold.
- [ ] Add `zone_contested` trigger following the existing pattern.
- [ ] Surface the new notification type in the existing in-app notification UI (no email/push, out of scope per current notification system).

---

## Out of scope / rejected

- Progressive disclosure on Log Cleanup modal (item 2 above) — rejected, keep current modal.
- Simplified participant-mode nav (item 4 above) — rejected, current nav considered fine.
