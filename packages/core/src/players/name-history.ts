import { and, desc, eq, sql } from "drizzle-orm";
import type { Region } from "@unicum.gg/wargaming";
import {
  type NameHistoryEntry,
  playerNameHistoryByRegion,
  playersByRegion,
} from "@unicum.gg/shared";
import { db } from "@unicum.gg/core/db";

/**
 * A player's previous nicknames, newest first. Filled by the `_players` rename
 * trigger, so it stays empty until a rename is observed (WG exposes no history).
 *
 * Two rows are skipped rather than trusted, because several writers feed this
 * table (the trigger, the Onslaught reconciler, the tournament rosters) and a
 * bad row is read as a rename that never happened. A blank name is never a name
 * anyone went by, and a name equal to the CURRENT one is not a previous one: a
 * player who renamed back really does have that row, and the panel would be
 * telling a reader that Foo used to be called Foo. Measured when the rule was
 * added: 95 such rows across the three regions, nearly all of them roster names
 * recorded while the account was still a placeholder. Compared trimmed and
 * case-folded, because WG holds nicknames unique case-insensitively, so a
 * difference in case alone is two of our sources disagreeing, not a rename.
 *
 * The join is on the account's unique index, so this stays the single indexed
 * read it was on the busiest endpoint we have.
 */
export async function getPlayerNameHistory(
  region: Region,
  accountId: number,
): Promise<NameHistoryEntry[]> {
  const table = playerNameHistoryByRegion[region];
  const players = playersByRegion[region];
  return db
    .select({ nickname: table.nickname, recordedAt: table.recordedAt })
    .from(table)
    .innerJoin(players, eq(players.accountId, table.accountId))
    .where(
      and(
        eq(table.accountId, accountId),
        sql`btrim(${table.nickname}) <> ''`,
        sql`LOWER(btrim(${table.nickname})) <> LOWER(btrim(${players.nickname}))`,
      ),
    )
    .orderBy(desc(table.recordedAt));
}

/**
 * The account that last went by this nickname, so a link to a since-renamed
 * player resolves instead of 404ing.
 *
 * Callers must try the live `players` table first: a freed nickname can be
 * claimed by someone else, and the current holder always wins. Ordering by
 * `recorded_at DESC` picks the most recent former owner when several accounts
 * have carried the name over time.
 */
export async function findAccountIdByFormerNickname(
  region: Region,
  nickname: string,
): Promise<number | null> {
  const table = playerNameHistoryByRegion[region];
  const [row] = await db
    .select({ accountId: table.accountId })
    .from(table)
    .where(sql`LOWER(${table.nickname}) = LOWER(${nickname})`)
    .orderBy(desc(table.recordedAt))
    .limit(1);
  return row?.accountId ?? null;
}
