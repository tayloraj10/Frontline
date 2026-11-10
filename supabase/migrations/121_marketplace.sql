-- Paid cleaner marketplace (see dev-docs/paid-cleaner-marketplace-scoping-2026-10-22.md).
-- Two directions on one booking core: cleaner directory (profiles + bookings) and a job
-- board (open jobs + offers). Backend-only access via the service role, same as
-- sponsorships; admin-only until launch via the marketplace_enabled setting.
-- No money moves from these tables yet: payment columns are placeholders for the Stripe
-- Connect work (hold at acceptance, release on confirm or auto-release).

INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('marketplace_enabled', 0, 'payments', 'Marketplace enabled', 'Master switch for the paid cleaner marketplace. Must be on, in addition to the payments visibility settings (admin preview or payments enabled), for anyone including admins to see it.'),
  ('marketplace_platform_fee_percent', 10, 'payments', 'Marketplace: platform fee (percent)', 'Percent of each booking kept by Frontline. Placeholder until the fee decision is made.'),
  ('marketplace_auto_release_days', 3, 'payments', 'Marketplace: auto-release days', 'Days after a cleaner marks a job complete before payment auto-releases if the customer has not confirmed or disputed.'),
  ('marketplace_flexible_max_days', 14, 'payments', 'Marketplace: flexible window cap (days)', 'Longest a Flexible job can stay open before it expires and any hold is released.')
ON CONFLICT (key) DO NOTHING;

-- Versioned legal agreements and one row per user acceptance (every version is kept).
CREATE TABLE marketplace_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('cleaner', 'customer')),
  version integer NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);
CREATE UNIQUE INDEX marketplace_agreements_current_idx ON marketplace_agreements(kind) WHERE is_current;

CREATE TABLE marketplace_agreement_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  agreement_id UUID NOT NULL REFERENCES marketplace_agreements(id),
  legal_name text NOT NULL,
  is_adult boolean NOT NULL DEFAULT false,
  ip_address text,
  app_version text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, agreement_id)
);
CREATE INDEX marketplace_acceptances_user_idx ON marketplace_agreement_acceptances(user_id);

-- A user who has opted in as a cleaner. One profile per user.
CREATE TABLE cleaner_profiles (
  user_id UUID PRIMARY KEY REFERENCES profiles(id),
  headline text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  services text[] NOT NULL DEFAULT '{}',
  rate_type text NOT NULL DEFAULT 'hourly' CHECK (rate_type IN ('hourly', 'fixed')),
  rate_cents integer CHECK (rate_cents IS NULL OR rate_cents > 0),
  service_radius_km integer NOT NULL DEFAULT 10 CHECK (service_radius_km BETWEEN 1 AND 100),
  home_location geography(Point, 4326),
  area_label text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'active', 'paused', 'suspended')),
  stripe_connect_account_id text,
  payouts_enabled boolean NOT NULL DEFAULT false,
  rating_avg numeric(3,2),
  rating_count integer NOT NULL DEFAULT 0,
  jobs_completed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cleaner_profiles_status_idx ON cleaner_profiles(status);
CREATE INDEX cleaner_profiles_location_idx ON cleaner_profiles USING gist (home_location);
CREATE TRIGGER cleaner_profiles_set_updated_at BEFORE UPDATE ON cleaner_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A job: either a direct booking request to one cleaner (cleaner_id set at creation) or an
-- open job on the board (cleaner_id null until an offer is accepted).
CREATE TABLE marketplace_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES profiles(id),
  cleaner_id UUID REFERENCES profiles(id),
  origin text NOT NULL CHECK (origin IN ('direct', 'board')),

  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  job_type text NOT NULL,
  size text CHECK (size IN ('small', 'medium', 'large')),
  hazards_ack boolean NOT NULL DEFAULT false,
  address_label text,
  location geography(Point, 4326),

  time_mode text NOT NULL CHECK (time_mode IN ('specific', 'window', 'flexible')),
  starts_at timestamptz,
  window_start timestamptz,
  window_end timestamptz,
  flexible_days integer CHECK (flexible_days IS NULL OR flexible_days BETWEEN 1 AND 30),
  scheduled_at timestamptz,
  expires_at timestamptz,

  price_type text NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('hourly', 'fixed')),
  price_cents integer NOT NULL CHECK (price_cents > 0),
  platform_fee_cents integer NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'open', 'accepted', 'in_progress', 'completed',
    'confirmed', 'released', 'declined', 'cancelled', 'expired', 'disputed', 'refunded'
  )),
  cancelled_by UUID REFERENCES profiles(id),
  cancel_reason text,

  safety_ack_at timestamptz,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  confirmed_at timestamptz,
  release_after timestamptz,
  released_at timestamptz,

  stripe_payment_intent_id text,
  stripe_transfer_id text,
  hold_status text NOT NULL DEFAULT 'none' CHECK (hold_status IN ('none', 'held', 'released', 'refunded')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketplace_jobs_direct_has_cleaner CHECK (origin <> 'direct' OR cleaner_id IS NOT NULL),
  CONSTRAINT marketplace_jobs_time_fields CHECK (
    (time_mode = 'specific' AND starts_at IS NOT NULL)
    OR (time_mode = 'window' AND window_start IS NOT NULL AND window_end IS NOT NULL AND window_end >= window_start)
    OR (time_mode = 'flexible' AND flexible_days IS NOT NULL)
  )
);
CREATE INDEX marketplace_jobs_customer_idx ON marketplace_jobs(customer_id);
CREATE INDEX marketplace_jobs_cleaner_idx ON marketplace_jobs(cleaner_id) WHERE cleaner_id IS NOT NULL;
CREATE INDEX marketplace_jobs_status_idx ON marketplace_jobs(status);
CREATE INDEX marketplace_jobs_location_idx ON marketplace_jobs USING gist (location);
CREATE TRIGGER marketplace_jobs_set_updated_at BEFORE UPDATE ON marketplace_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Offers from cleaners on open board jobs.
CREATE TABLE marketplace_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES marketplace_jobs(id) ON DELETE CASCADE,
  cleaner_id UUID NOT NULL REFERENCES profiles(id),
  price_cents integer NOT NULL CHECK (price_cents > 0),
  message text,
  proposed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, cleaner_id)
);
CREATE INDEX marketplace_offers_job_idx ON marketplace_offers(job_id);

-- In-app messages tied to a job (contact details stay hidden until acceptance).
CREATE TABLE marketplace_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES marketplace_jobs(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_messages_job_idx ON marketplace_messages(job_id, created_at);

-- Before and after photos, check-in photos (R2 keys or URLs).
CREATE TABLE marketplace_job_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES marketplace_jobs(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES profiles(id),
  kind text NOT NULL CHECK (kind IN ('before', 'after', 'checkin', 'dispute')),
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_job_photos_job_idx ON marketplace_job_photos(job_id);

-- One review per side per completed job.
CREATE TABLE marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES marketplace_jobs(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id),
  reviewee_id UUID NOT NULL REFERENCES profiles(id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, reviewer_id)
);
CREATE INDEX marketplace_reviews_reviewee_idx ON marketplace_reviews(reviewee_id) WHERE NOT removed;

-- Reports and disputes share one admin queue.
CREATE TABLE marketplace_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id),
  job_id UUID REFERENCES marketplace_jobs(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES profiles(id),
  kind text NOT NULL CHECK (kind IN ('dispute', 'safety', 'abuse', 'other')),
  details text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution text,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_reports_status_idx ON marketplace_reports(status);

CREATE TABLE marketplace_blocks (
  blocker_id UUID NOT NULL REFERENCES profiles(id),
  blocked_id UUID NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE marketplace_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_agreement_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_job_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_blocks ENABLE ROW LEVEL SECURITY;
-- No public policies: backend-only access via the service role, same as sponsorships.

-- Draft agreement text (v1). Placeholder wording for counsel to replace before any real launch.
INSERT INTO marketplace_agreements (kind, version, title, body, is_current) VALUES
  ('cleaner', 1, 'Cleaner agreement and liability waiver (draft)',
   E'DRAFT FOR LEGAL REVIEW. Not final wording.\n\n1. Independent contractor. You are not an employee or agent of Frontline. You choose which jobs to take, set your own rates, and decide how to do the work.\n2. Assumption of risk. Cleanup work is physical and can cause injury. You accept those risks and release Frontline from claims for injury or property damage arising from jobs you take, to the extent the law allows.\n3. Safety rules. Do not handle hazardous waste, sharps, biohazards or unknown chemicals. Do not enter confined or unsafe spaces. Do not work alone at night. Stop and leave if a site is unsafe.\n4. Your responsibilities. You provide your own tools and protective gear, and you are responsible for your taxes and any local licences.\n5. Conduct. Be honest, respectful and on time. No harassment, theft or off-platform payment.\n6. Age. You confirm you are at least 18.\n7. Changes. If these terms change you must accept the new version before taking more jobs.',
   true),
  ('customer', 1, 'Customer terms (draft)',
   E'DRAFT FOR LEGAL REVIEW. Not final wording.\n\n1. Authority. You have the right to authorize work on the property you describe.\n2. Accuracy. Describe the site and job honestly and disclose any known hazards.\n3. No hazardous materials. Do not request work involving hazardous waste, sharps, biohazards or anything needing a licence.\n4. Payment. Payment is held when a cleaner accepts and is released when you confirm the job, or automatically after the review period if there is no dispute.\n5. Venue. Frontline is a venue that connects you with independent cleaners and is not the contractor or employer.\n6. Changes. If these terms change you must accept the new version before posting more jobs.',
   true);
