# Rewards browser test checklist

Run on the deployed site (Stripe test mode first). Use three accounts: a normal user, a beta user, an admin.

## 1. Access
- [ ] Normal user: no Earn, Hire or Impact in nav; direct URLs `/sponsorships`, `/marketplace`, `/impact` are blocked
- [ ] Beta user: all three show
- [ ] Admin: all three show
- [ ] Beta user cannot flag themselves (profile update does not change `rewards_beta`)

## 2. Hire (customer)
- [ ] Post a job (map pin, price, fee shown on top)
- [ ] Pay by card, job goes live
- [ ] Cleaner accepts, customer sees status change
- [ ] Before/after photos show
- [ ] Confirm completion, payment releases
- [ ] Cancel an unaccepted job, refund arrives

## 3. Hire (cleaner)
- [ ] Become a cleaner, finish Stripe onboarding
- [ ] Browse jobs, take one
- [ ] Before photo, start, after photo, complete
- [ ] Payout shows in Stripe
- [ ] Open a dispute, resolve it as admin

## 4. Earn
- [ ] Set up payouts (Stripe onboarding), status turns ready
- [ ] "View earnings in Stripe" opens the dashboard (was a 500)
- [ ] Fund a sponsored area, build an area, attach an event
- [ ] Approve an individual allocation, transfer succeeds

## 5. Group payouts
- [ ] Group admin: "Set up group payouts" on the group edit page, finish Stripe
- [ ] Non-admin: card hidden, API returns 403
- [ ] Group with no account: clear error attaching a sponsored event or funding directly
- [ ] Approve a group allocation: pays the group account
- [ ] Approve one before setup, finish setup, it pays automatically

## 5b. Hire: active job, strikes and chat
- [ ] Taking a job swaps the Hire home for the active job view; other Hire pages show the green banner
- [ ] Cannot take a second job while one is active
- [ ] "Start by" time shows on the job and banner; after it passes and the sweep runs, the job returns to the board and the cleaner gets a strike
- [ ] "Back out" on the home view returns the job to the board; after the start time it counts as a strike
- [ ] 3 strikes in 90 days suspends the cleaner (cannot take jobs); admin can reinstate under "Cleaners with strikes"
- [ ] Sending a phone number, email, link or "venmo me" in a job chat is refused
- [ ] Abusive or threatening message sends but appears in admin "Flagged messages"; "Mark reviewed" clears it
- [ ] Admin "Recent chats" opens any job conversation with flagged messages highlighted

- [ ] Open job page shows the amber "You must start by <time>" box with the real local time
- [ ] Viewer without a cleaner profile or signed agreement sees "Set up as a cleaner first" and Take is disabled; set-up users do not see it
- [ ] Accepted job page shows a red, obvious "Back out" button
- [ ] Accepted and active job pages show a map with coordinates, "Navigate" and "Apple Maps" links
- [ ] Starting after the deadline is refused and the job goes back to the board
- [ ] Messages section is collapsed by default; "What is this for?" expands the rules
- [ ] Seeded $90 job shows the cleaner receiving $90.00
- [ ] Cleaner profile page shows a "Your strikes" card (count of limit, reason, job, date, drop-off date) only when they have at least one strike
- [ ] Hire board shows 20 jobs with a "Show more" button. "Near me" re-sorts nearest first and "Show more, farther away" keeps going with no radius cutoff. Changing the job type filter restarts the list
- [ ] Map shows pins for every open job (up to 300 nearest), heading reads "Open jobs (20 of N)" with the true total, and a pin not yet in the list hides "Show in list" but keeps "View"
- [ ] Job with a radius or drawn area: the job page map shows the green circle or outline for everyone viewing an open job and for the customer and cleaner after. "Navigate" and "Apple Maps" show only for the cleaner who took it. The written address stays hidden until taken. The main board map shows no circles
- [ ] Admin "Marketplace moderation" button sits at the top of the Hire page, under the tabs

## 6. Impact
- [ ] Page loads with numbers, no console errors
- [ ] Numbers match what you just did in Hire and Earn

## 7. Security and ops
- [ ] `/sweep` without the secret returns 403
- [ ] Sweep cron runs every 15 minutes (check `service_heartbeats`)
- [ ] Stop the cron for 45+ minutes, admins get the alert
- [ ] Stripe webhook shows `charge.dispute.created` and `transfer.reversed` subscribed

## 8. Mobile (phone browser, then the app)
- [ ] Hire post, browse and cleaner flow: tap targets, no horizontal scroll
- [ ] Earn pages and the map
- [ ] Group payout card
- [ ] Stripe onboarding returns to the right page
