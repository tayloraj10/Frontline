# Earner rules: marketplace jobs vs sponsored sites (2026-11-15)

Values in brackets are `game_settings` keys, so they can be tuned without a deploy.

| Rule | Marketplace job | Sponsored site |
|---|---|---|
| Who can take it | Cleaner with profile photo, one active task total | Any earner, one active task total, once per site per day |
| Claim from afar | Yes | Yes, as of migration 158 (was: had to be within 300 ft) |
| Time to get there | 60 min after accepting [`marketplace_arrive_minutes`], shown as `arrive_by` | 60 min after claiming [`sponsored_claim_before_window_minutes`], was 30 |
| Start requirement | Before photo, taken within 500 ft of the job [`marketplace_site_radius_m`] | Before photo, within 500 ft [`sponsored_claim_proximity_meters`, migration 162] |
| Time to do the work | No explicit limit; auto-release rules below | 120 min after the before photo [`sponsored_claim_work_window_minutes`], then it reopens |
| Finish requirement | At least 1 after photo (if the category requires it), confirm all bags are in the photo, 3+ route points [`marketplace_min_track_points`] | After photo within 500 ft, bag count at least the site minimum |
| If you miss the arrive window | Job is released back to the pool | Claim expires, site reopens |
| Review | Poster approves, or auto-release after 3 days [`marketplace_auto_release_days`] | Admin review before payout |
| Payout | Stripe charge to poster, transfer to cleaner | Transfer from the sponsor's pool, capped per user and per day |

## Phone app requirement
Taking a job or claiming a site works on any device. Photos, start, finish and site photo submit are locked to the native app in production (notice with store links). Outside production the lock is off; set NEXT_PUBLIC_ALLOW_WEB_FIELD_WORK=1 to lift it in a prod build.

## Changes made this round
1. Sponsored sites can be claimed from anywhere. Distance is still enforced on the before and after photos.
2. Travel window is one hour for both jobs (was 120) and sites (was 30), migration 158.

## Things worth deciding
- Jobs have no work-time limit while sponsored sites do (120 min). A job could sit in progress for days until it is auto-released. Consider a similar cap for jobs.
- Photo radius is now 500 ft for both (migration 162). Sites a sponsor drew smaller still get 500 ft.
- With claim-from-anywhere, a person can lock a site for 2 hours without going. The one-active-task rule and the expiry limit the damage, but watch for repeat no-shows.

## Prod note
Migration 158 only changes three `game_settings` rows. Apply it on prod yourself, together with 146 to 157.

## Steps from taking it to completion

Both flows give 1 hour to get there, take the starting photo and pass the location check.

### Marketplace job
1. Take the job (cleaner profile, payouts set up, no other active task). The address unlocks and the 1 hour clock starts.
2. Travel to the site. Miss the hour and the job returns to the board.
3. Take the before photo within 500 ft (location check).
4. Start the job. The mobile app records your route and time on site.
5. Clean up. No time limit, but it auto-releases after 3 days of no progress.
6. Take after photo(s) with all bags visible, confirm the bag count, 3+ route points required.
7. Mark complete. The poster reviews, or it auto-approves after 3 days.
8. Payout: poster is charged, you are paid by Stripe transfer.

### Sponsored site
1. Claim it from anywhere (one active task, once per site per day). 1 hour clock starts.
2. Travel to the site. Miss the hour and the claim expires, site reopens.
3. Take the before photo within 500 ft (location check). A 2 hour work clock starts.
4. Clean up.
5. Take the after photo within 500 ft, with bag count where the site pays per bag.
6. Submit. An admin reviews the photos.
7. Payout from the sponsor's pool by Stripe transfer, capped per person and per day.
