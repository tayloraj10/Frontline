# Stripe Return Handoff and Frontline Plus In-App Purchase Scoping (2026-10-29)

**Status: scoping only. Nothing built.** Two related problems in the Capacitor apps:

1. After a Stripe-hosted page (payout onboarding, card setup), Stripe redirects to the https site and the phone opens it in the browser instead of returning to the app.
2. Frontline Plus is a digital subscription sold through Stripe Checkout. App store rules say that has to go through Apple In-App Purchase and Google Play Billing inside the apps.

Not legal advice. The legal picture below is moving; verify the flagged items before committing.

## Decisions locked in

- Return handoff: use the bounce page plus custom URL scheme approach ("option 2").
- Plus in the apps: the choice is **full IAP vs. what we have now** (Stripe Checkout in the app). No link-out entitlement path, no hide-the-button path.
- Donations and group sponsorships: no change. Out of scope for this doc.
- Marketplace payments (card on file, job charges, cleaner payouts) stay on Stripe. Real-world services consumed outside the app are exempt from IAP (Apple 3.1.3(e)).

## Part 1: Stripe return handoff

### Flow

Stripe redirects to an https bounce page, `/marketplace/stripe-return?next=<path>`. The page shows a "Return to the app" button that opens `com.frontlinemaps.app://<path>`. The app's `appUrlOpen` listener closes the in-app browser and navigates the webview to `https://www.frontlinemaps.com/<path>`.

Why a button and not a redirect: iOS and Android only hand off to an app on a user tap, never on a redirect, and iOS Universal Links never open the app for a same-domain tap from Safari. One extra tap is unavoidable.

### Surfaces covered

- Cleaner payout onboarding (`create_onboarding_link` in `backend/app/services/connect.py`, return and refresh URLs).
- Card setup (`POST /payments/card/setup`, `return_path` already restricted to `/marketplace...`).
- Plus checkout and billing portal are **not** covered if Part 2 ships: in the native app they are replaced by IAP and the system subscription screen. They stay on web with Stripe, and the web path needs no handoff.

### Work breakdown

| Area | Change | Ships with |
|---|---|---|
| Web | New page `/marketplace/stripe-return`. Validates `next` (starts with `/marketplace`, no `//`). Native user agent (`FrontlineNativeApp`): big "Return to the app" button. Otherwise: plain "Continue" link to the https path. Button should have a visible fallback link in case an old app build ignores the scheme. | Web deploy |
| Backend | `connect.py` refresh_url and return_url, and the card-setup return URL, point at the bounce page with `next` set to the current destinations. Also wrap `stripe.StripeError` in `ConnectError(e.user_message or "...", 502)` (the 500 on `accounts.create` earlier today). | Backend deploy |
| Frontend | `CleanerOnboarding.tsx` and `AddCardPrompt.tsx` handlers (`?payouts=`, card return) stay as they are; the bounce page forwards to the same URLs. | Web deploy |
| `NativeAppBridge.tsx` | In the `appUrlOpen` listener, also accept `com.frontlinemaps.app://`, map host+path to `https://www.frontlinemaps.com/<path>`, keep the origin check on the https branch. Call `Browser.close()` first. | Native release |
| Android | Add a VIEW/BROWSABLE intent filter for the scheme in `AndroidManifest.xml` (`custom_url_scheme` string already exists in `strings.xml`). | Native release |
| iOS | Add `com.frontlinemaps.app` to `CFBundleURLTypes` in `Info.plist` (currently only Google's reversed client id). | Native release |

### Rollout

1. Web and backend first. Until the native release, old app builds do not know the scheme, so the bounce page keeps its "Continue on web" link beside the button.
2. Native changes ride in the next bundled mobile release.
3. Test on a real device against prod. Local `FRONTEND_URL=localhost` is unreachable from a phone.

### Risks

- Any app can claim a custom scheme. The listener only takes a path and re-prefixes our own origin, and no tokens travel in the URL, so the worst case is a spoofed navigation to one of our own pages.
- Custom-scheme redirects were abandoned for Google sign-in (SFSafariViewController). This is different: it is a user-tapped button, not a redirect.
- If the user never taps, the payout/card state still updates through the Stripe webhook (`account.updated`) and `/payouts/status`, so nothing breaks, they just stay in the browser.

**Effort:** about a day of code plus device testing; native pieces are small but need a release cycle.

## Part 2: Frontline Plus in the apps

### What Plus is today

- Digital features: earning-cap multiplier, early access, monthly recap, supporter badge, insights cards, group insights.
- Two owner types in one `subscriptions` table (`owner_type` `user` or `group`, migration `109_payments.sql`). Group Plus is bought by a group admin for the group.
- Stripe-only: `subscriptions.stripe_customer_id`, `stripe_subscription_id` (UNIQUE), `stripe_price_id` are NOT NULL. Webhook `/payments/webhooks/stripe` upserts rows. `has_premium()` and `/plus-groups` just check `status IN ('active','trialing')`, so reads are provider-agnostic.
- Purchase UI is `SubscriptionWidget.tsx` (user profile, `/impact`, group page), which calls `checkout-session` / `portal-session` and does `window.location.assign`.
- Currently the whole payments surface is admin-only behind `payments_enabled` / `payments_admin_preview`. So today's store builds do not expose Plus to normal users; the compliance question bites at launch.

### Do the apps have to use store billing?

- **Apple:** Guideline 3.1.1 requires In-App Purchase to unlock digital features or content, subscriptions included. A native-app Stripe checkout for Plus is a rejection risk (and an account risk if it slips through and is found later).
- **Apple exemptions:** 3.1.3(e) lets goods and services consumed outside the app use other payments (marketplace cleaning jobs). 3.1.3(b) multiplatform services lets people use a subscription they bought elsewhere (web) inside the app, as long as the app does not itself sell or steer to that purchase.
- **Google:** Play Payments policy requires Google Play Billing for digital features in apps, with the programs described below as exceptions.

### Legal status (as of 2026-10-29, verify before relying)

**Apple / Epic**
- April 2025 injunction: Apple must allow US-storefront apps to link out to external purchases without its old restrictions. Apple changed Guidelines 3.1.1 and 3.1.3 for the US storefront only ([9to5Mac](https://9to5mac.com/2025/05/01/apple-app-store-guidelines-external-links/)).
- Ninth Circuit affirmed the civil contempt finding on Dec 11, 2025, but sent the flat ban on any commission back to the district court. Apple may be able to charge some fee tied to its costs ([Courthouse News](https://www.courthousenews.com/ninth-circuit-confirms-contempt-finding-against-apple-in-epic-games-battle/), [Fenwick](https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple)).
- Per Apple's 10-Q, the Supreme Court granted review on June 30, 2026, limited to the legal standard for civil contempt ([SEC 10-Q](https://www.sec.gov/Archives/edgar/data/0000320193/000032019326000020/aapl-20260627.htm)). A decision is likely in 2027.
- Sources conflict on whether US link-outs are commission-free right now (zero per [Tech Insider](https://tech-insider.org/apple-epic-supreme-court-2026/); 12% or 27% per [a 2026 implementation guide](https://stora.sh/blog/2026-05-16-apple-app-store-external-purchase-links-implementation-guide)). Unconfirmed.
- Outside the US storefront, the old rule stands: IAP for digital goods, and no steering to outside purchase.
- Practical takeaway: the US rules are a litigation-dependent exception, US-only, and could swing either way in 2027. IAP is the position that does not depend on any of it.

**Google / Epic**
- Google and Epic withdrew their proposed settlement in mid-July 2026, so the original October 2024 injunction governs ([MacRumors](https://www.macrumors.com/2026/07/15/google-third-party-app-stores/)).
- External offers and alternative billing programs (launched Dec 9, 2025) remain available, with fee reporting and payment due Dec 1, 2026 per the latest schedule ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)). Fee percentage not confirmed.
- Practical takeaway: Play Billing is still the default and the safe path for Android.

**Bottom line for the choice:** keeping Stripe Checkout in the app only works as an exception (US link-out, or Google alternative programs) that is being actively litigated and fee-encumbered, and still would not cover non-US iOS. Full IAP is the compliant default everywhere.

### Option A: keep what we have (Stripe Checkout inside the app)

- No new work beyond Part 1.
- Rejection risk under Apple 3.1.1 at review once Plus is visible to users. Google risk similar.
- If rejected or flagged post-launch, Plus has to be pulled from the app anyway, so the work is deferred, not avoided.
- No store fee (Stripe only, roughly 2.9% + 30c).

### Option B: full IAP (recommended)

Apple IAP (StoreKit) on iOS, Google Play Billing on Android, Stripe stays for web. One entitlement concept, three payment providers.

#### Architecture

- **Client:** a Capacitor purchases plugin. Strongest candidate is RevenueCat (`@revenuecat/purchases-capacitor`), which handles StoreKit 2 / Play Billing, receipt validation, restore, and server webhooks, and has a free tier below a revenue threshold (verify current pricing). Alternative is a lower-level plugin plus our own validation against App Store Server API and Google Play Developer API, with App Store Server Notifications V2 and Google Real-Time Developer Notifications. Recommend RevenueCat to avoid owning two receipt-validation pipelines.
- **Mapping purchases to owners:** set the RevenueCat app user id (or Apple `appAccountToken`, Google obfuscated account id) to our owner id (`profiles.id` or `groups.id`). The webhook then knows which owner row to update.
- **Backend:** new webhook `POST /payments/webhooks/revenuecat` (or Apple/Google notification endpoints) that upserts into `subscriptions`. Reuse `record_webhook_event_once` for idempotency.
- **Schema (new migration, renumber at time of work):** add `provider text NOT NULL DEFAULT 'stripe' CHECK (provider IN ('stripe','apple','google'))`; add `external_subscription_id text`; make `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id` nullable; replace the single UNIQUE on `stripe_subscription_id` with a unique on `(provider, external_subscription_id)`. `has_premium()` and `/plus-groups` keep working unchanged because they only read `status`.
- **Double-subscription guard:** a user could hold both a Stripe sub (web) and an IAP sub. `subscriptions` allows multiple rows per owner, which is fine for `has_premium` (any active), but UI must show which provider owns the active sub and block starting a second one: checkout endpoint returns 409 if an active sub exists for the owner on another provider.
- **Frontend:** `SubscriptionWidget.tsx` branches on native platform. Native: IAP purchase sheet, "Restore purchases" button, "Manage subscription" opens the system subscription management screen. Web: unchanged Stripe flow. If the active sub's provider is not Stripe, the web widget shows "Managed through the App Store / Google Play" with no portal button. No web-purchase prompt anywhere inside the native app (3.1.1).
- **Entitlement sync:** `/entitlement` response gains `provider` so the UI can render the right management action.

#### Console and business setup (the slow part)

- Apple: accept the Paid Applications Agreement, add banking and tax info, create the subscription group and product in App Store Connect (e.g. `plus_monthly`, $4.99), enroll in the App Store Small Business Program for the reduced commission (verify current rate and eligibility; I believe 15% under $1M proceeds).
- Google: Play Console merchant account, create the subscription product and base plan; Google's subscription service fee has been 15% (verify).
- Both stores need pricing set per country; prices can differ from Stripe web pricing but should be kept deliberately consistent.
- Subscription metadata required for review: title, description, duration, price, auto-renewal disclosure, links to terms and privacy in the paywall, a working "Restore purchases".
- First submission with an IAP must include the IAP product in review. Sandbox testing needs TestFlight / sandbox testers on iOS and license testers on Play.

#### Group Plus (open question)

IAP subscriptions belong to an Apple ID or Google account, not a group. Options:
1. IAP for both. The purchasing group admin's store account owns the sub; we attach it to the group via the account token. If that admin leaves or cancels, the group loses Plus. Simple, with a clear limitation.
2. IAP for user Plus only; group Plus is only purchasable on web (and shown as active in the app). Group Plus is a digital feature too, so Apple could still object to a native purchase button for it even though it is not on the native app; but not offering it natively at all avoids the problem entirely.

Recommendation: option 2 (user Plus via IAP, group Plus web-only and not mentioned in native) unless group Plus is expected to matter in app revenue. This needs a call from you.

#### Costs and tradeoffs

- Store fee on every in-app purchase (about 15% at small-business rates; not 30%) versus roughly 3% on Stripe. At $5/month, that is about $0.75 vs about $0.15.
- Three provider states to reconcile (webhook ordering, grace periods, billing retry, refunds, revoked entitlements). RevenueCat reduces but does not remove this.
- Cancelling and refunds happen in the stores, not our UI, for IAP subscribers.
- Needs a native release plus store review; cannot be shipped web-only.

#### Work breakdown

| Step | Notes |
|---|---|
| Store setup | Agreements, banking/tax, products in both consoles, RevenueCat project and entitlement `plus` |
| Migration | `provider`, `external_subscription_id`, nullable stripe columns, new unique constraint, renumbered to current master head |
| Backend webhook | `/payments/webhooks/revenuecat`, signature/authorization check, idempotent upsert, owner resolution |
| Entitlement API | Add `provider`, add 409 guard in `checkout-session` |
| Native client | Install plugin, configure on app start with owner id after login, purchase, restore, manage links |
| `SubscriptionWidget` | Platform branch, restore button, provider-aware management |
| Docs and seeding | Update `app-capability-doc.md`; extend `payments_mock` seeder per the Seeder registry rule if new fixture data is needed |
| Test | Sandbox purchase, renewal, cancel, refund, restore; web+IAP double-subscription guard |
| Release | Bundle with Part 1 native changes |

**Effort:** roughly one to two weeks including console setup and review cycles; the console/business setup and store review are the unpredictable part, not the code.

### Recommendation

Go with Option B (full IAP) for user Plus, delivered in the same native release as Part 1 (the native release is the bottleneck, so bundling is cheap). Treat group Plus as web-only unless you decide otherwise. Keep Stripe Checkout unchanged on web.

## Open questions

1. Group Plus: web-only (recommended) or also IAP?
2. RevenueCat vs. rolling our own validation?
3. Keep web and in-app prices identical, or let IAP price include some of the store fee?
4. Plus launch gating: when `payments_enabled` flips for everyone, is the IAP build already shipped? (Plus must not be visible in a native build that still has Stripe checkout once Plus goes public.)
5. Pricing/fee claims above (Small Business rate, Google subscription rate, RevenueCat free tier) need a check against the current official pages before the numbers go into any decision.

## Sources

- [Apple 10-Q, Q3 FY2026](https://www.sec.gov/Archives/edgar/data/0000320193/000032019326000020/aapl-20260627.htm)
- [Courthouse News, Ninth Circuit confirms contempt](https://www.courthousenews.com/ninth-circuit-confirms-contempt-finding-against-apple-in-epic-games-battle/)
- [Fenwick, Ninth Circuit largely upholds ruling](https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple)
- [Tech Insider, Supreme Court to hear Apple-Epic appeal](https://tech-insider.org/apple-epic-supreme-court-2026/)
- [Stora, external purchase links implementation guide](https://stora.sh/blog/2026-05-16-apple-app-store-external-purchase-links-implementation-guide)
- [9to5Mac, App Store guidelines external links](https://9to5mac.com/2025/05/01/apple-app-store-guidelines-external-links/)
- [MacRumors, Google and Epic abandon injunction modification](https://www.macrumors.com/2026/07/15/google-third-party-app-stores/)
- [Play Console Help, policies for developers serving users in the US](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)
