-- Btree index on campaign_id so the planner can bitmap-AND it with the geometry GIST index
CREATE INDEX IF NOT EXISTS geo_units_campaign_id_idx
    ON geo_units (campaign_id);
