# User Gamification: Scoping (2026-10-17)

**Status: scoping only, nothing started.** Goal: improve user acquisition and retention through gamification. This doc collects the ideas from the 2026-10-17 app scan plus your feedback on each. Each idea needs its own deeper scoping before build. Related docs: `community-goals-scoping-2026-08-07`, `random-bonus-spots-scoping-2026-08-26`, `hotspot-hero-challenge-scoping-2026-08-27`, `team-events-phase2-scoping-2026-08-29`, `live-route-tracking-scoping-2026-08-22`, `group-event-route-tracking-scoping-2026-08-29`, `push-notifications-scoping-2026-08-06`.

Rule for everything here: the app is in production, so additive changes only, mobile-first design, and no migrations applied to prod by Claude.

## What already exists (do not rebuild)

- **Milestone ladders** on `/achievements`: points, bags, cleanups logged. Thresholds live in `game_settings` (category `milestones`), crossing one creates a `user_notifications` row (migration 063).
- **Weekly cleanup streak and weekly goal**, computed on `/users/[username]` and shown on the user's own profile only.
- **Leaderboards** that default to the current month (individual, group, geo-unit).
- **Competition and bonus surfaces**: boss events, timed hotspot multipliers, claim-a-report challenge, first-cleanup bonus.
- **Team events** (built, not used yet), group events, live route tracking, share cards.
- **Push pipeline** exists but is currently broken (iOS first). See todo.md Now.

## Decisions already made

- **Seasons: dropped.** Leaderboard already defaults to the current month.
- **Badges as a separate system: dropped.** Achievements already cover it. The collection book (below) is the variant that was liked.
- **Shareable "I just cleaned X bags" signup cards: low priority.** Groups already have something similar.
- **Return nudges via push** wait on the push fix.

## Priority order (proposed)

| # | Idea | Size | Blocked by |
|---|------|------|-----------|
| 1 | Public streak on profiles | Small | nothing |
| 2 | Multi-route challenge (see its own item in todo.md Now) | Large | scoping doc |
| 3 | Referral and invite rewards | Medium | nothing |
| 4 | Ebb-and-flow community goals | Large | scoping doc |
| 5 | Trash collection book | Large | scoping doc |
| 6 | Weekly rotating quests (incl. random bonus spots) | Large | scoping doc |
| 7 | Group social media content | Medium | scoping doc |
| 8 | Head-to-head competition (people and groups) | Medium | team events in real use |
| 9 | First-cleanup guide | Small | nothing |
| 10 | Streak expansion (grace week, lapse push) | Medium | push fix for the push part |
| 11 | Return nudges via push | Medium | push fix |
| 12 | Shareable signup cards | Small | low priority |

## 1. Public streak on profiles (do first)

**Problem:** the weekly streak is computed in `frontend/src/app/users/[username]/page.tsx` but only rendered on the viewer's own profile ("Weekly goal + streak: own profile only"). Other visitors never see it, so streaks do not work as social proof or as a reason to keep one going.

**Proposal:**
- Show the week-streak number on every public profile (keep the weekly goal progress own-profile only, since that is personal).
- Optionally show a small flame or streak chip next to the name on leaderboards and group rosters, later.
- No schema change expected: the streak is derived from contributions per week. Confirm the query already runs for other users' profiles, or whether it is gated and would need to run for any viewed profile.

**Open questions:**
- Should users be able to hide their streak? Probably not needed, but check privacy settings conventions.
- What counts toward a streak for other contribution types (reports, event attendance, the new winter-proof and greening actions)? Should be decided together with the new point-earning actions item in todo.md Now.

## 2. Multi-route cleanup challenge

Tracked as its own high priority item in todo.md Now. Scope in a separate doc, `multi-route-challenge-scoping`.

**The idea:** for cleanup events, instead of one set route, the route splits into 2 or more routes. Groups of attendees each follow one and compete.

**Things the scoping doc must answer:**
- How teams are assigned (organizer assigns, attendees pick, random, balanced by headcount).
- How routes are drawn and compared fairly (similar length, similar trash density, using trash report density and Hot Spot Hero clusters).
- What "winning" means: most bags, most weight, most points, per-person average (to handle uneven team sizes), or time to finish.
- How it uses live route tracking and group event route tracking, and what the event page and map show (per-route colors, live leaderboard).
- How points are credited to individuals vs teams, and how it fits the existing organizer-total and self-log modes.
- Whether it is built on team events (Phase 2 participation hierarchy) or on top of cleanup events.

**Variants to scope at the same time (liked):**
- **Relay:** routes share one combined total toward a target.
- **Checkpoint race:** routes have checkpoints to reach, first or most checkpoints wins.
- **Mixed:** routes compete and also contribute to a shared event goal.

## 3. Referral and invite rewards

**Gap:** no referral or invite mechanic exists anywhere in the code. This is the biggest acquisition gap.

**Proposal:**
- Every user gets a personal invite link and code. Signup via the link stores the referrer on the new profile.
- Reward both sides when the invited friend logs their **first verified cleanup** (not on signup, to avoid fake accounts). Reward is points, possibly a streak bonus.
- "Invite to my group" variant: the link also joins the invitee to the inviter's group.
- Show a small "Friends you brought in" count on the profile and an achievements ladder for referrals.

**Open questions:**
- Reward size, and per-user caps (anti-abuse). Tie to `game_settings` so admins can tune it.
- Do rewards count toward spendable points? Check the campaign `counts_toward_spendable_points` rules.
- Anti-fraud: same device, same email domain, burst signups. Reuse content flag and moderation tooling where possible.
- Native app: deep links for Capacitor (iOS universal links, Android app links), and what happens when the app is not installed.

## 4. Ebb-and-flow community goals (Helldivers 2 style)

Extends `community-goals-scoping-2026-08-07`, which is currently "Later". Promote it. The original scoping covers static shared targets. The new requirement is that goals **ebb and flow** so the app always feels like an active campaign.

**What "ebb and flow" could mean:**
- A goal with a target that scales with recent activity, so it is always reachable but never trivial.
- Progress that decays over time if nobody contributes, so people feel pulled to push it back up.
- Rotating objectives (this week: bags, next week: pounds, then zones cleaned), with a visible ending and a "we did it" or "we fell short" result.
- A shared meter (like a front line) that moves between two states, e.g. "clean" vs "littered" for a region, driven by contributions in the last N days.
- Rewards for everyone who contributed when a goal completes, via the existing notification and push pipeline.

**Scopes:** platform-wide (landing page hook), per campaign, per group, and later geo-scoped.

**Open questions:**
- Fairness and honesty of the numbers. A decaying meter must not feel fake. Show real contributions, the decay as a clear game rule.
- Admin control: where goals are authored, how rotation is scheduled, whether a cron advances them (Railway crons are now infrastructure as code, `.railway/railway.ts`).
- Whether goal completion reuses `campaign_events` (as noted in the original doc) instead of a new event system.

## 5. Trash collection book ("found items")

**Idea:** a collection of items people can try to find in the trash they pick up (tire, old bottle, shopping cart, etc). Photograph the item to fill in its slot. Replaces the earlier "badges" idea.

**Proposal:**
- Admin-editable catalog of collectible items with rarity tiers (common bottle, rare tire or bike). Seeded through the Seeder registry, never a standalone script.
- User collection page showing filled and empty slots, with progress per set (for example "Roadside set", "Waterway set").
- Filling a slot requires a photo, attached to a contribution. Points for first find of each item, bonus for completing a set.
- Photo verification: start with manual moderation and the existing photo flag flow, consider an image classification check later.

**Open questions:**
- How a photo gets tied to an item: user picks the item from the catalog when logging, or tags it afterward.
- Anti-abuse: reusing the same photo, staging items. Hash check on photos, per-item daily caps.
- Interaction with granular bag tracking and countable items (cigarette butts etc). These are counted for points, the collection book is for finds and bragging rights. Keep them separate.
- Public collection on profiles, plus a group collection.

## 6. Weekly rotating challenges and quests

**Idea:** short-lived quests that rotate weekly ("3 cleanups in different zips", "log a photo in a new neighborhood", "bring a friend"). Needs fleshing out before a doc can be written.

**Includes revisiting random bonus spots** (`random-bonus-spots-scoping-2026-08-26`). Hard requirement: a bonus spot must only be placed **where trash actually exists**, otherwise users walk to a spot and find nothing. Candidate sources for placement: open trash reports, Hot Spot Hero clusters, past cleanup density, and business proximity. Needs a rule for expiring a spot once cleaned.

**Also ties to:** the new point-earning actions item (greening, winter-proof, indoor) in todo.md Now, because quests are an easy place to feature cold-weather actions.

**Open questions:**
- Quest authoring: admin-defined templates plus automatic rotation vs fully manual.
- Reward shape: points, achievement entries, collection book items.
- How progress is shown (home screen card, map banner) and how quests interact with streaks.

## 7. Group social media content

**Why:** groups gain a lot from shareable content. If the app makes their posts easy and good-looking, it is a draw for groups and a free acquisition channel.

**First piece: post-event highlight reel.** Auto-generated recap per event: MVP, total bags and weight, attendee count, route map, photo grid. Shareable image or short card sized for Instagram and other platforms, plus a link to the event page.

**Other ideas to brainstorm:**
- Pre-event flyer generator (links to the Instagram flyer prefill scoping going the other direction).
- Monthly group recap (like the Plus monthly recap card, but for the group).
- Milestone posts: "Our group just hit 1,000 bags" cards triggered automatically.
- Before and after photo sliders from claimed reports.
- Route animation clip from live route tracking.
- Group branding (logo, colors) on all cards, with an "Open to sponsors" tie-in.
- A public group page that looks good when shared as a link (open graph preview images).

**Related:** share cards (Later in todo.md), `/impact` page, per-event impact report on `money-and-payments`.

## 8. Head-to-head competition (people and groups)

**Idea:** a way for competitive people and groups to compete directly. Team events are already built but have not been used, so look at how to wire them in rather than building a parallel system.

**Possible forms:**
- Group vs group challenge over a fixed period (most bags, most points per member to account for size).
- Friend duels between two users.
- Neighborhood or borough rivalries using the existing geo stats.
- Challenge invitations and acceptance flow, with a public scoreboard.

**Open questions:**
- Fairness (size handicaps, per-member averages), and how it differs from the leaderboard.
- Whether team events Phase 2 (participation hierarchy, event stats page, geofencing) must land first.
- Overlap with the multi-route challenge. Likely the same underlying "teams compete" model, so design them together.

## 9. First-cleanup guide

A first-cleanup bonus already exists. Add a **guided first log** or a short checklist (join a group, find a nearby report, log a cleanup, add a photo) so new signups reach one real contribution. Reuse the walkthrough components in `components/walkthrough/` and the empty-state prompts. Measure: signup to first contribution conversion.

## 10. Streak expansion

After the public streak (item 1):
- **Grace week or streak freeze** so one missed week does not zero a long streak, especially in winter. Could be earned or part of Plus.
- **Lapse warning push** ("your streak ends tomorrow"). Needs push fixed.
- **Streak milestones** (4, 12, 26, 52 weeks) added as a ladder on `/achievements`.
- **Streak on leaderboards and rosters** as a small chip.
- Decide which actions keep a streak alive once new point-earning actions ship (see item 1 open question).

## 11. Return nudges via push

Blocked on fixing push notifications (todo.md Now, `push-notifications-ios-debugging-2026-08-30`). After that, revisit: streak at risk, friend passed you, group event reminder, community goal nearly complete, new nearby trash report. Needs rate limits and a user preference per category to avoid fatigue. Use the fan-out design noted in `community-goals-scoping`.

## 12. Shareable "I just cleaned X bags" signup cards (low priority)

Cards that deep-link to signup. Groups already have something similar, so this is lowest priority. If built, it can share the card renderer with the group social media work (item 7) and the referral link (item 3).

## Cross-cutting concerns

- **Tuning values in `game_settings`**, admin-editable, not hardcoded.
- **Anti-abuse:** referrals, collection photos and head-to-head all create reasons to cheat. Reuse the content flags and moderation tooling, and add caps early.
- **Mobile first:** every new surface is designed for the Capacitor app first. Share and referral links need deep link handling.
- **Docs to update when anything ships:** `campaign-app-scope.md`, `external-docs/app-capability-doc.md` and its external companion.
- **Measure:** signup to first contribution, week-1 and week-4 retention, share-to-signup conversion, referral conversion. There is no analytics layer defined for these yet, so decide what to track before building.
