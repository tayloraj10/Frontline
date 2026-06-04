# Frontline — Project Scope

## 1. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js + TypeScript | Web-first, React Native for mobile post-MVP |
| Styling / Animation | Framer Motion + GSAP | UI transitions + heavy map/campaign animations |
| Map Engine | MapLibre GL JS | Open source, highly customizable, SVG/canvas overlay support |
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
Next.js → FastAPI                  (geo-processing, territory calculation, event engine, decay jobs)
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

On the FastAPI side, use **GeoAlchemy2** for PostGIS-aware SQLAlchemy queries and **Shapely** for any in-memory geometry processing. Census tract boundaries sourced from Census Bureau TIGER/Line files (free).

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
**Concept:** US state map showing party affiliation by last election. As users mark they've changed voter registration to Independent, states fade toward a neutral color.

**Map Style:** US political choropleth — deep red/blue fading toward gray/purple as registrations come in

**Contribution:** Self-report voter registration change (honor system), optionally upload registration confirmation

**Scoring:** Each registration change contributes to state-level progress. States have thresholds based on population.

**Visualization:** State color gradually desaturates. Progress bar per state. National aggregate showing total registrations.

**Dynamic Events:**
- Election season surge events
- State "flips" to swing status when threshold reached — triggers celebration animation
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

### Campaign 4: Dark Sky 🌌 *(concept)*
**Concept:** Users submit night sky photos from their location. Map overlays real light pollution data. As communities advocate for ordinances the light pollution overlay fades.

**Map Style:** Night mode map with light pollution heat overlay that fades with advocacy actions

**Contribution:** Photo submission + advocacy action log (attending meeting, contacting representative)

**Visualization:** Glowing light pollution overlay dims region by region as actions accumulate. Photo submissions create star-pin clusters on the map.

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
  contribution_type TEXT NOT NULL, -- 'cleanup' | 'photo' | 'registration' | 'advocacy'
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
- `territory_claims` — territory color/owner updates live
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
- [x] Configure Supabase Auth (email + OAuth — Google at minimum)
- [x] Initialize FastAPI project with health check endpoint (local; Railway deploy deferred)
- [ ] Configure Cloudflare R2 bucket + presigned URL upload flow
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
- [ ] Load and render US census tract GeoJSON for a test region
- [x] Implement basic territory color layer (neutral → claimed)
- [x] Wire Supabase Realtime subscription to territory_claims table
- [x] Territory updates reflect on map without page refresh
- [x] Basic Total War-style map styling (muted terrain, stylized borders)

**Remaining:** Load real census tract GeoJSON into `geo_units` table and wire it to the map source — campaign detail page and CampaignMap component are built and waiting for data.

**Deliverable:** A live map that updates in real time when territory_claims change

---

### Phase 3: First Campaign — Trash War (Week 2–3)
**Goal:** Full contribution flow for one campaign end to end

- [ ] Campaign detail page with map + stats
- [ ] Contribution submission form (photo upload to R2, GPS capture, bag count)
- [ ] Proximity validation via PostGIS `ST_DWithin` (check GPS within reasonable distance of claimed tract)
- [ ] Point-in-polygon tract assignment via PostGIS `ST_Contains` (auto-assign submission to correct census tract)
- [ ] FastAPI endpoint to process contribution, update territory_claims
- [ ] Problem reporting flow (photo + GPS → problem_reports table)
- [ ] Boss event trigger: X reports in a tract → spawn campaign_event
- [ ] Boss event visible on map (trash pile animation with GSAP)
- [ ] Territory decay cron job (FastAPI background task)

**Deliverable:** End-to-end Trash War campaign playable by real users

---

### Phase 4: Groups & Social Layer (Week 3–4)
**Goal:** Groups can participate and there's a social feed

- [ ] Group creation and profile pages
- [ ] Group membership (join, admin roles)
- [ ] Contributions attributed to group when user is a member
- [ ] Group leaderboard per campaign
- [ ] Individual leaderboard per campaign
- [ ] Activity feed (recent contributions, events, claims — paginated)
- [ ] User profile page with contribution history and impact stats
- [ ] Basic push/in-app notifications for boss events and milestones

**Deliverable:** Groups can compete, users have profiles, feed is live

---

### Phase 5: Campaign 2 + Engine Generalization (Week 4–5)
**Goal:** Launch second campaign, prove engine is reusable

- [ ] Touch Grass campaign (photo collage map type)
- [ ] Refactor campaign engine to support photo collage map type
- [ ] Photo pin drop on map, thumbnail expansion, mosaic fill visualization
- [ ] Campaign-agnostic contribution form (driven by `contribution_type` config)
- [ ] Event trigger system generalized (condition evaluation runs as FastAPI background task)
- [ ] Admin panel (internal only): create campaigns, configure triggers, monitor events

**Deliverable:** Second campaign live, engine is data-driven not hardcoded

---

### Phase 6: Polish & MVP Launch Prep
**Goal:** App is presentable to real users

- [ ] Road to Independence campaign (state choropleth, registration self-report)
- [ ] Choropleth map type support — state color fade visualization, state-level progress bars
- [ ] Map animations: territory pulse on claim, boss spawn particle effect, photo pin drop
- [ ] Onboarding flow for new users
- [ ] Campaign discovery / home page
- [ ] Mobile responsive UI audit
- [ ] Performance audit: map tile caching, image optimization, query indexing
- [ ] Error handling, loading states, empty states throughout
- [ ] Set up monitoring (Sentry for errors, basic analytics)

**Deliverable:** Public MVP launch with 3 campaigns

---

### Post-MVP: Mobile & Monetization
- React Native app sharing API and auth layer
- Collective Action Fund (legal review required — pooled donation vehicle with voting)
- Campaign creation tools for verified groups
- Weather API integration for dynamic environmental events
- Advanced moderation layer for user-generated content
