-- Where a team finished in its tournament, stored rather than re-derived.
--
-- The player and clan tournament tables read `min(position)` over every group a
-- team appears in, which is the best place reached in ANY pool of ANY stage. A
-- 561-pool qualifier therefore published 561 first places: EU shows 178,330
-- teams at a first place and 492,790 on a podium, for 13,170 tournaments, so at
-- most 13,170 of those are real. The winner's crest beside them is computed by
-- `finalPlacements` and refuses exactly that, which is how the two came to
-- contradict each other on the same screen (reported by a player who had won
-- his 2v2 pool, finished 1021st of the 1,210-team playoff, and was shown "1st"
-- with a gold medal next to a profile carrying no crest).
--
-- `final_place` is that team's place in the tournament, by the one shared rule,
-- written as a ranking is written (a tie takes its best place). Null is a team
-- knocked out before the deciding stage.
--
-- `placements_at` is the stamp that keeps that null honest: it says the
-- tournament's brackets have been read. Without it, "not computed yet" and "no
-- final place" are the same value, and every champion in the archive would read
-- as a pool winner until the backfill had been run.

ALTER TABLE "eu_tournament_teams" ADD COLUMN IF NOT EXISTS "final_place" integer;
ALTER TABLE "na_tournament_teams" ADD COLUMN IF NOT EXISTS "final_place" integer;
ALTER TABLE "asia_tournament_teams" ADD COLUMN IF NOT EXISTS "final_place" integer;

ALTER TABLE "eu_tournaments" ADD COLUMN IF NOT EXISTS "placements_at" timestamp with time zone;
ALTER TABLE "na_tournaments" ADD COLUMN IF NOT EXISTS "placements_at" timestamp with time zone;
ALTER TABLE "asia_tournaments" ADD COLUMN IF NOT EXISTS "placements_at" timestamp with time zone;
