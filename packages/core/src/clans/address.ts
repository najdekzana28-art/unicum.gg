import { asc, eq, sql } from "drizzle-orm";
import { db } from "@unicum.gg/core/db";
import { clansByRegion, parseClanAddress } from "@unicum.gg/shared";
import type { Region } from "@unicum.gg/wargaming";

/**
 * The id of the clan a URL segment addresses, or null when nothing answers at
 * it.
 *
 * The light counterpart of `getClanByTagCached`, for the endpoints that need an
 * id and not a whole clan, and the single place a segment is turned into one.
 * It exists because writing the lookup out by hand is exactly how two of those
 * endpoints came to match on `tag_lower` alone: both answered 404 for every
 * archive address, so an ended clan's page rendered its header and then failed
 * on its Tanks and Tournaments tabs.
 *
 * DB-only, no Wargaming fallback: these are sub-resources of a page whose main
 * resolve has already dealt with the cold-cache case.
 */
export async function getClanIdByAddress(
  region: Region,
  address: string,
): Promise<number | null> {
  const clans = clansByRegion[region];
  const { tag, id } = parseClanAddress(address);

  if (id !== null) {
    const [row] = await db
      .select({ id: clans.id })
      .from(clans)
      .where(eq(clans.id, id))
      .limit(1);
    return row ? Number(row.id) : null;
  }

  // The same order as the main resolve: a living clan always wins the bare tag,
  // and among the clans that have ended under it the newest one answers.
  const [row] = await db
    .select({ id: clans.id })
    .from(clans)
    .where(eq(clans.tagLower, tag.toLowerCase()))
    .orderBy(asc(clans.isDisbanded), sql`${clans.disbandedAt} DESC NULLS LAST`)
    .limit(1);
  return row ? Number(row.id) : null;
}
