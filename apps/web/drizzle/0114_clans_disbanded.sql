-- A clan that is disbanded is recorded as one, and its tag is freed.
--
-- WG answers for an ended clan with `is_clan_disbanded` set and every visible
-- field blanked, which is exactly what the fetch layer used to read as "ghost"
-- and discard, so `is_disbanded` was never once written (0 rows of 160,380, of
-- which 770 had in fact ended) and
-- every `WHERE is_disbanded = false` beside it filtered nothing.
--
-- The index has to become partial in the same migration as the flag starts
-- being written: WG frees the tag of a disbanded clan, and the new holder's
-- INSERT violated this constraint (the upsert resolves on `id`), which took the
-- whole refresh batch with it and left the new clan permanently unable to enter
-- the table while its tag kept serving the dead clan's page.

ALTER TABLE "eu_clans" ADD COLUMN IF NOT EXISTS "disbanded_at" timestamp with time zone;
ALTER TABLE "na_clans" ADD COLUMN IF NOT EXISTS "disbanded_at" timestamp with time zone;
ALTER TABLE "asia_clans" ADD COLUMN IF NOT EXISTS "disbanded_at" timestamp with time zone;

DROP INDEX IF EXISTS "eu_clans_tag_lower_idx";
CREATE UNIQUE INDEX "eu_clans_tag_lower_idx" ON "eu_clans" ("tag_lower") WHERE "is_disbanded" = false;

DROP INDEX IF EXISTS "na_clans_tag_lower_idx";
CREATE UNIQUE INDEX "na_clans_tag_lower_idx" ON "na_clans" ("tag_lower") WHERE "is_disbanded" = false;

DROP INDEX IF EXISTS "asia_clans_tag_lower_idx";
CREATE UNIQUE INDEX "asia_clans_tag_lower_idx" ON "asia_clans" ("tag_lower") WHERE "is_disbanded" = false;
