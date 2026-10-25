// Replaces backend/railway*.toml (Config as Code is deprecated, cutoff 2026-12-01).
// Service names match the live production services. Variables are unmanaged:
// all env vars stay where they are in Railway and are not touched by this file.
//
// This file does NOT apply itself on git push. On a fresh clone run `npm install` in this
// folder first (it provides the railway/iac import). After editing, run from the repo root:
//   "C:\Users\taylo\AppData\Roaming\npm\node_modules\@railway\cli\bin\railway.exe" config plan
//   "C:\Users\taylo\AppData\Roaming\npm\node_modules\@railway\cli\bin\railway.exe" config apply --yes
// (Call the real railway.exe directly; the npm `railway` shim breaks the SDK's CLI version check on Windows.)

import { defineRailway, github, project, service } from "railway/iac";

export default defineRailway(() => {
  const repo = github("tayloraj10/Frontline", {
    branch: "master",
    checkSuites: false,
    rootDirectory: "/backend",
  });

  // watchPatterns: only deploy when backend files change (frontend/supabase/docs pushes are skipped).
  const build = {
    buildEnvironment: "V3",
    builder: "DOCKERFILE",
    dockerfilePath: "Dockerfile",
    watchPatterns: ["/backend/**"],
  } as const;

  const api = service("Frontline", {
    source: repo,
    build,
    healthcheck: "/health",
    healthcheckTimeout: 100,
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 5 },
    replicas: { "us-east4-eqdc4a": 1 },
    networking: { privateNetworkEndpoint: "frontline" },
  });

  const cron = (name: string, script: string, schedule: string) =>
    service(name, {
      source: repo,
      build,
      deploy: {
        startCommand: `python scripts/${script}`,
        cronSchedule: schedule,
        restartPolicyType: "NEVER",
      },
      replicas: { sfo: 1 },
      networking: { privateNetworkEndpoint: `backend-${name}` },
    });

  const decayCron = cron("decay-cron", "run_decay.py", "0 */6 * * *");
  const eventsExpiryCron = cron("events-expiry-cron", "run_events_expiry.py", "*/30 * * * *");
  const organizerRemindersCron = cron("organizer-reminders-cron", "run_organizer_reminders.py", "0 12 * * *");
  const organizerFollowupsCron = cron("organizer-followups-cron", "run_organizer_followups.py", "30 12 * * *");
  const marketplaceSweepCron = cron("marketplace-sweep-cron", "run_marketplace_sweep.py", "*/15 * * * *");

  return project("alluring-exploration", {
    variables: { managed: false },
    resources: [api, decayCron, eventsExpiryCron, organizerRemindersCron, organizerFollowupsCron, marketplaceSweepCron],
  });
});
