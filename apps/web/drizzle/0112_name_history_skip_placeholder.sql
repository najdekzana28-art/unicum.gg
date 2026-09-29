-- A name that was never known is not a former name.
--
-- `discoverPlayers` inserts an account id we have only seen referenced, with no
-- nickname yet (`nickname ?? ""`, so the row is born with an empty string), and
-- the snapshot pipeline fills the real one in later. Two callers hand over ids
-- alone: the mod's `/resolve` endpoint (`resolve/index.ts`, the caller sends
-- account ids and nothing else) and a link to a since-renamed account
-- (`players/resolve-account.ts`, reached from a tournament team page). A third
-- can: the clan portal answers `accountName: accountInfo.name ?? ""` for an
-- event whose account it cannot name.
--
-- The rename trigger read that first real write as a rename and recorded the
-- empty string as a previous name, so the profile drew a "previous names" panel
-- holding one blank row, and for a player discovered that way that blank row was
-- the whole history. Measured before this ran: 4,122 of 40,686 rows on EU, 515
-- of 6,858 on NA, 302 of 3,993 on Asia, nearly all of them September 2026 on,
-- which is when `/resolve` and the tournament archive landed.
--
-- Guarded in the trigger rather than in each discovery path: the placeholders
-- all reach it, including the ones added later. The clans side has no such
-- placeholder (a clan is queued for refresh, never inserted half-known) and
-- carries no empty row today, but it gets the same guard and the same cleanup,
-- so the invariant is enforced on both tables rather than asserted on one.
--
-- Each DROP/CREATE pair needs a brief ACCESS EXCLUSIVE lock on a table under
-- continuous write. `lock_timeout` keeps a long-running read from turning that
-- wait into a pile-up behind us, and the DO block is one transaction, so on
-- timeout nothing is applied, there is no window where a rename goes
-- unrecorded, and the file can simply be re-run.
SET lock_timeout = '5s';

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['eu','na','asia'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', r || '_player_name_change', r || '_players');
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW'
      || ' WHEN (OLD.nickname IS DISTINCT FROM NEW.nickname AND btrim(OLD.nickname) <> '''')'
      || ' EXECUTE FUNCTION record_player_name_change(%L)',
      r || '_player_name_change', r || '_players', r || '_player_name_history'
    );

    -- Both columns, because the trigger fires on either changing: a clan row
    -- carrying a tag and a blank name would otherwise pass a tag-only guard and
    -- record the blank name the first refresh fills in.
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', r || '_clan_name_change', r || '_clans');
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW'
      || ' WHEN ((OLD.tag IS DISTINCT FROM NEW.tag OR OLD.name IS DISTINCT FROM NEW.name)'
      || ' AND btrim(OLD.tag) <> '''' AND btrim(OLD.name) <> '''')'
      || ' EXECUTE FUNCTION record_clan_name_change(%L)',
      r || '_clan_name_change', r || '_clans', r || '_clan_name_history'
    );
  END LOOP;
END $$;

-- The rows the old condition already wrote. Nothing is lost with them: an empty
-- name resolves no redirect and names no player. A row that merely repeats the
-- CURRENT name is a different matter and is NOT deleted here: a player really
-- can rename back, so that row can be genuine history, and the readers skip it
-- for display instead.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['eu','na','asia'] LOOP
    EXECUTE format('DELETE FROM %I WHERE btrim(nickname) = ''''', r || '_player_name_history');
    EXECUTE format(
      'DELETE FROM %I WHERE btrim(tag) = '''' OR btrim(name) = ''''',
      r || '_clan_name_history'
    );
  END LOOP;
END $$;
