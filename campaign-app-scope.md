# Frontline — Project Scope

## 1. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js + TypeScript | Web-first, React Native for mobile post-MVP |
| Styling / Animation | Framer Motion + GSAP | UI transitions + heavy map/campaign animations |
| Map Engine | MapLibre GL JS | Open source, highly customizable, SVG/canvas overlay support |
| Basemap | CartoDB Voyager (current) → **MapTiler Streets** (planned) | CartoDB is free/no-key. Switch to MapTiler Streets (free API key at maptiler.com) for Google Maps-quality styling — just a tile URL + key swap in `MAP_STYLE`. |
| Backend API | FastAPI (Python) | Hosted on Railway or Cloud Run (see note below) |
| Database | Supabase (PostgreSQL + PostGIS) | Includes Auth, Realtime, Row Level Security. PostGIS enabled by default. |
| Geo Libraries | GeoAlchemy2 + Shapely (Python) | Spatial queries and geometry processing in FastAPI |
| File Storage | Cloudflare R2 | Zero egress fees, S3-compatible, Cloudflare CDN in front |
| Hosting (Frontend) | Vercel | Free tier covers MVP, seamless Next.js support |
| Hosting (Backend) | Railway | Always-on, ~$5/mo, git push deploy |

### API Architecture
```
Next.js → Supabase PostgREST      (all standard CRUD)
Next.js → Supabase Edge Functions  (presigned URLs, lightweight logic)
Next.js → FastAPI                  (geo-processing, territory calculation, event engine, decay jobs, MVT tiles)
Next.js → Supabase Realtime        (websocket subscriptions)
```

FastAPI is background/async only — not in the critical user-facing path. Cold starts are acceptable, so hosting can go either way:
- **Railway (~$5/mo)** — always-on, simpler DX, good if job frequency is high
- **Cloud Run (min-0, ~free at low traffic)** — cold starts fine for background jobs, cheaper at low scale

Decision can be deferred — the code is identical either way, just a deployment target change.

If migration off Supabase is ever needed, PostgREST endpoints are pure SQL — replicating them in FastAPI is mechanical work, not architectural work.

### PostGIS
PostGIS is required for all geographic operations. Supabase ships with it enabled by default — no setup needed. Key use cases:
- `GEOGRAPHY(POINT)` columns for storing GPS coordinates
- Point-in-polygon: determining which census tract a GPS submission falls inside
- Proximity validation: confirming a submission is within X meters of a claimed tract
- Viewport queries: fetching only contributions/territory within the current map bounds
- Distance calculations between points
- **MVT tile generation** via `ST_AsMVT()` + `ST_TileEnvelope()` for serving geography at scale

On the FastAPI side, use **GeoAlchemy2** for PostGIS-aware SQLAlchemy queries and **Shapely** for any in-memory geometry processing. Census tract boundaries sourced from Census Bureau TIGER/Line files (free).

### Map Rendering Architecture

Geography (zip codes, census tracts, states) and user-submitted data are served separately:

**Geometry layer — Vector tiles (MVT)**
- FastAPI endpoint: `GET /api/tiles/{campaign_id}/{z}/{x}/{y}.mvt`
- PostGIS generates tiles on demand via `ST_AsMVT()`. Only features intersecting the current viewport tile are returned — no bulk transfer.
- Response is binary protobuf with `Content-Type: application/x-protobuf`
- Tiles are static (geometry never changes) and can be cached aggressively at the CDN layer
- Each feature carries `geo_unit_id` as its MVT feature ID for client-side state lookup

**Dynamic data layer — Regular fetch + MapLibre feature-state**
- `territory_claims` fetched on page load (only claimed rows — a small subset of total geo units)
- MapLibre's `setFeatureState(featureId, { color, totalValue })` applies claim colors to tile features without re-fetching geometry
- Supabase Realtime pushes individual claim updates → `setFeatureState` called surgically on just the changed feature
- Net result: Total War-style territory coloring that updates live, with zero tile re-requests on claim changes

This separation scales to campaigns with 32k+ geographic units (e.g., all US zip codes) without bandwidth or memory issues on the client.

### Cost Estimate at Launch
- Supabase Pro: $25/mo
- FastAPI: Railway $5/mo or Cloud Run ~free at low traffic
- Vercel: Free (upgrade to $20/mo if multi-environment needed)
- Cloudflare R2: Free up to 10GB, then usage-based
- **Total floor: ~$25-30/mo**

### Portability Notes
- Database is standard Postgres — switching hosts is a connection string change + `pg_dump`
- FastAPI is containerized — portable to Railway, Cloud Run, ECS, Fly.io, or any VM
- R2 is S3-compatible — SDK code is nearly identical to AWS S3
- Auth is Supabase Auth (stickiest dependency — plan accordingly)
- PostgREST CRUD can be replicated in FastAPI if moving off Supabase — mechanical not architectural

---

## 2. App Purpose & Vision

### Core Concept
A gamified social good platform where users participate in large-scale **campaigns** — collective goals that no individual or group can accomplish alone. The app unifies people through shared action, tracks real-world impact, and visualizes progress through a stylized geographic map inspired by strategy games (Total War aesthetic — territory, factions, dynamic events).

### The Core Loop
1. A **Campaign** is created with a geographic scope, a goal threshold, contribution type, and win/decay conditions
2. **Groups** (nonprofits, clubs, community orgs) and **Individuals** join campaigns and contribute actions
3. Contributions are logged (photo + proximity validation, honor system for MVP)
4. Progress is visualized live on the map — territory changes hands, regions fill, animations fire
5. **Dynamic events** keep campaigns alive: boss events spawn, territory decays, cascading unlocks trigger
6. Social layer (profiles, group pages, activity feed) makes participation sticky and visible

### Two Participation Layers
- **Contribution layer** — log your action (cleanup, photo, registration, etc.), primary purpose
- **Territory/meta layer** — optional competitive overlay, leaderboards, tract claiming (think Strava segments vs. the main run log)

### Groups
- Organizations can register, build a profile, and participate as a collective unit
- Group members contribute individually but their actions roll up to group totals
- Unaffiliated individuals can also participate in any campaign
- Groups can "claim" territory in competitive campaigns

### Social Layer
- User profiles with contribution history and impact stats
- Group pages with member lists, campaign participation, and achievements
- Activity feed showing recent contributions across the map
- Push notifications for boss events, territory changes, campaign milestones

---

## 3. Campaign Examples & Data Visualizations

### Campaign Engine Design
Each campaign is its own mini-game running on a shared geographic foundation. The engine supports:

| Component | Description |
|---|---|
| `base_layer` | Geographic scope + map style (territory, collage, heatmap, choropleth) |
| `win_condition` | Threshold, deadline, or open-ended |
| `contribution_type` | Cleanup bags, photos, voter registration, time outdoors, etc. |
| `scoring_rules` | How contributions map to territory/progress |
| `event_triggers` | Conditions that fire dynamic events |
| `active_events` | Currently live modifiers on the campaign |

### Dynamic Event System (Helldivers 2 Model)
- **Boss events** — limited-time surge challenges tied to real events ("Oil spill reported in Lake Erie — 72hrs to respond")
- **Decay** — territory un-claimed if no activity for X days, creates ongoing tension
- **Counter-reporting** — users can report trash/problems to trigger boss events (verified with photo + location)
- **Cascade unlocks** — hitting milestones unlocks new features, zones, or campaign types
- **Seasonal resets** — competitive maps reset quarterly with weighted scoring to help smaller groups compete
- **Weather integration** — NOAA / Open-Meteo APIs (free) can trigger real-world weather events on the map (post-MVP)

### Event System — Implementation Status

#### How the trigger pipeline works
1. A contribution is submitted → FastAPI `POST /api/contributions/process` runs point-in-polygon, upserts `territory_claims`, then enqueues `_evaluate_triggers` as a background task.
2. `_evaluate_triggers` loads all `is_active = TRUE` triggers for the campaign and evaluates their conditions.
3. If a condition is met and no duplicate active event exists, a row is inserted into `campaign_events`. `campaign_events` is on Supabase Realtime, so the frontend receives the event live.

#### Condition types
| Condition | Status | Notes |
|---|---|---|
| `threshold_reached` | ✅ Implemented | Fires when campaign-wide or geo-unit total crosses a numeric threshold |
| `report_count` | ✅ Implemented | Fires when open problem reports in a geo unit reach a count threshold |
| `time_elapsed` | ✅ Implemented | `_check_time_elapsed_trigger` handler implemented in `events.py` |
| `decay_elapsed` | ❌ Not implemented | In DB schema only, not in admin UI or evaluator. Nothing sets `territory_claims.decay_starts_at`, so the deployed decay cron (`POST /api/decay/run`) is currently a no-op — it has no rows to act on |
| `external_api` | ❌ Not implemented | In DB schema only, not in admin UI or evaluator |
| `group_tie` | ❌ Not designed yet | Not in DB schema or evaluator. Idea: detect when two groups are tied (or within a small margin) on contribution totals for the same geo unit. Requires aggregating `contributions` by `(geo_unit_id, group_id)` since `territory_claims` only stores the current claimant, not per-group totals — no existing table tracks runner-up standings. Proposed first version: don't auto-spawn an event; fire a `notification` to admin users so they can review and manually create an event (boss spawn, tiebreaker challenge, etc.) rather than guessing the right automatic response. |

#### Event types
| Event type | Status | Notes |
|---|---|---|
| `boss_spawn` | ✅ Implemented | Event record created, displayed on map with icon. Active `score_multiplier` events are fetched and applied to `effective_value` in `submit_contribution` |
| `notification` | ⚠️ Stub | Event record created but no message is dispatched — users are not notified |
| `cascade_unlock` | ⚠️ Stub | Event record created but no unlock handler reads the `unlocks` key |
| `seasonal_reset` | ⚠️ Stub | Event record created but no reset logic runs |
| `decay_start` | ⚠️ Stub | Event record created but no decay logic is triggered by it |
| `timed_event` | ✅ Implemented | Admin-manual only (never fired by `event_triggers`) — a dedicated event type for timed, multi-area bonus events. Created via `EventsTab` in the admin panel (map picker shown only for this type, with a unit-type selector when a campaign has more than one configured `geo_unit`) or a new admin-only "✨ New Timed Event" button on the campaign page itself (`CreateTimedEventButton`), both sharing one form (`TimedEventForm`) and one creation function (`createTimedEvent` in `lib/events.ts`). The admin-panel flow picks areas via an embedded `EventAreaMapPicker` (`mode="multi"`); the campaign-page flow instead lets the admin pick areas directly on the live `CampaignMap` (area-picker mode: click territories to toggle selection, confirm/cancel toolbar), avoiding a second embedded map. Areas are stored via `campaign_event_geo_units`. Duration is entered as separate days/hours/minutes inputs and combined into minutes (0 = indefinite) before being sent. Uses the same `effect_config: {type: "score_multiplier", multiplier}` shape as `boss_spawn`; `/active-multiplier` checks both the legacy `geo_unit_id` column and `campaign_event_geo_units` so the multiplier applies correctly in every selected area, not just the first. Map markers get a distinct ✨/amber-gold style vs. `boss_spawn`'s 🔥/red. |

#### What works today if you create a trigger
Creating a `threshold_reached` or `report_count` trigger through the admin panel will work end-to-end: the condition evaluates after every contribution, the event fires once when met, deduplicates against active events, and the `campaign_events` row is stored and surfaced in the admin events tab. The **effect** of the event (score bonus, notification, unlock, reset, decay) is not implemented for any type yet — that is the next layer to build.

---

### Campaign Status — Implementation Gap

The `campaigns` table has a `status` field constrained to `draft | active | paused | completed`. The admin panel lets you set and change status. However, **status is only enforced on the frontend** — the backend has no guards anywhere.

| Status | Frontend behavior | Backend behavior |
|---|---|---|
| `draft` | Hidden from `/campaigns` listing and homepage count | Contributions rejected (403), trigger evaluation skipped |
| `active` | Visible publicly; all features work normally | Contributions accepted, triggers evaluate normally |
| `paused` | Hidden from public listing (same as draft) | Contributions rejected (403), trigger evaluation skipped |
| `completed` | Hidden from public listing | Contributions rejected (403), trigger evaluation skipped |

#### What still needs to be built
- **`completed` transition logic:** Optional — auto-set status to `completed` when `ends_at` is passed or a win condition is met

---

### Campaign Create Form — Known Gaps

#### Contribution types
The four options (`cleanup`, `photo`, `registration`, `advocacy`) were defined to match the first four campaigns exactly. They are confusing out of that context — a new campaign creator has no way to know which one applies to their use case or what the label actually controls. What needs to be done:
- Decide whether `contribution_type` stays a fixed enum or becomes a free-text/configurable field
- If keeping the enum: rename the options to be more generic and self-describing (e.g. `physical_action`, `media_submission`, `civic_action`, `awareness_action`)
- Add a description below the select (same pattern as event type info panel) explaining what each type controls at runtime

#### Geo unit — census_tract
`census_tract` appears in the dropdown and in the DB `CHECK` constraint but **no census tract data is loaded anywhere** — there is no `/admin/load-geo-units/census-tracts` route and no seeder for it. Selecting census_tract when creating a campaign will produce a campaign with no geo units, meaning contributions will fail point-in-polygon matching and be rejected.

What needs to be done:
- Remove `census_tract` from the create form dropdown until a loader is built, **or** build the loader
- If building the loader: Census Bureau TIGER/Web API has tract GeoJSON by state FIPS — same pattern as the ZIP loader
- `point` is also in the dropdown; verify whether point-based campaigns work end-to-end before exposing it

---

### Campaign 1: Trash War 🗑️
**Concept:** Territory control map where cleanups claim geographic units (census tracts). The more bags/pounds cleaned in a tract, the stronger the claim.

**Map Style:** Total War-style territory map, census tract boundaries, faction colors per group

**Contribution:** Log cleanup with photo + weight/bag count + GPS location

**Scoring:** Pounds cleaned → territory strength. Highest cumulative cleaner in a tract owns it. Decay after X days of inactivity.

**Special Mechanic:** Users can also *report* trash (photo + location). Enough reports in a tract triggers a **Boss Event** — a visual trash pile grows on the map and a surge challenge fires with bonus XP for cleaning it.

**Visualization:** Animated trash pile that grows with reports and shrinks with cleanups. Territory pulses when claimed. Heat map overlay showing historical activity.

**Dynamic Events:**
- Trash pile boss events from community reports
- "Mega haul" bonus when a single cleanup exceeds threshold
- Seasonal reset with weighted scoring (smaller groups get multiplier)

---

### Campaign 2: Road to Independence 🗳️
**Concept:** Civic action campaign for America's 250th anniversary. Users log real-world civic actions to grow the independence movement and break free from the two-party system.

**Map Style:** US political choropleth — states colored by civic engagement density

**Contribution (7 accepted actions):**
1. Re-register as Independent (primary focus — move away from Democrat/Republican)
2. Attend a town hall or city council meeting
3. Contact your representative (call, letter, email)
4. Volunteer for a local civic organization
5. Visit a historical landmark
6. Attend a protest or rally
7. Read a founding document in full

**Scoring:** Each logged action contributes to state-level progress. `contribution_type = civic_action`, action subtype stored in scoring_rules.action_types.

**Dynamic Events:**
- Election season surge events
- State "flips" when threshold reached — triggers celebration animation
- Leaderboard of most active states

---

### Campaign 3: Touch Grass 🌿
**Concept:** Encourage people to go outside. Photo submissions fill the map like a giant geographic photo collage.

**Map Style:** Real map covered in user photo thumbnails pinned to submission location — becomes a living mosaic

**Contribution:** Submit a photo of yourself enjoying the outdoors with GPS location

**Scoring:** Coverage — the goal is filling the map with photos. Density visualization shows hotspots and blank spots.

**Visualization:** Photos appear as pins that expand into thumbnails. Blank regions of the map are visually "dull/gray" until covered. Collage fills in over time.

**Dynamic Events:**
- Weather tie-in: heat waves "wilt" the map in affected regions requiring more submissions
- Seasonal push events ("First Day of Summer Challenge")
- Regional leaderboards for most submissions per capita

---

### Campaign 4: BRAINROT 🧠
**Full name:** Building Resistance Against Influencers, Narcissism, Ragebait, Overconsumption, and Time-wasting

**Concept:** Log every account you unfollow — rage-bait political commentators, content farms, clout chasers, cringe humor accounts. The leaderboard tracks which accounts are being dethroned the most globally.

**Map Style:** Global heatmap — density of people doing the digital detox, by location

**Contribution:** Required — account handle you unfollowed (stored in `notes`). Optional — photo. Location captured for heatmap.

**Scoring:** Each unfollow = 1 point. Secondary "Dethrone Leaderboard" aggregates `notes` values to rank accounts by total unfollows received.

**Visualization:** Heat clusters show where the detox movement is spreading. Dethrone leaderboard shows most-unfollowed accounts.

---

### Campaign 5: Solarpunk 🌱

**Concept:** A cooperative, globally scoped campaign to document, grow, and celebrate the real-world solarpunk movement. Players log real-world actions, submit photos of existing solarpunk infrastructure and culture in the wild, and collectively "bloom" a world map from industrial gray to lush illustrated green. No territory competition — the whole map wins together.

**Map Style:** Global H3 hex grid (resolution 5, ~250 km² per hex). Each hex is rendered with a solar panel aesthetic — dark surface, subtle internal grid lines, metallic border — before blooming. As the collective Bloom Score grows, hexes visually transform through staged illustrations:

> **Stage 0** — Dark solar panel grid (default / unseeded)
> **Stage 1** — Cracked asphalt with weeds pushing through
> **Stage 2** — Garden beds, rain barrels, rooftop solar
> **Stage 3** — Full canopy, murals, community structures
> **Stage 4** — Thriving solarpunk district (max bloom — warm yellows and greens, illustrated style)

Pre-seeded hexes start at Stage 1–2 based on real-world data for cities and countries already aligned with solarpunk values.

**Three Contribution Pillars:**

1. **Action Log** (self-reported, like Road to Independence) — categorized actions with point values, each contributing to the Bloom Score of the player's current H3 hex
2. **Solarpunk in the Wild** (geotagged photo submission, like Touch Grass) — photos of real-world solarpunk sightings: community gardens, solar arrays, living walls, mutual aid fridges, repair cafes, urban farms. Each validated photo adds to the hex's Bloom Score and feeds a per-hex photo collage panel
3. **Collective Milestones** — when a hex reaches a Bloom Stage threshold, every contributor to that hex receives a celebratory unlock (illustrated badge, "Blueprint" card previewing the next stage). No individual winner — earned together

**Action Categories & Point Values:**

*Green Infrastructure & Biodiversity*
- Planted a tree or native plant (+3)
- Started or joined a community garden (+3)
- Installed a green roof or living wall (+3)
- Created a rain garden or bioswale (+2)
- Set up a compost system (+2)
- Participated in a rewilding effort (+2)
- Installed a bird/bat/bee habitat (+1)
- Restored a natural area — beach, trail, wetland cleanup (+2)

*Energy & Green Technology*
- Installed solar panels — home or shared (+4)
- Joined a community energy co-op (+3)
- Switched to a renewable electricity provider (+2)
- Repaired something instead of replacing it (+1)
- Attended a repair cafe (+1)
- Reduced home energy consumption — insulation, smart thermostat (+2)
- Switched to an e-bike or cargo bike (+2)

*Food Systems*
- Joined a CSA or food co-op (+2)
- Grew your own food (+2)
- Preserved, fermented, or reduced food waste (+1)
- Participated in urban foraging (+2)
- Contributed to a seed library (+2)
- Sourced a meal entirely locally (+1)

*Mutual Aid & Social Change*
- Contributed to a mutual aid network (+2)
- Organized or attended a skill share (+2)
- Started or used a tool/resource library (+2)
- Supported a worker-owned cooperative (+2)
- Participated in local governance or a community meeting (+1)
- Helped a neighbor with something tangible (+1)

*Built Environment & Mobility*
- Advocated for bike infrastructure or public transit (+2)
- Chose public transit or bike over car (+1)
- Participated in a walkability or placemaking project (+2)
- Contributed to co-housing or intentional community (+2)

*Art, Culture & Education*
- Created or commissioned solarpunk art or a mural (+2)
- Ran or attended a solarpunk education event (+2)
- Published or distributed a zine or guide (+1)
- Upcycled clothing or materials into something new (+1)

*Water*
- Installed a rain barrel or greywater system (+3)
- Participated in watershed or wetland restoration (+2)
- Reduced household water consumption significantly (+1)

**Scoring:**
- Each logged action contributes to the `bloom_score` of the player's H3 hex (determined by GPS location at submission)
- Photo submissions add a fixed +2 to the hex's bloom_score after basic review
- Hex stage thresholds (example): 0 → 50 → 200 → 600 → 1500 total bloom points
- No competitive leaderboard — a global "World Bloom Score" tracks collective progress. Regional leaderboards show most-bloomed cities/countries for discovery, not competition

**Pre-Seeding — Existing Solarpunk World:**
Research-backed baseline scores seeded into specific hexes at campaign launch, reflecting real-world leadership in renewable energy, green infrastructure, and community cooperation. Pre-seeded hexes are visually distinct at launch — showing a world already partially bloomed — with an info panel explaining why that area is highlighted.

*Candidates to research and validate scores for:*
- Iceland (near-100% renewable energy)
- Denmark / Copenhagen (cycling infrastructure, wind energy, district heating)
- Costa Rica (biodiversity, renewable electricity)
- Bhutan (carbon negative, Gross National Happiness policy)
- Germany (Energiewende, community solar — Freiburg especially)
- Uruguay (high renewable electricity share)
- Singapore (vertical gardens, integrated urban greenery)
- Medellín, Colombia (urban transformation, green corridors)
- Curitiba, Brazil (bus rapid transit, urban parks)
- Amsterdam (cycling modal share, circular economy programs)
- Vienna (social housing density, public transit quality)

Each pre-seeded hex stores a `seed_source` note (e.g., "IEA 2024: 99% renewable electricity share") for transparency.

**Visualization:**
- World map with full H3 resolution-5 hex grid overlay
- Hex illustration shifts through bloom stages as collective score grows (GSAP transitions)
- Per-hex photo collage panel: thumbnail grid of "Solarpunk in the Wild" submissions for that area
- Animated global Bloom Score counter
- "Bloom wave" ripple animation when a hex advances to a new stage
- Pre-seeded hexes show a distinct "existing leader" glow before user actions begin

**Dynamic Events:**
- **Solarpunk Spotlight** — weekly featured hex: most-active hex gets a highlighted border, surfaced in the activity feed globally
- **Bloom Burst** — when a hex advances a full stage, neighboring hexes get a temporary score multiplier (spreading the wave)
- **Infrastructure Milestone** — global event tied to real-world news (e.g., a country crosses 50% renewable) — celebratory announcement + bonus points for that country's hexes
- **Seasonal campaigns** — spring planting drive, repair cafe month, water conservation sprint

---

### Campaign 6: Ground Truth 🌍 *(post-launch)*
**Concept:** Crowdsourced global news — people submit events, incidents, and stories from their location with a photo and short description. A living map of what's actually happening on the ground, unfiltered by media gatekeepers.

**Map Style:** Global point map — event pins clustered by proximity, expanding into cards on click. Density heatmap toggle to see activity hotspots.

**Contribution:** Photo + title + short description + GPS location. Optional: category tag (protest, natural event, infrastructure, community, etc.)

**Scoring:** Open-ended — each submission adds a pin. No territory. Leaderboard by most submissions (per user/group) and most-viewed reports.

**Visualization:** Live wire of pins appearing globally. Cluster bubbles show density. Clicking a cluster expands to individual event cards with photo, timestamp, and description.

**Moderation:** Community flagging + threshold-based auto-hide. Verified contributors (groups) get a badge. Phase 1 is honor system — heavier moderation post-launch.

**Post-launch priority:** UI and moderation complexity are high. Ship after the core 4 campaigns are stable.

---

### Campaign 7: Life Detox 🧩 *(future — board game campaign type)*

**Concept:** A personal journey campaign where each user moves a piece along a board by completing real-life steps to break unhealthy digital habits. Inspired by the BRAINROT campaign theme but driven by personal linear progression rather than a collective geographic map. The board is the same for everyone; your piece's position is your own.

**Campaign type:** `board_game` *(new type — not yet implemented)*

**Why this needs a new campaign type:** All current campaign types (territory, collage, choropleth, heatmap) are map/geography-centric and visualize collective action across a geographic plane. A board game campaign tracks per-user linear progress along a defined sequence of steps. It needs a board UI instead of a MapLibre map, per-user position state, and step-gated contribution forms.

**Board concept — "30 Steps Off the Grid":**
Each space on the board is a concrete detox action. Completing the action (via a logged contribution) advances your piece. Other players' pieces are visible on the board — social pressure and celebration are built in.

*Example spaces:*
1. Unfollow 5 rage-bait or clout-chasing accounts
2. Turn off all non-essential push notifications
3. Set a daily screen time limit and stick to it for 3 days
4. Delete one social app for 7 days
5. Replace one doom-scroll session with going outside
6. Read a book (not an article, a book) for 30 minutes
7. Cook a meal instead of ordering delivery
8. Have a phone-free dinner
9. Go 24 hours without opening any social app
10. Introduce a friend to the detox and get them to join
11. Spend a full weekend morning outside before touching your phone
12. Audit your subscriptions and cancel one you don't use
13. Replace social media time with a new hobby for one week
14. Document your screen time before/after — share the diff
15. Complete the board: log your final reflection

**Data model additions needed:**
- `board_steps` array in campaign `scoring_rules` JSONB — each step has an id, title, description, and completion criteria
- Per-user position tracking — either a new `user_campaign_progress` table (`user_id`, `campaign_id`, `current_step`, `completed_steps[]`) or derived from ordered contributions
- Step-gated contribution form — UI shows only the current step's task; submitting a contribution advances position

**Visualization:**
- Linear or winding board path rendered in the campaign detail view (replaces MapLibre map)
- Each space shows a name, icon, and completion count across all players
- Your piece highlighted; other players' pieces visible for social context
- Celebration animation when advancing spaces (GSAP)
- Global leaderboard: who is furthest along the board

**Post-launch priority:** Requires new `campaign_type` enum value, new board UI component, and per-user progress tracking. Not geo-dependent — no PostGIS required for this campaign type.

---

### Campaign 8: Full Life 🥗 *(future — health & lifestyle campaign)*

**Concept:** A cooperative health campaign where users log real-world healthy choices across food, movement, sleep, and lifestyle. No competition — the whole community wins together as collective healthy actions accumulate. Designed to be encouraging and habit-building, not a calorie counter or fitness tracker.

**Campaign type:** `choropleth` or `heatmap` *(geographic density of healthy activity, or a new cooperative type)*

**Contribution pillars:**

*Food & Nutrition*
- Cooked a meal from whole ingredients (+2)
- Ate a vegetable or fruit as a snack instead of processed food (+1)
- Meal prepped for the week (+3)
- Went to a farmers market (+2)
- Tried a new healthy recipe (+1)
- Reduced or eliminated a processed food for a week (+2)
- Ate mindfully — no screens, sat down, full meal (+1)

*Movement & Exercise*
- Walked or biked instead of driving — any trip (+2)
- Completed a workout — any kind, any duration (+2)
- Went for a walk of 20+ minutes (+1)
- Tried a new physical activity or sport (+2)
- Stretched or did mobility work (+1)
- Reached 10,000 steps (+2)
- Worked out with a friend or group (+2)

*Sleep & Recovery*
- Got 7–9 hours of sleep (+2)
- Kept a consistent sleep/wake time for 3 days (+2)
- No screens 30 minutes before bed (+1)
- Took a genuine rest day (+1)

*Mental & Lifestyle*
- Meditated or did breathwork (+2)
- Spent time in nature for mental health (+1)
- Journaled (+1)
- Connected with a friend or family member in person (+2)
- Did something creative (+1)
- Reduced or eliminated alcohol for a week (+3)
- Quit or reduced caffeine dependency (+2)

**Scoring:** Each logged action contributes to a global "Vitality Score" — a single collective number climbing over time. Geographic visualization shows where the health movement is densest. Individual streaks tracked on user profiles.

**Visualization:**
- Global heatmap or choropleth showing health action density by location
- Vitality Score counter animated on the campaign hero (similar to Solarpunk's Bloom Score)
- Personal streak tracker — consecutive days with at least one logged action
- "Health wave" — when a region crosses a threshold, neighboring regions get a temporary multiplier
- Weekly featured category (e.g., "This week: Sleep Week — sleep actions worth 2x")

**Dynamic Events:**
- Weekly category spotlights (double points for a specific pillar)
- "Community Challenge" — e.g., collectively log 10,000 workouts this month
- Seasonal pushes — New Year habit streaks, summer fitness challenge, mental health month

**Post-launch priority:** Data model is compatible with existing architecture (point contributions, scoring_rules for action categories). Main work is the contribution form with category/action picker and the streak tracking UI on user profiles.

---

## 4. Data Models

### Core Schema

```sql
-- Users (managed by Supabase Auth, extended here)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  total_contributions INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups (orgs, clubs, movements)
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  website TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group membership
CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- 'admin' | 'member'
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- Campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  campaign_type TEXT NOT NULL, -- 'territory' | 'collage' | 'choropleth' | 'heatmap'
  contribution_type TEXT NOT NULL, -- 'cleanup' | 'photo' | 'registration' | 'advocacy' | 'civic_action' | 'unfollow'
  geo_scope JSONB, -- bounding box or region list
  geo_unit TEXT, -- 'census_tract' | 'zip' | 'state' | 'point'
  win_condition JSONB, -- { type: 'threshold', value: 10000, unit: 'lbs' }
  scoring_rules JSONB, -- how contributions map to territory/progress
  status TEXT DEFAULT 'active', -- 'draft' | 'active' | 'completed' | 'paused'
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geographic units (census tracts, states, etc.)
CREATE TABLE geo_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL, -- census tract FIPS, state FIPS, etc.
  unit_type TEXT NOT NULL,
  geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL, -- PostGIS boundary polygon (indexed for spatial queries)
  geojson JSONB, -- cached GeoJSON for frontend rendering
  display_name TEXT,
  UNIQUE(campaign_id, unit_id)
);

-- Contributions (the core action log)
CREATE TABLE contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  group_id UUID REFERENCES groups(id), -- nullable, if contributing as group member
  geo_unit_id UUID REFERENCES geo_units(id),
  contribution_type TEXT NOT NULL,
  value NUMERIC, -- bags, lbs, minutes, count depending on campaign
  photo_url TEXT,
  location GEOGRAPHY(POINT, 4326), -- PostGIS point, used for proximity validation + tract assignment
  location_verified BOOLEAN DEFAULT FALSE,
  notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ -- null until validated
);

-- Territory claims (derived from contributions, updated async)
CREATE TABLE territory_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  geo_unit_id UUID REFERENCES geo_units(id),
  claimed_by_user UUID REFERENCES profiles(id),
  claimed_by_group UUID REFERENCES groups(id),
  total_value NUMERIC DEFAULT 0, -- cumulative score in this unit
  last_contribution_at TIMESTAMPTZ,
  decay_starts_at TIMESTAMPTZ, -- when territory starts decaying
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, geo_unit_id)
);

-- Campaign leaderboards (materialized, refreshed periodically)
CREATE TABLE leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'user' | 'group'
  entity_id UUID NOT NULL,
  rank INT,
  total_value NUMERIC DEFAULT 0,
  contribution_count INT DEFAULT 0,
  tracts_claimed INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Event System Schema

```sql
-- Event trigger definitions (set up per campaign)
CREATE TABLE event_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL, -- 'threshold_reached' | 'decay_elapsed' | 'report_count' | 'external_api' | 'time_elapsed'
  condition_config JSONB NOT NULL, -- { threshold: 100, unit: 'reports', geo_unit_id: '...' }
  event_type TEXT NOT NULL, -- 'boss_spawn' | 'decay_start' | 'cascade_unlock' | 'seasonal_reset' | 'notification'
  effect_config JSONB NOT NULL, -- what happens when triggered
  cooldown_hours INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

-- Active / historical events
CREATE TABLE campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  trigger_id UUID REFERENCES event_triggers(id),
  geo_unit_id UUID REFERENCES geo_units(id), -- nullable, for localized events
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  effect_config JSONB, -- active modifiers (score multipliers, decay rates, etc.)
  status TEXT DEFAULT 'active', -- 'active' | 'resolved' | 'expired'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- Trash/problem reports (feeds into boss event triggers)
CREATE TABLE problem_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  geo_unit_id UUID REFERENCES geo_units(id),
  reported_by UUID REFERENCES profiles(id),
  photo_url TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL, -- PostGIS point, required for report verification
  severity TEXT DEFAULT 'medium', -- 'low' | 'medium' | 'high'
  status TEXT DEFAULT 'open', -- 'open' | 'addressed' | 'verified'
  reported_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Spatial Indexes
Add these after table creation for performant geo queries:

```sql
-- Spatial index on geo_units boundaries (point-in-polygon queries)
CREATE INDEX geo_units_geometry_idx ON geo_units USING GIST (geometry);

-- Spatial index on contribution locations
CREATE INDEX contributions_location_idx ON contributions USING GIST (location);

-- Spatial index on problem report locations
CREATE INDEX problem_reports_location_idx ON problem_reports USING GIST (location);
```

Example point-in-polygon query (tract assignment on contribution submit):
```sql
SELECT g.id FROM geo_units g
WHERE ST_Contains(g.geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))
AND g.campaign_id = $3
LIMIT 1;
```

### Realtime Subscriptions (Supabase)
Tables that drive live map updates:
- `contributions` — new contribution appears on map instantly
- `territory_claims` — Realtime change → `map.setFeatureState()` on the affected geo_unit (no tile re-fetch)
- `campaign_events` — boss event spawns trigger map animation
- `leaderboard_entries` — live leaderboard updates

---

## 5. Development Steps

### Phase 1: Foundation (Week 1)
**Goal:** Auth, database, and project scaffolding working end to end

- [x] Initialize Next.js project with TypeScript
- [x] Set up Supabase project, run schema migrations (core tables)
- [x] Enable PostGIS extension in Supabase (`CREATE EXTENSION postgis;`)
- [x] Add spatial indexes to geo_units, contributions, problem_reports
- [x] Configure Supabase Auth (email/password)
- [x] OAuth providers — Google sign-in implemented and active. Additional providers (GitHub, Apple, Discord, Twitter/X) are supported by Supabase; deferred to post-beta. See Post-MVP section.
- [x] Initialize FastAPI project with health check endpoint (local; Railway deploy deferred)
- [x] Configure Cloudflare R2 bucket + presigned URL upload flow
- [x] Set up environment variable management (local `.env` / `.env.local`, VS Code launch.json)
- [x] Basic user profile creation on first login (DB trigger on auth.users INSERT)

**Deliverable:** Can sign up, log in, and have a profile row created in DB

**Also completed (beyond original checklist):**
- Monorepo structure (`frontend/`, `backend/`, `supabase/`) in a single git repo
- FastAPI routes: `POST /api/contributions/process` (PostGIS point-in-polygon + territory upsert), `POST /api/events/check-triggers/{id}`, `POST /api/decay/run`
- Event system schema + RLS policies (migrations 002, 003)
- Supabase Realtime enabled on contributions, territory_claims, campaign_events, leaderboard_entries
- TypeScript types for all DB tables (`frontend/src/types/database.ts`)
- Campaign list page (server component, queries active campaigns)
- Auth callback route for OAuth
- VS Code `launch.json` + `settings.json` for one-click full-stack launch with debugger

---

### Phase 2: Map Foundation (Week 1–2)
**Goal:** MapLibre rendering with campaign territory data

- [x] Integrate MapLibre GL JS into Next.js
- [x] Implement basic territory color layer (neutral → claimed)
- [x] Wire Supabase Realtime subscription to territory_claims table
- [x] Territory updates reflect on map without page refresh
- [x] Basic Total War-style map styling (muted terrain, stylized borders)
- [x] MVT tile endpoint (`GET /api/tiles/{campaign_id}/{z}/{x}/{y}.mvt`) serving geometry from PostGIS
- [x] CampaignMap uses vector tile source + feature-state for claim coloring (replaces bulk GeoJSON fetch)
- [x] Realtime claim updates routed through `setFeatureState` instead of layer rebuild

**Deliverable:** A live map that updates in real time when territory_claims change

---

### Phase 3: First Campaign — Trash War (Week 2–3)
**Goal:** Full contribution flow for one campaign end to end

- [x] Campaign detail page with map + stats
- [x] Contribution submission form (photo upload to R2, GPS capture, bag count)
- [x] Proximity validation via PostGIS `ST_DWithin` (check GPS within reasonable distance of claimed tract)
- [x] Point-in-polygon tract assignment via PostGIS `ST_Contains` (auto-assign submission to correct census tract)
- [x] FastAPI endpoint to process contribution, update territory_claims
- [x] Problem reporting flow (photo + GPS → problem_reports table)
- [x] Boss event trigger: X reports in a tract → spawn campaign_event
- [x] Boss event visible on map (trash pile animation with GSAP)
- [~] Territory decay cron job (FastAPI background task) — `POST /api/decay/run` + Railway cron deployed and running every 6h, but it's currently a no-op: nothing in the codebase ever sets `decay_starts_at` to a future timestamp, so the `WHERE decay_starts_at < NOW()` filter never matches. Need a `decay_elapsed` trigger/job that sets `decay_starts_at = last_contribution_at + decay window` once a claim goes stale. See condition types table below.

**Deliverable:** End-to-end Trash War campaign playable by real users

---

### Phase 4: Groups & Social Layer (Week 3–4)
**Goal:** Groups can participate and there's a social feed

- [x] Group creation and profile pages
- [x] Group membership (join, admin roles)
- [x] Contributions attributed to group when user is a member
- [x] Group leaderboard per campaign
- [x] Individual leaderboard per campaign
- [x] Persistent per-user points total — normalized per-type scoring map (cleanup/photo pass through bag-weighted value, solarpunk flattened to 1/2, road-to-independence + brainrot excluded, trash reports worth 1), synced via DB triggers on contributions + problem_reports — + global leaderboard page
- [x] Activity feed (recent contributions, events, claims — paginated)
- [x] User profile page with contribution history and impact stats
- [x] Basic push/in-app notifications for boss events and milestones

**Deliverable:** Groups can compete, users have profiles, feed is live

---

### Phase 5: Campaign 2 + Engine Generalization (Week 4–5)
**Goal:** Launch second campaign, prove engine is reusable

- [x] Touch Grass campaign (photo collage map type)
- [x] Refactor campaign engine to support photo collage map type
- [x] Photo pin drop on map, thumbnail expansion, mosaic fill visualization
- [x] Campaign-agnostic contribution form (driven by `contribution_type` config)
- [x] Event trigger system generalized (condition evaluation runs as FastAPI background task)
- [x] Admin panel (internal only): create campaigns, configure triggers, monitor events
- [x] Admin panel: date-scoped ("weekly") leaderboard tab per campaign, with per-user submission verification page (enlargeable photos) — supports running real-money/prize promotions on a campaign with visual proof of top contenders
- [x] Cleanup contribution `value` is recomputed server-side from `small_bags`/`large_bags` (never trusted from the client) — closes the scoring-spoof gap that a real-money prize would otherwise be vulnerable to

**Deliverable:** Second campaign live, engine is data-driven not hardcoded

---

### Phase 6: Polish & MVP Launch Prep
**Goal:** App is presentable to real users

- [x] Road to Independence campaign (state choropleth, registration self-report)
- [x] Choropleth map type support — state color fade visualization, state-level progress bars
- [x] Map animations: territory pulse on claim, boss spawn particle effect, photo pin drop
- [x] Onboarding flow for new users
- [x] Campaign discovery / home page
- [x] Switch basemap to MapTiler Streets (get free API key at maptiler.com, swap tile URL in `MAP_STYLE` in `CampaignMap.tsx`)
- [x] Mobile responsive UI audit
- [x] Performance audit: map tile caching, image optimization, query indexing
- [x] Error handling, loading states, empty states throughout
- [x] Set up monitoring (Sentry for errors, basic analytics)

**Deliverable:** Public MVP launch with 3 campaigns

---

### Phase 7: Launch Campaigns 4 & 5
**Goal:** Ship BRAINROT and Road to Independence v2, lay groundwork for Ground Truth

- [x] Road to Independence v2 — expand contribution form to 7 civic action types (action selector UI, store subtype in `notes`)
- [x] Road to Independence v2 — update description and scope doc to reflect 250th anniversary framing
- [x] BRAINROT campaign — heatmap map type rendering (MapLibre heatmap layer from point contributions)
- [x] BRAINROT contribution form — required account handle input, optional photo, location capture
- [x] BRAINROT dethrone leaderboard — aggregate `notes` field to rank most-unfollowed accounts
- [x] DB migration 011 — expand `contribution_type` CHECK constraint to include `civic_action` and `unfollow`
- [x] Demo data for BRAINROT (Digital Detox Collective group + 24 global unfollow contributions)
- [ ] Ground Truth campaign — design and spec (post-launch; ship UI after core 5 are stable)

**Deliverable:** 4 campaigns complete — Solarpunk (Campaign 5) built in Phase 8

---

### Phase 8: Campaign 5 — Solarpunk
**Goal:** Launch Solarpunk as the fifth campaign, introducing the hex bloom map type, cooperative scoring, and pre-seeded real-world data

**New technical dependencies:**
- `h3-js` (frontend) — H3 hex index lookup by lat/lng, hex boundary GeoJSON generation
- `h3` Python package (backend) — hex assignment during contribution processing
- New `campaign_type`: `hex_bloom`
- New `geo_unit` type: `h3_hex` (unit_id = H3 index string at resolution 5)
- New `contribution_type` values: `solarpunk_action` (action log) and `solarpunk_photo` (in-the-wild photo)

**Data model additions:**
- `bloom_score` column on `territory_claims` (or a dedicated `hex_bloom_scores` table) storing cumulative bloom points per H3 hex
- `bloom_stage` derived column (0–4) computed from thresholds
- `seed_source` text field on `geo_units` for pre-seeded hex provenance notes
- DB migration to expand `contribution_type` CHECK constraint and add `h3_hex` to `geo_unit` CHECK

**Development checklist:**
- [x] Research and finalize pre-seed hex list with sources (renewable energy data, green index data)
- [x] Build H3 hex loader — `POST /admin/seed/solarpunk-preseed` — `SolarpunkPreseedSeeder` upserts 11 pre-seeded cities into `geo_units` + `territory_claims`
- [x] Backend: H3 hex assignment on contribution submit — replace PostGIS point-in-polygon with `h3.latlng_to_cell` (faster, no polygon needed); auto-creates `geo_unit` row if needed
- [x] Backend: Bloom score upsert logic — accumulates points via `territory_claims.total_value` (bloom_score) on each contribution
- [x] Backend: Pre-seed endpoint — `POST /admin/seed/solarpunk-preseed` loads baseline bloom scores for 11 research-validated hexes with `seed_source` metadata (kept under the 5,000-point "First Sparks" milestone so real contributions are what cross it)
- [x] Frontend: H3 hex grid MapLibre layer — GeoJSON fill layer generated client-side via `h3-js cellToBoundary`; refreshed on contribution and Realtime events
- [x] Frontend: Hex bloom stage coloring — `bloom_score` mapped to stage 0–4 palette (5 green shades) via `bloom_stage` property on each feature
- [x] Frontend: Solar panel aesthetic for Stage 0 hexes — dark fill, subtle internal grid line overlay
- [x] Frontend: GSAP bloom wave animation — ripple effect when a hex advances a stage
- [x] Frontend: Per-hex photo collage panel — thumbnail grid of `solarpunk_photo` contributions for the selected hex
- [x] Frontend: Global Bloom Score counter — World Bloom Score shown in the campaign stats bar (sum of all `territory_claims.total_value`)
- [x] Frontend: Solarpunk action log form — 7-category / 35-action picker with point values, GPS capture, optional photo (`SolarpunkActionModal`)
- [x] Frontend: Solarpunk in the Wild form — photo upload, GPS capture, optional caption (`SolarpunkPhotoModal`)
- [x] Frontend: Pre-seeded hex info panel — `HexPanel` shows `seed_source` explanation and bloom progress bar on hex click
- [x] Seeder: Demo data — sample contributions across 8–10 cities, photo submissions, pre-seeded hexes at Stage 1–2
- [x] Milestone unlock system — when hex crosses a stage threshold, create a `campaign_events` record and award a badge to all contributors
- [ ] **Future: multi-resolution hex grid** — at high zoom levels (z ≥ 7), switch from res-3 (~120 km diameter) to res-5 (~9 km) hexes so dense cities show neighborhood-level bloom. Requires zoom-triggered tile source swap in MapLibre, a second MVT endpoint for res-5, and an aggregation model that rolls res-5 bloom scores up to their parent res-3 cell for the zoomed-out view.

**Deliverable:** 5 campaigns live at launch — cooperative hex bloom map, full action log, photo collage per hex, pre-seeded world data visible on load

---

### Trash War: UK Expansion
**Goal:** Extend Trash War coverage from US ZIP codes to UK postcode districts (e.g. `SW1A`, `M1`, `EH3`), so the campaign is playable in both countries simultaneously.

**New technical dependencies:**
- New `geo_unit` type: `uk_postcode_district` (unit_id = UK postcode district code), separately namespaced from `zip`
- `campaigns.geo_unit` converted from scalar `TEXT` to `TEXT[]` so a single campaign can span multiple geo unit types at once

**Data model additions:**
- Migration `020_uk_postcode_districts.sql` — drops old `geo_unit` CHECK, converts column to `TEXT[]`, adds new CHECK including `uk_postcode_district`
- Boundary polygons sourced from doogal.co.uk's free OGL-licensed postcode district KML export (2,877 districts)

**Development checklist:**
- [x] KML → simplified GeoJSON conversion (`geo.py: simplify_uk_postcode_districts`) — handles `MultiGeometry` and interior rings/holes
- [x] `UkPostcodeDistrictSeeder` + `POST /admin/load-geo-units/uk-postcode-districts` loader (mirrors `ZipCodeSeeder`)
- [x] DB migration: `campaigns.geo_unit` TEXT → TEXT[], CHECK constraint includes `uk_postcode_district`
- [x] Backend: all point-in-polygon/tile queries switched from `=` to `= ANY(...)` for array-typed `geo_unit` (`tiles.py`, `contributions.py`, `problem_reports.py`)
- [x] Backend: `GET /geo-units/uk-postcode/{postcode}/centroid` endpoint for map search-to-postcode
- [x] Trash War campaign row updated: `geo_unit = ARRAY['zip', 'uk_postcode_district']`, `geo_scope` includes `countries: ["US", "UK"]`
- [x] Frontend: `GeoUnit`/`campaigns.geo_unit` types changed to arrays; all scalar equality checks converted to `.includes(...)`
- [x] Frontend: UK postcode search form on the map (parallel to existing ZIP search), map bounds/center widened to cover both US and UK when applicable

**Deliverable:** Trash War playable across both US ZIP codes and UK postcode districts on the same map/campaign

---

### Pre-Launch Requirement: External Model Imports
- [x] **Groups** — `groups` table reshaped to match the DOGS `DirectoryEntry` shape (`image_url`, `social_links`, `categories`, `featured`). `group_members` remains the source of truth for membership/roles; DOGS's `user_ids` is treated as derived, never synced.
- [x] **Cleanups** — new `cleanups` table matching the DOGS `Cleanup` shape (location, image_urls, structured metrics, organizer/rsvp/attended user id arrays). Trash War cleanup contributions now create a linked `cleanups` row (`contributions.cleanup_id`).
- [x] **Trash Reports** — `problem_reports` reshaped to match the DOGS `TrashReport` shape (`submitted_by_user_id`, `image_urls`, full `ActivityStatus` enum, `resolved_by_user_id`/`resolved_by_cleanup_id`/`resolved_at`). Table name unchanged to avoid touching Realtime subscriptions.

Per decision, Frontline does not call the live DOGS API at runtime — all data stays in Frontline's own Supabase DB; DOGS's OpenAPI schema (`frontend/src/types/dogs.ts`) is only the shape contract these tables/types were aligned to. Deferred: RSVP/scheduling UI for cleanups, and category-tagging UI for groups — schema exists, UI does not yet.

---

### Pre-Launch Polish: Auth & User Accounts
**Goal:** Production-ready auth flow and user account management before going public

**Auth hardening:**
- [x] Password reset flow (Supabase magic link → reset page with new password form)
- [x] Email confirmation on signup (currently skipped in dev)
- [x] "Forgot password" link on login page
- [x] Account deletion — self-serve from settings (delete profile row + Supabase auth user, cascade via RLS/triggers)
- [x] Session expiry handling — middleware calls `getUser()` on every request, auto-refreshes token, redirects expired sessions to `/login?next=<path>`

**Legal:**
- [x] Terms of Service page (`/legal/terms`) — basic ToS covering UGC, conduct, data usage
- [x] Privacy Policy page (`/legal/privacy`)
- [x] Link both in signup flow (footer links on signup page)

**User profile:**
- [x] Profile image upload — presigned R2 upload, store URL in `profiles.avatar_url`, display everywhere avatars appear
- [x] Profile page (`/users/[username]`) — contribution history, joined groups, campaign activity stats, bio
- [x] Profile edit page — display name, bio, avatar upload (`/settings/profile`)
- [x] Account settings — email change, password change, danger zone (`/settings/account`)

---

---

### Groups Page Cleanup

#### Create Group — access control
`/groups/new` is open to any logged-in user who has at least one contribution on record. The listing page hides the button otherwise, and the page server component redirects users with no contributions back to `/groups`. The RLS `groups_insert` policy enforces creation at the DB layer via `auth.uid() = created_by OR is_site_admin()` (migration 015) — any authenticated user can already insert a group for themselves; the app-level gate just adds the "has contributed" requirement on top.

#### Group profile page (`/groups/[slug]`) — what's built

- **Edit group info** — `/groups/[slug]/edit` route, gated behind `isAdmin`. Supports name, description, website.
- **Profile picture upload** — presigned R2 upload wired in `GroupEditForm`; `logo_url` rendered in avatar slot on group profile and listing cards.
- **Member management** — `MemberManager` component on the edit page; admins can promote members or remove them.
- **Edit button** — visible on `/groups/[slug]` when `isAdmin` is true, routes to `/groups/[slug]/edit`.

#### What works today
- Group creation (any logged-in user with a contribution — button hidden otherwise, server-side redirect enforced, DB-layer RLS guard)
- Groups nav link hidden in `AppHeader` for logged-out users
- Group profile display: name, description, website, logo, verified badge, member list with roles
- Join / leave membership (`GroupMembershipButton`)
- Admin role badge display
- Edit group info, logo upload, member management (admin only)

---

### Post-MVP: Mobile & Monetization
- [x] Partner businesses (discounts/redemption) — DB schema (`partner_businesses`, `partner_offers`, `partner_offer_codes`, `partner_redemptions`, migration 026) + admin panel "Partners" tab to create businesses/offers and bulk-add single-use redemption codes. Offers support two independent modes: `spend` (deducts points on redemption) and `threshold` (points balance just gates access, nothing deducted). Deferred: the user-facing browse/redeem flow and the backend endpoint that atomically checks balance, decrements points, and claims a code — schema is ready for it but no user can redeem anything yet.
- [x] **Partner offer redemption flow (user-facing)** — closes the loop so a user can actually redeem points for a discount.
  - **Backend:** `POST /api/partners/offers/{offer_id}/redeem` (`backend/app/api/routes/partners.py`), taking `{user_id}` in the body (same unauthenticated-FastAPI, session-derived-`user_id` posture used by `contributions.py`). Runs as a single DB transaction on the backend's direct Postgres connection (bypasses RLS, per the `partner_redemptions_select` policy comment): (1) re-checks the offer and its business are both `active` and the offer is within `starts_at`/`ends_at`, (2) locks the user's `profiles` row (`SELECT ... FOR UPDATE`) and confirms their points are sufficient (`>= points_cost` for `spend` mode, `>= points_threshold` for `threshold` mode — 409 if not), (3) enforces `max_redemptions_per_user` by counting existing `partner_redemptions` rows for that user+offer, (4) atomically claims one row from `partner_offer_codes` (`UPDATE ... WHERE id = (SELECT id FROM partner_offer_codes WHERE offer_id = :id AND status = 'available' LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING code`, 409 "out of stock" if none available), (5) decrements `profiles.points` for `spend` mode only, (6) inserts the `partner_redemptions` ledger row, (7) returns the claimed code.
  - **Backend:** `GET /api/partners/offers/{offer_id}/redemptions/me?user_id=` — returns a user's past redemptions (code + points spent + timestamp) for one offer by joining through to `partner_offer_codes`, which is otherwise admin-only under RLS. Used by the browse page to show "already redeemed" instead of a redundant direct-Supabase existence check.
  - **Frontend:** public "Partners" browse page (`/partners`, `PartnersBrowseClient.tsx`) — server component reads active businesses + active/in-window offers straight from Supabase (public RLS), passes them to a client component that shows the user's points balance, greys out offers they can't afford, and calls the redeem endpoint on click, displaying the returned code inline and decrementing the shown balance optimistically. Logged-out users see a "log in to redeem" prompt instead of a button. Added `/partners` to the header nav (desktop + mobile).
  - **Deferred:** no standalone per-business detail page (offers are listed inline on the single browse page instead — judged sufficient for the current number of partners); no expiry/refund flow if a user redeems and a business goes inactive after the fact (manual admin cleanup); no push/email notification on redemption, only the in-app response.
- [x] **Partner offer redemption redesign — shared code + total cap + admin edit/cancel + confirmation screen** (migration 030) — replaced the manual `partner_offer_codes` pool (admin had to paste one-per-line single-use codes) with a single `code` text field stored directly on the offer, shown to everyone who redeems, plus an optional offer-level `max_total_redemptions` cap so a partner can still limit total giveaways without maintaining a code inventory. `partner_offers` gained `code` and `max_total_redemptions` columns and a `cancelled` status value; `partner_redemptions` gained its own `code` column (a snapshot of what the user got) and `code_id` was made nullable. `partner_offer_codes` and the `code_id` FK are left in the schema untouched (unused going forward, historical rows preserved) — non-destructive per the app's live-production posture.
  - **Backend:** `redeem_offer` (`backend/app/api/routes/partners.py`) no longer claims from a code pool — it locks the offer row (`FOR UPDATE`), and when `max_total_redemptions` is set, counts existing `partner_redemptions` for that offer and 409s ("This offer has reached its redemption limit") once the cap is hit. The ledger insert now writes `code = offer.code` directly. `get_my_redemptions` reads `code` straight off `partner_redemptions` instead of joining through `partner_offer_codes`.
  - **Admin UI:** new shared `frontend/src/components/partners/OfferForm.tsx` (same `initial`/`onSubmit`/`onCancel`/`submitLabel` pattern as `BusinessForm.tsx`) used for both create and edit, with fields for the shared code and max total redemptions. Offers in the admin Partners tab now show an `{redeemed}/{max_total_redemptions ?? "∞"}` counter, an **Edit** button (opens the form inline, pre-filled), and a **Cancel offer** button (soft-cancel via `status: 'cancelled'`, not a hard delete, since `partner_redemptions` reference the offer by id) — mirroring the existing pending-business reject pattern but non-destructive. Cancelled offers are excluded from the public `partner_offers_select` RLS policy the same way expired ones are.
  - **User-facing:** successful redemption now opens `RedemptionConfirmationModal.tsx` — a full-screen overlay (checkmark, offer/business name, large tap-to-copy code, points spent, redeemed timestamp) instead of a QR code, since the ask was visual proof of redemption, not a scannable payload. The modal is reopenable from the offer card afterward (clicking the "Redeemed" / "Last code" row), so it works as durable proof (e.g. to show a cashier) rather than a one-time toast.
- [x] **Partner redemption — merchant "mark as used" step** (migration 031) — closes a gap in the confirmation-screen model: `redeemed_at` only records when the user claimed the offer in-app, so nothing stopped the same confirmation screen from being shown to more than one cashier. `partner_redemptions` gained a nullable `used_at` column. New `POST /api/partners/redemptions/{redemption_id}/mark-used` (`backend/app/api/routes/partners.py`) is a merchant-facing consume step — tapped on the customer's phone at the register — that sets `used_at = now()` once and 409s ("This redemption has already been used") on any later attempt; `redeem_offer`'s response and `get_my_redemptions` both now include the redemption's `id` and `used_at` so the frontend can carry them through. `RedemptionConfirmationModal.tsx` shows a relative "Redeemed X min/hr/days ago" label plus a "Mark as used" button on the live proof screen; once `used_at` is set, reopening the same proof (from the offer card's "Redeemed"/"Last code" row) renders a distinct grayed-out "Already used — honored at [time]" state instead of the redeemable one, so a second cashier sees at a glance it's already been consumed.
- [x] Partner businesses — location, socials, and map presence (migration 028) — `partner_businesses` gained address fields, `lat`/`lng`, `google_maps_url`, and a `social_links` jsonb column (same shape as `groups.social_links`). New `campaign_partner_businesses` join table ties a business to any number of campaigns, editable after creation. Admin "Partners" tab create/edit form gained a logo upload, address inputs, an embedded MapLibre lat/lng picker, a Google Maps URL field, the social links block, and a per-campaign checklist that reconciles the join table on save. Active businesses with coordinates render as circular logo markers (🏪 fallback) on `CampaignMap`, clicking one opens an info panel with name/description/website/Google Maps link.
- [x] Partner businesses — address autofill/geocoding, public self-apply flow, and admin review queue (migration 029) — the admin add/edit form's address fields are now backed by `AddressAutocomplete` (MapTiler geocoding, debounced suggestions) which also fills lat/lng, feeding the same `BusinessLocationMapPicker` used for manual pin placement; the duplicate "Website" field bug was fixed. The admin create/edit form (`AdminPanel.tsx`) and its `uploadPartnerLogo`/`BusinessForm` logic were extracted into a shared `frontend/src/components/partners/BusinessForm.tsx`, with the campaign-assignment checklist now an optional prop so the form can be reused without it. A new public, unauthenticated route (`/partners/apply`) lets a business self-submit a listing via that shared form (no campaign picker shown); the submission inserts directly as `status: 'pending'` (new status value + a permissive public INSERT RLS policy scoped to `status = 'pending'`) and is invisible to everyone but admins until reviewed. The admin Partners tab surfaces pending submissions in a dedicated "Pending review" section, auto-expanded into edit mode with an amber-bordered card; saving the edit form both assigns campaigns (existing checklist) and flips status to `active` in one step ("Approve & publish"), and a "Reject" action deletes the pending row (campaign links cascade-delete automatically).
- [x] Campaign events — multi-area map picker + event image + map area highlighting (migration 027) — admin "Events" tab replaced the free-text area-type/unit-id inputs with `EventAreaMapPicker`, a click-to-select MapLibre area picker scoped to the campaign's own tiles, supporting multiple areas per event via the new `campaign_event_geo_units` join table (additive to the existing single `geo_unit_id` column, which is left untouched for the live trigger-firing backend code and auto-backfilled from it). Events also gained an `image_url` field (R2 upload, same presign flow as groups/partners). On `CampaignMap`, active events highlight all of their linked areas via feature-state (not just the primary one), the event marker shows the event image as a circular thumbnail (emoji badge in the corner) when set, and clicking a multi-area event marker fits the map to the bounds of all its areas instead of flying to a single point.
- [x] **Spendable vs. lifetime points split** (migration 032) — redeeming a partner offer no longer moves a user down any leaderboard, since leaderboards rank lifetime contribution, not current balance. `profiles` gained a `spendable_points` column (backfilled from `points`), and the earn-side DB triggers that increment `points` now increment both columns together, so the two only diverge on redemption. `redeem_offer` (`backend/app/api/routes/partners.py`) checks and decrements `spendable_points` instead of `points`; `points` itself is never decremented and stays the sole source for every leaderboard query, the header points badge, and profile pages. The `/partners` browse page's balance display and afford-ability checks were switched to `spendable_points`.
- [x] **Map: highlight businesses with an active offer** — on `CampaignMap`, a partner business marker renders with a distinct highlighted style (ring/badge) when it currently has at least one `active` offer within its `starts_at`/`ends_at` window, and the business's info-panel/modal lists its live offers inline instead of requiring a trip to `/partners` to discover them.
- [x] **Partner self-service dashboard** (migration 033) — lets a partner log in and manage their own business/offers directly instead of routing every change through a site admin. New `partner_business_admins` join table (`business_id`, `user_id`, unique pair) supports multiple staff per business and multiple businesses per user. `is_business_admin(business_id)` mirrors the existing `is_site_admin()` SQL function (008) and is layered on as additional *permissive* RLS policies alongside the existing site-admin-only ones on `partner_businesses` (UPDATE only — creation/deletion stays site-admin-only), `partner_offers` (INSERT/UPDATE), and `partner_redemptions` (SELECT) — Postgres ORs permissive policies together, so nothing already granted to site admins changed.
  - **Backend:** three new endpoints on `backend/app/api/routes/partners.py` — `GET/POST /api/partners/businesses/{business_id}/admins` (list/grant by email) and `DELETE .../admins/{admin_id}` (revoke). Email-to-user-id lookup reads `auth.users` directly over the backend's own Postgres connection since that table isn't exposed via RLS/PostgREST from the public schema. No auth/identity check on these endpoints, consistent with the rest of this backend (all authorization here is enforced via Postgres RLS on the frontend's direct-Supabase calls; the FastAPI layer as a whole has no auth middleware).
  - **Admin UI:** `AdminPanel.tsx` gained a "Business admins" section per business (`BusinessAdminsManager`) to grant/revoke access by email.
  - **Frontend:** new `/partners/dashboard` route, gated on having at least one `partner_business_admins` row, reusing the existing `BusinessForm`/`OfferForm`/`OfferRow` components with campaign-linking and business creation/deletion omitted (still site-admin-only). Header nav shows a "Manage Business" link for users with dashboard access.
- React Native app sharing API and auth layer
- Collective Action Fund (legal review required — pooled donation vehicle with voting)
- Campaign creation tools for verified groups
- Weather API integration for dynamic environmental events
- Advanced moderation layer for user-generated content
- Ground Truth (Campaign 5) — crowdsourced global news map

### Post-Beta: Additional Sign-In Methods
Supabase supports additional OAuth providers with minimal effort — each requires enabling the provider in the Supabase dashboard, adding a client ID/secret env var pair, and wiring a sign-in button in the login/signup UI. Candidates to evaluate:
- **GitHub** — natural fit for early adopters and tech-adjacent users
- **Apple** — required for iOS App Store compliance once mobile app ships
- **Discord** — strong fit for community/gaming-adjacent campaign types
- **Twitter/X** — high reach for civic action campaigns (Road to Independence, BRAINROT)
- **Passkeys / magic link** — passwordless options Supabase supports out of the box; lowers friction for non-technical users
