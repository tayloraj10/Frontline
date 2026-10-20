-- Global kill switch for money-related features. While off, payment surfaces
-- (subscriptions, sponsorships, premium insights, supporter badges) are only
-- visible/usable by site admins, regardless of any other gating. Flipping this
-- on is the "go live" switch: it opens those surfaces to all users.
INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('payments_enabled', 0, 'payments', 'Payments enabled', 'Master switch for all money-related features (subscriptions, sponsorships, premium insights, supporter badges). While off, these are only visible to site admins. Turn on to launch payments to everyone.');
