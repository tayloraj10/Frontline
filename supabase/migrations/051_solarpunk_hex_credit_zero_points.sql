-- Trash War is now the app's main focus. The Solarpunk -> Trash War redirect
-- (`ref=solarpunk`) still blooms the user's hex for a cleanup logged that way, but
-- that credit should no longer also grant lifetime/spendable points on top of what
-- the cleanup itself already earns on Trash War — the user's points/spendable should
-- come entirely from the Trash War contribution.
--
-- POST /contributions/submit now inserts this hex credit as its own contribution_type
-- ('solarpunk_hex_credit') instead of 'solarpunk_action', so it still drives
-- territory_claims/bloom score and still shows in activity history, but is worth 0
-- here — unlike a real 'solarpunk_action' log (flat 2), which is unaffected.
CREATE OR REPLACE FUNCTION contribution_points(p_contribution_type TEXT, p_value NUMERIC)
RETURNS NUMERIC AS $$
  SELECT CASE p_contribution_type
    WHEN 'cleanup' THEN COALESCE(p_value, 0)
    WHEN 'photo' THEN COALESCE(p_value, 0)
    WHEN 'solarpunk_photo' THEN 1
    WHEN 'solarpunk_action' THEN 2
    WHEN 'solarpunk_hex_credit' THEN 0
    ELSE 0
  END;
$$ LANGUAGE sql IMMUTABLE;

-- Relabel historical auto-credit rows so they resum consistently with new ones going
-- forward (mixed labeling would otherwise leave old rows still worth 2 points each on
-- any future recompute, since recompute resums by contribution_type, not by notes).
-- These are the only rows ever inserted with this notes value (see contributions.py);
-- real user-submitted solarpunk_action rows never carry it.
UPDATE contributions
SET contribution_type = 'solarpunk_hex_credit'
WHERE contribution_type = 'solarpunk_action'
  AND notes = 'trash_war_cleanup_credit';

-- Note: this only relabels the source-of-truth contributions rows. It does not touch
-- profiles.points/spendable_points directly — run the admin "Recompute all balances"
-- action after this migration deploys to actually apply the corrected totals.
