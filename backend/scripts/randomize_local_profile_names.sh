#!/usr/bin/env bash
# One-off: randomize display_name for every row in the LOCAL profiles table so a prod
# snapshot (see pull_prod_snapshot.sh) doesn't show real users' names in screenshots/recordings.
# Local-only — never touches prod. Requires local Supabase running (`npx supabase start`).
#
# Usage:
#   ./backend/scripts/randomize_local_profile_names.sh
set -euo pipefail

CONTAINER="supabase_db_frontline"

echo "Randomizing display_name for all local profiles..."
# random() must be called directly in the per-row SET expression, not inside a subquery —
# an uncorrelated `(SELECT ... ORDER BY random() LIMIT 1)` gets hoisted by the planner into
# a single InitPlan and evaluated ONCE for the whole query, silently giving every row the
# same name (bit us twice: "Sharp Compass" then "Lauren Martinez" for every single profile).
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "
  UPDATE profiles
  SET display_name = (ARRAY[
    'James','Maria','David','Sarah','Michael','Jessica','Chris','Amanda','Daniel','Emily',
    'Matthew','Ashley','Andrew','Nicole','Joshua','Stephanie','Brian','Rachel','Kevin','Lauren',
    'Justin','Megan','Ryan','Hannah','Jason','Samantha','Eric','Victoria','Tyler','Olivia',
    'Brandon','Sophia','Jacob','Emma','Nathan','Grace','Aaron','Chloe','Adam','Natalie',
    'Marcus','Camila','Diego','Priya','Wei','Fatima','Hiro','Aisha','Carlos','Yuki'
  ])[floor(random() * 50 + 1)::int]
  || ' ' ||
  (ARRAY[
    'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
    'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
    'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
    'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores'
  ])[floor(random() * 40 + 1)::int];
"

echo "Done. Local profiles.display_name randomized (username/avatar_url/points untouched)."
