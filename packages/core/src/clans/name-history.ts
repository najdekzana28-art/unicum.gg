import { and, desc, eq, sql } from "drizzle-orm";
import type { Region } from "@unicum.gg/wargaming";
import { clanNameHistoryByRegion, clansByRegion } from "@unicum.gg/shared";
import { db } from "@unicum.gg/core/db";

/** A clan's previous tag + name, with when it stopped being current. */
export type ClanNameHistoryEntry = {
  tag: string;
  name: string;
  recordedAt: Date;
};

/**
 * A clan's previous tags + names, newest first. Filled by the `_clans` rename
 * trigger, so it stays empty until a rename is observed.
 *
 * An identity equal to the CURRENT one is skipped, the same rule the player
 * counterpart reads by and for the same reason: a clan that retagged and came
 * back really does carry that row, and rendering it says FAME used to be called
 * FAME. Measured when the rule was added: 4 rows across the three regions.
 *
 * Compared case-SENSITIVELY, unlike the player one, because the two differ in
 * where a case-only difference comes from. Both halves of a clan identity are
 * free text Wargaming stores as the clan typed it, so "4ЕРВОНА КАЛИНА" becoming
 * "4ервона Калина" is an edit the clan made and belongs in the history. A
 * nickname cannot move that way: WG holds them unique case-insensitively, so a
 * case-only difference is two of our sources disagreeing rather than a rename.
 */
export async function getClanNameHistory(
  region: Region,
  clanId: number,
): Promise<ClanNameHistoryEntry[]> {
  const table = clanNameHistoryByRegion[region];
  const clans = clansByRegion[region];
  return db
    .select({
      tag: table.tag,
      name: table.name,
      recordedAt: table.recordedAt,
    })
    .from(table)
    .innerJoin(clans, eq(clans.id, table.clanId))
    .where(
      and(
        eq(table.clanId, clanId),
        sql`NOT (
          btrim(${table.tag}) = btrim(${clans.tag})
          AND btrim(${table.name}) = btrim(${clans.name})
        )`,
      ),
    )
    .orderBy(desc(table.recordedAt));
}

/**
 * The clan that last went by this tag, so a link to a since-retagged clan
 * resolves instead of 404ing. Same rule as the player counterpart: the caller
 * must try the live `clans` table first, because a freed tag can be taken by
 * another clan and the current holder always wins.
 */
export async function findClanIdByFormerTag(
  region: Region,
  tag: string,
): Promise<number | null> {
  const table = clanNameHistoryByRegion[region];
  const [row] = await db
    .select({ clanId: table.clanId })
    .from(table)
    .where(sql`LOWER(${table.tag}) = LOWER(${tag})`)
    .orderBy(desc(table.recordedAt))
    .limit(1);
  return row?.clanId ?? null;
}
