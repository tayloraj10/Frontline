-- Link an event to a group-area sponsorship pool. One live allocation per event.
ALTER TABLE cleanups ADD COLUMN sponsorship_id UUID REFERENCES sponsorships(id) ON DELETE SET NULL;
CREATE INDEX cleanups_sponsorship_idx ON cleanups(sponsorship_id) WHERE sponsorship_id IS NOT NULL;

CREATE UNIQUE INDEX sponsorship_allocations_one_per_cleanup
  ON sponsorship_allocations(cleanup_id) WHERE cleanup_id IS NOT NULL AND status <> 'rejected';
