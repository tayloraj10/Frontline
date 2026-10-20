-- Payments hardening: keep subscriptions.updated_at accurate on any future direct write
-- (not just the webhook upsert path), and dedupe Stripe webhook deliveries on event id
-- so a retried delivery can't double-process (Stripe retries on any non-2xx response,
-- and delivers at-least-once even in the success case).

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TABLE stripe_webhook_events (
  id text PRIMARY KEY,  -- Stripe event id (evt_...)
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No public policies: backend-only access via the service-role connection.
