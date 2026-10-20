-- Second payments toggle: lets an admin hide every payment surface from themselves too
-- (to view the app as a normal user would). Defaults on, which keeps today's behavior:
-- site admins always see payment UI; everyone else is gated by payments_enabled.
-- See frontend/src/lib/paymentsVisibility.ts for the combined rule.
INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('payments_admin_preview', 1, 'payments', 'Show payment features to admins', 'While on, site admins see payment features (subscriptions, sponsorships, premium insights) even when Payments enabled is off. Turn off to hide all payment features from everyone, admins included, to preview the app as a normal user sees it.');
