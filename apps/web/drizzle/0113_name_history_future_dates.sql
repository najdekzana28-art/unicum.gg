-- A former name cannot have stopped being current in the future.
--
-- `recorded_at` on a roster-recovered name is the tournament's `start_at`, which
-- is the day we can prove the name was still in use. Registration opens before a
-- tournament is played, so a player who renames after signing up for one that
-- starts next week got a former name dated next week, and the profile rendered
-- that date. `insertMissingNames` now caps the observation at NOW(); these are
-- the rows written before it did (2 on EU, 1 on NA, the furthest 12 days out).
--
-- Only the roster path can produce them: the trigger stamps NOW() and the
-- Onslaught reconciler reads a season that has started, so clamping is safe on
-- the whole table rather than on a subset we would have to identify.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['eu','na','asia'] LOOP
    EXECUTE format(
      'UPDATE %I SET recorded_at = NOW() WHERE recorded_at > NOW()',
      r || '_player_name_history'
    );
  END LOOP;
END $$;
