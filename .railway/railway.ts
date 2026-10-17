// DRAFT — not yet applied. Generated as a starting point to migrate off the
// deprecated railway.*.toml Config-as-Code files before the 2026-12-01 cutoff.
//
// Before running `railway config apply`:
//   1. Run `railway config init` first if you haven't — it may generate its own
//      starter file reflecting your project's *actual* current service names/IDs.
//      Reconcile that against this draft rather than blindly overwriting it.
//   2. Run `railway config plan` and read the full diff. It should show these
//      services as already existing (matched by name) with no changes, or only
//      the intended changes — NOT as new services being created. If it wants to
//      create duplicates, the service `name` below doesn't match what's actually
//      named in your Railway dashboard; fix the name before applying.
//   3. The `builder`/Dockerfile fields below are my best guess at the IaC syntax
//      for a Docker-based build — I could not confirm the exact field name from
//      Railway's docs (their reference examples only showed shell build commands
//      like `pnpm build`, not `dockerfilePath`). Verify against what
//      `railway config init` / `railway config plan` actually expects and adjust.
//   4. Env vars are referenced as placeholders, not filled in with real values —
//      copy the actual values from each existing service's Variables tab in the
//      dashboard rather than typing secrets into this file.
//   5. Cron schedules: Railway's cron-jobs docs describe the schedule as a
//      per-service Settings field, not a confirmed IaC key. `cronSchedule` below
//      is included on the chance it's supported; if `plan` rejects it, set the
//      schedule by hand in that service's Settings tab after applying everything else.

import { defineRailway, project, service, github } from "railway/iac";

const REPO = "tayloraj10/Frontline";

export default defineRailway(() => {
  const api = service("frontline-api", {
    source: github(REPO, { rootDirectory: "backend" }),
    builder: "dockerfile",
    dockerfilePath: "Dockerfile",
    healthcheck: "/health",
    healthcheckTimeout: 100,
    restartPolicyType: "ON_FAILURE",
    restartPolicyMaxRetries: 5,
    env: {
      DATABASE_URL: "<copy from existing frontline-api service>",
      SUPABASE_URL: "<copy from existing frontline-api service>",
      SUPABASE_SERVICE_ROLE_KEY: "<copy from existing frontline-api service>",
      RESEND_API_KEY: "<copy from existing frontline-api service>",
      // ...plus any other vars the current frontline-api service has set.
    },
  });

  const decayCron = service("decay-cron", {
    source: github(REPO, { rootDirectory: "backend" }),
    builder: "dockerfile",
    dockerfilePath: "Dockerfile",
    start: "python scripts/run_decay.py",
    cronSchedule: "0 */6 * * *",
    restartPolicyType: "NEVER",
    env: {
      API_URL: api.domain, // or whatever the prod API base URL actually is
    },
  });

  const eventsExpiryCron = service("events-expiry-cron", {
    source: github(REPO, { rootDirectory: "backend" }),
    builder: "dockerfile",
    dockerfilePath: "Dockerfile",
    start: "python scripts/run_events_expiry.py",
    cronSchedule: "*/30 * * * *",
    restartPolicyType: "NEVER",
    env: {
      API_URL: api.domain,
    },
  });

  const organizerRemindersCron = service("organizer-reminders-cron", {
    source: github(REPO, { rootDirectory: "backend" }),
    builder: "dockerfile",
    dockerfilePath: "Dockerfile",
    start: "python scripts/run_organizer_reminders.py",
    cronSchedule: "0 12 * * *",
    restartPolicyType: "NEVER",
    env: {
      API_URL: api.domain,
    },
  });

  const organizerFollowupsCron = service("organizer-followups-cron", {
    source: github(REPO, { rootDirectory: "backend" }),
    builder: "dockerfile",
    dockerfilePath: "Dockerfile",
    start: "python scripts/run_organizer_followups.py",
    cronSchedule: "30 12 * * *",
    restartPolicyType: "NEVER",
    env: {
      API_URL: api.domain,
    },
  });

  return project("frontline", {
    resources: [api, decayCron, eventsExpiryCron, organizerRemindersCron, organizerFollowupsCron],
  });
});
