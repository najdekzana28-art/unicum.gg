import { asc, eq, gte, and } from "drizzle-orm";
import { db } from "@unicum.gg/core/db";
import { clansByRegion } from "@unicum.gg/shared";
import type { Region } from "@unicum.gg/wargaming";
import { markClansDisbanded } from "@unicum.gg/core/clans/repository";
import { findDisbandedClans } from "@unicum.gg/core/wargaming/wot/clans/info";

/**
 * Catch-up sweep: ask WG about every live clan we hold and record the ones that
 * have ended.
 *
 * Needed once, because the state was never written down. WG answers for an
 * ended clan with its tag and name blanked, the fetch layer read that as a
 * failed read and discarded it, so `is_disbanded` was true for 0 of the 160,380
 * clans we hold while 770 of them had actually ended. Those rows kept serving a
 * page that claims a living clan, and held a tag anyone may now take.
 *
 * Deliberately not a cron. The clan backfill already meets a disbanded clan on
 * its normal pass and marks it from then on, so this only exists to close the
 * gap the backfill would otherwise take its own full cycle (over two months) to
 * walk. Once run, it has nothing left to do.
 */
const PAGE_SIZE = 1_000;

export type DisbandedSweepResult = {
  checked: number;
  marked: number;
  /** The last clan id looked at, so an interrupted run can be resumed. */
  lastId: number | null;
};

export async function sweepDisbandedClans(
  region: Region,
  options: {
    fromId?: number;
    onProgress?: (r: DisbandedSweepResult) => void;
  } = {},
): Promise<DisbandedSweepResult> {
  const clans = clansByRegion[region];
  const result: DisbandedSweepResult = { checked: 0, marked: 0, lastId: null };
  // Ordered by id and resumed on it rather than paged with OFFSET: marking a
  // clan moves it out of the `is_disbanded = false` filter, so an offset would
  // skip as many rows as the page before it marked.
  let cursor = options.fromId ?? 0;

  for (;;) {
    const rows = await db
      .select({ id: clans.id })
      .from(clans)
      .where(and(eq(clans.isDisbanded, false), gte(clans.id, cursor)))
      .orderBy(asc(clans.id))
      .limit(PAGE_SIZE);
    if (rows.length === 0) break;

    const ids = rows.map((r) => Number(r.id));
    const disbanded = await findDisbandedClans(region, ids);
    await markClansDisbanded(region, disbanded);

    result.checked += ids.length;
    result.marked += disbanded.length;
    result.lastId = ids[ids.length - 1];
    options.onProgress?.({ ...result });

    if (rows.length < PAGE_SIZE) break;
    cursor = result.lastId + 1;
  }

  return result;
}
