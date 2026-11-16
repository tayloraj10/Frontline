# Earning flows manual test plan (2026-11-15)

Local only. Use the seeded fake users and test data (`POST /admin/seed/marketplace`, Stripe test mode). Log in as an admin, and use a second browser profile for a second earner or a poster.

Setup: re-run the marketplace seed so jobs and sites are fresh. Check Earn shows open jobs and sites.

## A. Marketplace job, unscheduled
1. Earn, Jobs: open an unscheduled job. Expect "You get 1 hour from taking it".
2. Take it. Expect: Earn shows "Your active task" card with a timer ("to arrive and start", about 1:00:00), no map, no chips, no browse lists. Normal content (Fund hub) still below.
3. Open the job page. Expect the next step at the top, address visible, site map, same 1 hour deadline.
4. Try to take a second job or claim a site. Expect a "one active task" error.
5. Let the timer pass (or set `marketplace_arrive_minutes` to 1 locally). Expect the job back on the board, notification, strike per rules.
6. Take it again, take the before photo far away. Expect a distance rejection (500 ft).
7. Take the before photo near (use a location override), start, add after photo, confirm bags, complete.
8. As the poster, approve. Expect charge and payout transfer.

## B. Marketplace job, scheduled
1. Open a job with a start time several hours out. Expect copy: the hour runs from the start time, you can arrive early.
2. Take it. Timer shows sky "until it starts, be there by <time>".
3. Back out before the start time: free. Take again, back out after the start time: strike.

## C. Sponsored site
1. Earn, map: pin popup says "Claim from anywhere, then you have 1 hour to get there" and the photo distance note.
2. Open the site page (How claiming works shows 1 hour, then 2 hours).
3. Claim from far away. Expect success, Earn takeover with timer "to take your before photo", the site map on the page and the card.
4. Popup and list for the same site now say "Yours" or "You claimed this site", not "Someone else".
5. As a second user the same site shows "Someone else is working it".
6. Before photo far away: expect a distance rejection (300 ft). Near: accepted, timer switches to "to finish and submit" (2 hours).
7. After photo, bag count (per-bag sites), submit. Admin reviews and approves. Expect payout transfer.
8. Release the claim yourself: site reopens. Let the before window lapse: site reopens, notification.
9. Claim the same site again the same day: expect once per site per day block.

## D. Caps and fraud rules
1. Sponsor your own site, try to claim it: blocked ("You sponsored this site").
2. Hit the per-person per-day cap: payout is capped, message clear.
3. Plus user sees early access sites, non-Plus sees "Plus members only for now".

## E. Group areas / events
1. Create a cleanup event inside a sponsored area, mark sponsored, check in attendees (only `checked_in_at` RSVPs count).
2. Verify payout per attendee, weekly group cap enforced, never above the sponsor's pool.

## F. Anonymous visitors
1. Logged out, Earn, Fund, a job page, a site page: visible only if `payments_admin_preview && payments_enabled`. Every action button locked with a login prompt.

## G. Layout checks
1. Desktop and mobile widths: active card, timer pill on two lines, chip on the Trash War map jumps to the task.
2. Active job and active site both: timer color (emerald, red under 5 minutes, sky when waiting for a scheduled start).

## Known gaps (not fixed)
- Jobs have no work-time limit, sites have 2 hours.
- Photo radius differs: 500 ft jobs, 300 ft sites.
- Sites have no strike for repeated no-shows.

## H. Phone app lock (production only)
1. In a prod build on desktop: take a job or claim a site works. Photo pickers, Start, Complete and site photo submit are disabled with an "Open the Frontline app" notice and store links.
2. In the native app: notice gone, everything works. Local dev: lock off.
