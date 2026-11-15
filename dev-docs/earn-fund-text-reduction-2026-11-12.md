# Earn and Fund: cutting the text (2026-11-12)

Reference only. No code changes are planned from this doc. First pass based on reading the pages, so word counts are approximate.

## Status (updated 2026-11-12)

Decision: **none of the changes below are being implemented.** The Earn and Fund screens already read cleaner after the recent passes, so this doc is kept as reference only, to revisit if the pages get wordy again.

What changed since this was written, for context:
- The compare strip on Fund was tried and rejected. The "Sponsor or hire?" explainer is now a button that opens a modal (`InfoModal`), so it takes no page space. The in-page strip described under Fund and in the open questions is stale.
- The Sponsor page is its own page titled "Fund a cleanup", with Cleanup site and Group area as two aligned tiles as the first step (the "option tiles" idea below, done).
- `FundingGuideCard` is now that modal button, not a collapsed card.

## Principle

People do not read. Every screen gets one job, one short line, and a visual that carries the rest (icon, number, pill, color). Explanations move to a single place users opt into, and the forms themselves explain by showing a live preview, not by paragraphs.

Rules of thumb:
- Header subtitle: 8 words or fewer, or drop it.
- Card or chip label: 1 to 3 words, plus an icon. No sentence under it.
- Helper text under a field: only when the field is not obvious, 10 words max.
- Never two blocks that say the same thing (the guide card, the walkthrough, and the form intro currently overlap).
- Numbers and previews beat prose ("You pay $25, cleaner gets $22.50" instead of a paragraph about fees).

## Where the text is now (rough sizes)

| Block | Words | Problem |
|---|---|---|
| `FundingGuideCard` ("Sponsor or hire?") | ~310 | Five long items, collapsed but still the main explainer |
| `EarnGuideCard` ("Two ways to earn") | ~180 | Three items, duplicates the walkthrough |
| `SponsorshipsHub` form | very large file | Section blurb, step labels, per-field helper text, payout summary prose |
| `NewPoolForm` | large | Intro plus per-field helper text |
| `JobForm` | very large | Long list of toggles, each with a sentence |
| Fund page sponsor intro (now removed from the page) | ~60 | Replaced by the form's own page |
| Page header subtitles | 12 to 25 each | Longer than the title and chips combined |
| `FlowGuide` walkthroughs (funding, marketplace) | many steps | Good for opt-in, but too wordy per step |

## Page by page

### Earn (`/earn`)
- Subtitle: drop it, or "Get paid to clean." The tab title and chips already say it.
- Chips (Take a job, Claim a site, My profile, My jobs) are fine. No text under them.
- `EarnGuideCard`: replace three paragraphs with three icon rows of 6 words each ("Take a neighbor's job", "Claim a sponsored site", "Get paid through Stripe"). Details live in the walkthrough.
- `PayoutSetupCard`: show only a status pill ("Payouts: set up" or "Set up payouts" button). Everything else behind the existing expand.
- Site list rows: price, distance, one status pill. No description line.

### Fund (`/fund`)
- Subtitle: "Hire, sponsor, or crowdfund." (4 words), or drop it.
- `FundingGuideCard`: replace the five items with a three-column compare strip: **Hire** (one neighbor, one job), **Sponsor** (a place, anyone can claim), **Crowdfund** (many people, big goal). Icon, 2 words, 1 short line each. Or move it into a "How does this work?" modal and delete the card.
- "Community crowdfunds" block: remove the sentence, keep the title and the cards.
- Admin moderation button: fine, it is already numbers and icons.

### Sponsor a cleanup (`/fund/sponsor`, now its own page)
- Header subtitle: shorten to "Fund a spot or an area."
- Replace the Cleanup site vs Group area explanation with two big option tiles (icon, name, 4 word line) that are the first step. Selecting one is the explanation.
- Step labels already exist. Remove per-step intro sentences.
- Pay rule options (`RULE_OPTIONS`): one line each, example amount instead of definition.
- Payout summary: keep as the one visual explainer, as a small table (You pay, Fee, Cleaner gets). Delete the paragraph around it.
- "Let neighbors add to this": a toggle with a 6 word label and an info icon that opens a tooltip.
- Message to cleaners and business picker: label only, no helper text.

### Post a job (`/fund/post`) and `JobForm`
- Subtitle: "Describe it, set a price." Payment-hold detail moves to one line next to the price field ("Held until a cleaner accepts.").
- Each toggle (bags at my house, snow options, salt) gets a label plus an icon only. Put the longer wording in a tap-to-open info icon.
- Group optional fields under one collapsed "More options" row.

### Start a pool (`/fund/pools/new`)
- Subtitle: "Set a goal. Neighbors chip in." Move the refund promise to a single line under the Create button.
- Replace field helper text with placeholders and examples.

### Pool page, cleaner pages, bookings
- Pool page: progress bar, amount raised, deadline, one button. Description is user-written, so cap its display at 3 lines with a "More" link.
- Cleaner list and profile: badges and numbers over sentences. Badge legend only on tap.
- `/earn/profile` (cleaner onboarding): the completeness meter is good. Cut per-item blurbs to the item name, and show the agreement as a checkbox with a link, not pasted text.

## Cross-cutting changes

1. **One explainer per product, opt-in.** Each tab gets one "How does this work?" link (already present in the header) that opens a modal or FlowGuide. Delete the in-page guide cards after the walkthroughs are tightened.
2. **Info icons for the rest.** A small shared `InfoTip` (tap to open a short popover) replaces helper paragraphs. One component, used everywhere.
3. **Question 1 answer (info panel vs modal).** Use the modal or walkthrough behind the header "How does this work?" link, not a panel at the bottom of the page. A panel at the bottom is below the fold on a phone and competes with the map. If we keep any in-page hint, make it a one-line comparison strip above the chips, not a disclosure.
4. **Walkthrough steps.** Cap each step at 1 sentence plus an icon. Merge steps so each flow is 3 to 4 steps.
5. **Visual hierarchy.** Big number or pill first (price, status), label second, detail only on tap.
6. **Copy audit rule.** Any new sentence over 12 words needs a reason. Do a pass with a word counter on each `.tsx` copy block after the changes.

## Suggested order

1. Add `InfoTip`, then convert the sponsor form and `JobForm` helper text (biggest word count).
2. Replace `FundingGuideCard` and `EarnGuideCard` with the compare strip and icon rows, or remove them.
3. Shorten header subtitles on Earn, Fund, Post, Pool, Profile.
4. Tighten the `funding` and `marketplace` walkthroughs.
5. Phone pass in the Capacitor app to confirm nothing important was cut.

## Open questions
- Keep a one-line subtitle on every page, or drop them entirely on pages with chips?
- Is the compare strip on Fund better than removing the guide card outright?
- Should the legal and refund wording stay visible at point of payment (probably yes, one line, since it affects trust)?
