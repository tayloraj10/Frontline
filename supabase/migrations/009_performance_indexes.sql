-- Indexes for heavily-queried foreign keys and sort columns.
-- contributions: campaign_id drives every leaderboard/feed/count query.
CREATE INDEX IF NOT EXISTS contributions_campaign_id_idx
    ON contributions (campaign_id);

-- contributions: user_id used in profile page and leaderboard GROUP BY.
CREATE INDEX IF NOT EXISTS contributions_user_id_idx
    ON contributions (user_id);

-- contributions: submitted_at ordering for activity feeds.
CREATE INDEX IF NOT EXISTS contributions_submitted_at_idx
    ON contributions (submitted_at DESC);

-- territory_claims: campaign_id is the primary filter on every campaign page.
CREATE INDEX IF NOT EXISTS territory_claims_campaign_id_idx
    ON territory_claims (campaign_id);

-- territory_claims: claimed_by_user for profile-page tract counts.
CREATE INDEX IF NOT EXISTS territory_claims_claimed_by_user_idx
    ON territory_claims (claimed_by_user);

-- territory_claims: claimed_by_group for group leaderboard tract counts.
CREATE INDEX IF NOT EXISTS territory_claims_claimed_by_group_idx
    ON territory_claims (claimed_by_group);

-- group_members: user_id for membership lookups.
CREATE INDEX IF NOT EXISTS group_members_user_id_idx
    ON group_members (user_id);

-- group_members: group_id for member-count queries.
CREATE INDEX IF NOT EXISTS group_members_group_id_idx
    ON group_members (group_id);
