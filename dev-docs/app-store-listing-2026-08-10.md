# App Store Listing Package — Frontline

Covers work-breakdown item #9 from `capacitor-scoping-2026-08-04.md` (store listings). Draft copy for both Apple App Store Connect and Google Play Console, plus a screenshot shot list to capture once you're driving the app. Nothing here has been submitted anywhere yet — this is the source doc to paste from.

App identity: name **Frontline**, bundle ID `com.frontline.app`, prod domain `https://www.frontlinemaps.com`, privacy policy live at `https://www.frontlinemaps.com/legal/privacy`, terms at `https://www.frontlinemaps.com/legal/terms`.

---

## 1. iOS — App Store Connect

### App name (30 char max)
```
Frontline
```
9 chars — room to spare if you want `Frontline: Cleanup Maps` (24 chars) instead, which front-loads the SEO term. Recommend the plain `Frontline` for brand cleanliness and let the subtitle carry the description.

### Subtitle (30 char max)
```
Cleanups, mapped & gamified
```
27 chars.

### Promotional text (170 char max — the only field editable without a new build review)
```
Log cleanups, claim territory on the map, and compete with your city. Join a live campaign near you and turn collective action into a game.
```
158 chars.

### Description (4000 char max)
```
Frontline turns real-world cleanup work into a live map game. Join a campaign, log what you pick up, and watch your zip code, neighborhood, or borough climb the board.

HOW IT WORKS
• Browse active campaigns on a live map — see claimed territory, hotspots, and activity near you.
• Log a contribution: drop a pin (GPS or manual), record bag counts or pounds collected, or trace a route you walked. Add a photo to back it up.
• Claim territory for yourself or your group, or just track neighborhood stats without the competition layer — your call.
• Spot trash that needs attention? Report it with a pin and photo. Claim an open report, submit before/after photos, and turn the cleanup into a logged contribution.

CLEANUP EVENTS
• Find group-hosted cleanup events near you and RSVP.
• Check in with GPS or a join code — no app fumbling required once you're on site.
• See who showed up, what got logged, and photos from the day.

GROUPS
• Join or start a group with your block, school, or community org.
• Compete on the leaderboard, coordinate events, and track your group's total impact.

PARTNER REWARDS
• Local businesses back the effort — redeem points for real offers from partner businesses near your campaign.

MILESTONES & PROGRESS
• Track your points, bag counts, and pounds collected against milestone ladders.
• See your personal history and where you rank citywide.

Frontline is free to use. Location access is used to log contributions accurately and show you nearby activity — you control when it's shared. Camera/photo access is only used when you choose to attach a photo to a cleanup or report.
```
~1,550 chars — well under the limit, leaves room to grow.

### Keywords (100 char max, comma-separated, no spaces needed but conventional to omit them)
```
cleanup,trash,litter,volunteer,community,map,environment,recycling,neighborhood,civic,eco,green
```
97 chars. Don't repeat words already in the app name/subtitle (Apple indexes those separately) — "cleanup" is borderline reuse from the subtitle but high-value enough to keep.

### Support URL
```
https://www.frontlinemaps.com
```
(No dedicated support page yet — confirm whether you want a `/support` route or a mailto before submitting. A bare marketing URL is accepted but a real support contact reduces review friction.)

### Marketing URL (optional)
```
https://www.frontlinemaps.com
```

### Privacy Policy URL
```
https://www.frontlinemaps.com/legal/privacy
```

### Category
- Primary: **Social Networking** (or **Lifestyle** — see note below)
- Secondary: **Utilities** or **Travel** (for the map/location angle)

Judgment call: Frontline reads more like a civic/social-action app than pure "Lifestyle." **Social Networking** fits the groups/leaderboard/profile layer; if Apple's reviewers push back (they sometimes gate Social Networking behind stricter UGC-moderation review), **Lifestyle** is the fallback with no functional difference to you.

### Copyright
```
© 2026 [your legal name or entity — resolve per the personal-vs-LLC decision noted in capacitor-scoping-2026-08-04.md]
```

### Age Rating (App Store Connect questionnaire)
Answer based on what's actually in the app today:

| Question | Answer | Why |
|---|---|---|
| Unrestricted web access | **No** | WebView only loads your own domain |
| User-generated content (photos, text) | **Yes** | Contribution photos, report photos, group descriptions/bios |
| User-to-user communication | **No** | No DMs/chat exists |
| Location sharing | **Yes** | GPS-based contribution logging, check-in, territory claiming |
| Gambling / contests | **No** | Points/redemptions aren't gambling (no purchase-to-play, no cash payout) |
| Alcohol/tobacco/drugs, mature/violent content | **No** | |

Expected result: **4+** age rating, but UGC photo content typically requires enabling Apple's "report content" flow — you already have report-flagging on trash reports (`Flag a report as inappropriate/spam`); confirm whether contribution/profile photos also need a report path before submitting, since Apple checks for one wherever UGC images exist.

### App Privacy ("nutrition label") — data types to declare
Based on what the app actually collects (source: `app-capability-doc.md` + Supabase schema):

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Precise Location | Yes | Yes | No | App functionality (contribution logging, check-in, territory) |
| Photos | Yes | Yes | No | App functionality (contribution/report evidence) |
| Email Address | Yes | Yes | No | Account creation/auth |
| Name / Username | Yes | Yes | No | Account creation, public profile |
| User ID | Yes | Yes | No | Account/app functionality |
| Other User Content (bio, group descriptions) | Yes | Yes | No | App functionality |
| Product Interaction (points, contributions, redemptions) | Yes | Yes | No | App functionality, analytics |

"Used for tracking" = No across the board as long as you're not running cross-app/cross-site ad tracking (you aren't). If you add any analytics SDK later that shares data with third parties for advertising, this table needs revisiting before the next submission.

---

## 2. Google Play Console

### App name (30 char max)
```
Frontline
```

### Short description (80 char max)
```
Log cleanups, claim territory on the map, and compete with your community.
```
76 chars.

### Full description (4000 char max)
Same body copy as the iOS description above works verbatim for Play — Google doesn't have Apple's keyword-stuffing penalty in the same way, so you can lightly reinforce a couple of search terms if you want, but it's not required. Reuse the iOS description as-is.

### App category
- Category: **Social** (or **Lifestyle**/**Maps & Navigation** — same judgment call as iOS)
- Tags: cleanup, volunteering, community, environment (Play lets you pick up to 5 tags)

### Contact details (required)
- Email: (pick a real inbox you'll monitor — Play requires this to be public-facing)
- Website: `https://www.frontlinemaps.com`
- Privacy policy: `https://www.frontlinemaps.com/legal/privacy`

### Data safety form
Mirrors the iOS privacy nutrition label — same underlying facts, different form:

| Data type | Collected | Shared with 3rd parties | Purpose |
|---|---|---|---|
| Approximate/precise location | Yes | No | App functionality |
| Photos | Yes | No | App functionality |
| Email address | Yes | No | Account management |
| User IDs | Yes | No | Account management, app functionality |
| Name | Yes | No | App functionality |
| App activity (contributions, in-app actions) | Yes | No | App functionality, analytics |

Security practices section: confirm "data is encrypted in transit" (Yes — Supabase/HTTPS), "you can request data deletion" (Yes — account deletion is self-service per `app-capability-doc.md` §Auth & Account), "data collection is optional" (mark location/camera as tied to specific optional features, not blanket account creation).

### Content rating (IARC questionnaire)
Answer honestly per the questionnaire flow — expect a rating equivalent to **Everyone/PEGI 3**, same reasoning as the iOS 4+ rating: UGC photos present but no violence/mature themes/chat.

### Target audience & content
Google explicitly asks "is this app designed for children" — answer **No**, and confirm the app isn't inadvertently appealing primarily to under-13s (it isn't, based on the civic/gamification framing).

---

## 3. Permissions justification (for reviewer questions on either store)

Already written into the native manifests — reuse verbatim if a reviewer asks you to justify a permission:

- **Location (iOS `NSLocationWhenInUseUsageDescription` / Android `ACCESS_FINE_LOCATION`+`ACCESS_COARSE_LOCATION`)**: "Frontline uses your location to show nearby activity and data." — backs GPS-based contribution logging, event check-in proximity gating, and territory/geo-unit stats.
- **Camera (iOS `NSCameraUsageDescription` / Android `CAMERA`)**: "Frontline uses your camera to photograph cleanups and trash reports."
- **Photo library read (iOS `NSPhotoLibraryUsageDescription` / Android `READ_MEDIA_IMAGES`)**: "Frontline lets you attach existing photos to cleanups and trash reports."
- **Photo library write (iOS `NSPhotoLibraryAddUsageDescription`)**: "Frontline can save photos you take to your library."
- **Push notifications (Android `POST_NOTIFICATIONS`)**: tied to the push-notification feature (`push-notifications-scoping-2026-08-06.md`) — only relevant once that ships to prod.

None of these need new copy — Info.plist and AndroidManifest.xml already have reviewer-appropriate strings.

---

## 4. Screenshot shot list

Apple requires at minimum the **6.7" display** (iPhone 15/16 Pro Max class) screenshot set; Apple auto-scales that set down to smaller sizes if you don't supply extras, so **do the 6.7" set first** — that alone is enough to submit. iPad screenshots are only required if you mark the app as iPad-compatible. Google Play requires at least **2 phone screenshots** (up to 8), sized however your device renders them (no fixed dimension requirement like Apple, just min 320px, max 3840px, 16:9 or 9:16-ish).

Capture at these logical steps, in order — this order is also a good "story" for App Store Connect's screenshot sequence (first 2-3 are what most browsers see before scrolling):

1. **Campaign map, zoomed to an active area with visible activity** — territory claims or hotspots showing, stats bar visible. This is the hero shot; lead with it. Use a campaign/area with real data, not an empty map.
2. **Contribution logging in progress** — the log-a-contribution sheet/form open (bag count or pounds entry), ideally mid-fill so it doesn't look like an empty form.
3. **Group leaderboard or individual leaderboard tab** — shows the competitive layer clearly (ranks, points, group names).
4. **Cleanup event page** — roster + RSVP state, shows the social/organizing angle.
5. **Partner offer redemption screen** — shows the rewards loop (offer detail or redemption code state).
6. **Group profile page** — logo, members, upcoming events — reinforces the community angle.

Optional 7th/8th if you want more: the "claim-a-report" before/after photo flow (distinctive feature, worth showing), or a profile/milestone-progress view.

### Capture mechanics
- Do these **on a real device or the iOS Simulator at 6.7"** (iPhone 16 Pro Max simulator) for iOS — simulator screenshots are accepted by Apple as long as they reflect the real UI (they will, since it's a WebView).
- For Android, capture on a device/emulator at a standard phone resolution (e.g. Pixel 8 class) — no fixed aspect ratio requirement.
- Use `Cmd+S` in iOS Simulator (saves to Desktop) or the device's screenshot gesture. On Android emulator, use the emulator's camera-icon screenshot button.
- **Log in as a real seeded account with meaningful data** before shooting — empty states screenshot poorly and hurt conversion. Use a campaign with real contributions/territory (trash-war is the obvious choice per the app-capability doc).
- Status bar: consider whether to keep the real device status bar (Apple used to require "clean" status bars showing full signal/battery/9:41 time; this is no longer strictly enforced but still looks more polished) — worth a pass with `xcrun simctl status_bar` set to full bars if you want the polished look.

Once you've got the raw screenshots, marketing-text overlays (the bold captions app listings usually add on top, e.g. "Turn cleanup into competition") are optional polish — can do a follow-up pass in Figma/Canva or I can help lay them out once we have real screenshots to work from.

---

## 5. Open items before submission

- [x] Support email/URL — resolved, `frontlinemapsapp@gmail.com` is now live across the app (settings, support button, legal pages).
- [x] Confirm UGC "report" path exists for contribution/profile photos, not just trash reports — resolved, `ReportPhotoButton` now covers contribution photos, cleanup event photos, and avatars, backed by an admin moderation queue.
- [ ] Copyright holder name — resolve personal vs. LLC/nonprofit (blocks this one field, not the rest).
- [ ] Category final pick: Social Networking vs. Lifestyle (iOS), Social vs. Lifestyle/Maps & Navigation (Play).
- [ ] Capture the actual screenshots per the shot list above once on a device/simulator.
- [ ] iOS: `ios/` platform still needs the Mac-side setup per `capacitor-scoping-2026-08-04.md` item 3 before a build is even possible.
