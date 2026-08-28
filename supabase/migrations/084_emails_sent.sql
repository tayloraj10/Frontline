-- General-purpose outbound-email log. Every email the backend sends (via Resend)
-- gets a row here regardless of kind, so future kinds don't need their own table.
-- No RLS: this is only ever written/read by the backend's direct Postgres
-- connection (mirrors cleanup_team_total_logs, 043), never queried by the
-- frontend directly.

CREATE TABLE emails_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  to_emails text[] NOT NULL,
  cc_emails text[] NOT NULL DEFAULT '{}',
  bcc_emails text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL,
  related_id uuid,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_emails_sent_kind ON emails_sent (kind, created_at DESC);
CREATE INDEX idx_emails_sent_related_id ON emails_sent (related_id);
