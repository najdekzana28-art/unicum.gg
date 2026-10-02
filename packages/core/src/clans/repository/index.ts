import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@unicum.gg/core/db";
import { type Clan, clansByRegion, parseClanAddress } from "@unicum.gg/shared";
import { clanChannel, publish } from "@unicum.gg/core/live/pubsub";
import type { Region } from "@unicum.gg/wargaming";
import {
  type ClanFullInfo,
  getClanFullInfo,
  getClansFullInfoBatch,
  sanitizeClanDescription,
} from "@unicum.gg/core/wargaming/wot/clans/info";
import { findClanIdByTag } from "@unicum.gg/core/wargaming/wot/clans/search";
import { findClanIdByFormerTag } from "@unicum.gg/core/clans/name-history";

function clanFullInfoFromRow(row: Clan): ClanFullInfo {
  return {
    id: Number(row.id),
    tag: row.tag,
    name: row.name,
    color: row.color,
    emblem: row.emblem,
    motto: row.motto,
    // Re-linkify at read so clans stored before the linkify fix heal without
    // waiting for a WG refresh. Idempotent on already-linkified HTML.
    descriptionHtml: sanitizeClanDescription(row.descriptionHtml),
    createdAt: row.createdAtWg,
    membersCount: row.membersCount,
    leaderId: Number(row.leaderId),
    leaderName: row.leaderName,
    creatorId: Number(row.creatorId),
    creatorName: row.creatorName,
    isDisbanded: row.isDisbanded,
    languages: row.languages ?? [],
    updatedAt: row.lastRefreshedAt,
  };
}

export type ClanCached = {
  info: ClanFullInfo;
  fromDb: boolean;
  refreshing: boolean;
};

/**
 * Resolve the clan a URL segment addresses.
 *
 * The segment is an ADDRESS, not a tag: an ended clan is addressed by its tag
 * and its id (see `clanAddress`), because WG frees its tag and the next clan to
 * take the name would otherwise take its page with it. An address carrying an
 * id is resolved by that id alone, which is what makes an archive permanent.
 */
export async function getClanByTagCached(
  region: Region,
  address: string,
): Promise<ClanCached | null> {
  const clans = clansByRegion[region];
  const { tag, id } = parseClanAddress(address);

  if (id !== null) {
    const [archived] = await db
      .select()
      .from(clans)
      .where(eq(clans.id, id))
      .limit(1);
    // An address naming an id we do not hold is not an address at all, and
    // falling through to its tag would answer with a different clan.
    return archived
      ? { info: clanFullInfoFromRow(archived), fromDb: true, refreshing: false }
      : null;
  }

  const tagLower = tag.toLowerCase();
  // A living clan always wins the bare tag. WG frees the tag of a disbanded
  // clan for anyone to take, so one `tag_lower` can be held at once by the clan
  // playing under it today and by any number that have ended under it, and
  // among the dead ones the newest is the archive an old link was pointing at.
  // The caller redirects that one onto its own permanent address.
  const [row] = await db
    .select()
    .from(clans)
    .where(eq(clans.tagLower, tagLower))
    .orderBy(asc(clans.isDisbanded), sql`${clans.disbandedAt} DESC NULLS LAST`)
    .limit(1);

  if (row) {
    return { info: clanFullInfoFromRow(row), fromDb: true, refreshing: false };
  }

  const info = await refreshClanByTag(region, tag);
  if (info) return { info, fromDb: false, refreshing: false };

  // No clan carries this tag today, so look for the one that used to: WG only
  // resolves current tags, and a link to a since-retagged clan would 404 here.
  //
  // Deliberately last, for the same reason as the player counterpart: asking WG
  // first keeps a tag that another clan has taken over pointing at its new
  // holder even when that clan is not in our database yet. Callers compare the
  // returned `tag` with the one they were given to decide whether to redirect.
  const formerHolder = await findClanIdByFormerTag(region, tag).catch(
    () => null,
  );
  if (formerHolder === null) return null;
  const [byId] = await db
    .select()
    .from(clans)
    .where(eq(clans.id, formerHolder))
    .limit(1);
  return byId
    ? { info: clanFullInfoFromRow(byId), fromDb: true, refreshing: false }
    : null;
}

/**
 * The tag a clan id carries today, for a caller holding a stored credit.
 *
 * Credits are stored as ids, so anything that has to name the clan's page (a
 * link, a path to revalidate) turns one back into a tag here. Reads our own
 * table only: an id we have never tracked has no page to point at, so it
 * answers null rather than asking WG for a clan nobody can open.
 */
export async function getClanTagById(
  region: Region,
  id: number,
): Promise<string | null> {
  const clans = clansByRegion[region];
  const [row] = await db
    .select({ tag: clans.tag })
    .from(clans)
    .where(eq(clans.id, id))
    .limit(1);
  return row?.tag ?? null;
}

export async function refreshClanByTag(
  region: Region,
  tag: string,
): Promise<ClanFullInfo | null> {
  const clanId = await findClanIdByTag(region, tag);
  if (!clanId) return null;
  return refreshClanById(region, clanId);
}

/**
 * Mark clans we already hold as disbanded, by id alone.
 *
 * An UPDATE and nothing else: the row we hold was written while the clan was
 * alive, and that frozen row IS the archive. Its member count, its roster and
 * its ratings are the last true ones and there is no second chance to fetch
 * them, so the only things written here are the flag and its date.
 *
 * `disbanded_at` keeps its first value: it records when WE saw the state, so a
 * later pass seeing it again must not move the date, and it is what orders two
 * archive rows that held the same tag.
 */
export async function markClansDisbanded(
  region: Region,
  clanIds: number[],
): Promise<void> {
  if (clanIds.length === 0) return;
  const clans = clansByRegion[region];
  await db
    .update(clans)
    .set({
      isDisbanded: true,
      disbandedAt: sql`COALESCE(${clans.disbandedAt}, NOW())`,
      // `last_refreshed_at` is deliberately left alone: it means the FULL clan
      // refresh ran (info, roster, events, Global Map) and the header prints it
      // as "updated", so stamping it here would have 770 archives claiming they
      // were refreshed minutes ago while nothing was fetched. Nothing needs the
      // bump either, the backfill's due-scan already excludes them.
    })
    .where(inArray(clans.id, clanIds));
  for (const clanId of clanIds) {
    publish(clanChannel(region, clanId), { kind: "info" });
  }
}

/**
 * Store clans WG reports as disbanded, identity included.
 *
 * The insert half is what puts a clan we never tracked into the table at all,
 * and it is the whole reason a player's clan history stops losing stints: the
 * history names its past clans by id, and an id that resolves to nothing is
 * dropped from the list without a word. Measured over 40 EU players, the clans
 * their histories name that we did not hold were disbanded, every one of them.
 *
 * The conflict half writes the flag and NOTHING else, on purpose. A clan we
 * followed while it was alive holds a real member count, a roster and a
 * description; the portal answers 0 members for the same clan now, so taking
 * the incoming row wholesale would overwrite the archive with the emptiness
 * that replaced it.
 */
export async function recordDisbandedClans(
  region: Region,
  infos: ClanFullInfo[],
): Promise<void> {
  // Without a tag there is nothing to name a row after and nothing to address
  // it by, so these fall back to the id-only mark: it updates a clan we hold
  // and matches nothing for one we do not, which is the honest outcome.
  const named = infos.filter((info) => info.tag !== "");
  const unnamed = infos.filter((info) => info.tag === "");
  await markClansDisbanded(
    region,
    unnamed.map((info) => info.id),
  );
  if (named.length === 0) return;

  const clans = clansByRegion[region];
  const now = new Date();
  await db
    .insert(clans)
    .values(
      named.map((info) => ({
        id: info.id,
        tag: info.tag,
        tagLower: info.tag.toLowerCase(),
        name: info.name,
        color: info.color,
        emblem: info.emblem,
        motto: info.motto,
        descriptionHtml: info.descriptionHtml,
        membersCount: info.membersCount,
        leaderId: info.leaderId,
        leaderName: info.leaderName,
        creatorId: info.creatorId,
        creatorName: info.creatorName,
        createdAtWg: info.createdAt,
        isDisbanded: true,
        disbandedAt: now,
        languages: info.languages,
        lastRefreshedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: clans.id,
      set: {
        isDisbanded: sql`true`,
        disbandedAt: sql`COALESCE(${clans.disbandedAt}, EXCLUDED.disbanded_at)`,
        lastRefreshedAt: sql`excluded.last_refreshed_at`,
      },
    });
  for (const info of named) {
    publish(clanChannel(region, info.id), { kind: "info" });
  }
}

export async function refreshClanById(
  region: Region,
  clanId: number,
): Promise<ClanFullInfo | null> {
  const clans = clansByRegion[region];
  const info = await getClanFullInfo(region, clanId);
  if (!info) return null;
  // Answers null for a disbanded clan, like it did when the fetch layer
  // discarded one: there is no clan for a caller to render. The difference is
  // that the state is now written down instead of being lost, so the row stops
  // claiming to be a living clan everywhere it is read.
  if (info.isDisbanded) {
    await recordDisbandedClans(region, [info]);
    return null;
  }
  await db
    .insert(clans)
    .values({
      id: info.id,
      tag: info.tag,
      tagLower: info.tag.toLowerCase(),
      name: info.name,
      color: info.color,
      emblem: info.emblem,
      motto: info.motto,
      descriptionHtml: info.descriptionHtml,
      membersCount: info.membersCount,
      leaderId: info.leaderId,
      leaderName: info.leaderName,
      creatorId: info.creatorId,
      creatorName: info.creatorName,
      createdAtWg: info.createdAt,
      isDisbanded: info.isDisbanded,
      languages: info.languages,
      lastRefreshedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: clans.id,
      set: {
        tag: info.tag,
        tagLower: info.tag.toLowerCase(),
        name: info.name,
        color: info.color,
        emblem: info.emblem,
        motto: info.motto,
        descriptionHtml: info.descriptionHtml,
        membersCount: info.membersCount,
        leaderId: info.leaderId,
        leaderName: info.leaderName,
        creatorId: info.creatorId,
        creatorName: info.creatorName,
        createdAtWg: info.createdAt,
        isDisbanded: info.isDisbanded,
        languages: info.languages,
        lastRefreshedAt: new Date(),
      },
    });
  publish(clanChannel(region, info.id), { kind: "info" });
  return info;
}

/**
 * Batched variant: fetches & upserts many clans at once. Used by the cron
 * to avoid 1 WG round-trip per clan.
 */
export async function refreshClansByIdsBatch(
  region: Region,
  clanIds: number[],
): Promise<Map<number, ClanFullInfo>> {
  const clans = clansByRegion[region];
  const fetched = await getClansFullInfoBatch(region, clanIds);
  // Split before writing anything: the two states take different statements,
  // and a disbanded clan in the values list would carry an empty `tag_lower`
  // that every other one of them collides with.
  const infos = new Map<number, ClanFullInfo>();
  const disbanded: ClanFullInfo[] = [];
  for (const [id, info] of fetched) {
    if (info.isDisbanded) disbanded.push(info);
    else infos.set(id, info);
  }
  await recordDisbandedClans(region, disbanded);
  if (infos.size === 0) return infos;

  const now = new Date();
  const rows = Array.from(infos.values()).map((info) => ({
    id: info.id,
    tag: info.tag,
    tagLower: info.tag.toLowerCase(),
    name: info.name,
    color: info.color,
    emblem: info.emblem,
    motto: info.motto,
    descriptionHtml: info.descriptionHtml,
    membersCount: info.membersCount,
    leaderId: info.leaderId,
    leaderName: info.leaderName,
    creatorId: info.creatorId,
    creatorName: info.creatorName,
    createdAtWg: info.createdAt,
    isDisbanded: info.isDisbanded,
    languages: info.languages,
    lastRefreshedAt: now,
  }));

  await db
    .insert(clans)
    .values(rows)
    .onConflictDoUpdate({
      target: clans.id,
      set: {
        tag: sql`excluded.tag`,
        tagLower: sql`excluded.tag_lower`,
        name: sql`excluded.name`,
        color: sql`excluded.color`,
        emblem: sql`excluded.emblem`,
        motto: sql`excluded.motto`,
        descriptionHtml: sql`excluded.description_html`,
        membersCount: sql`excluded.members_count`,
        leaderId: sql`excluded.leader_id`,
        leaderName: sql`excluded.leader_name`,
        creatorId: sql`excluded.creator_id`,
        creatorName: sql`excluded.creator_name`,
        createdAtWg: sql`excluded.created_at_wg`,
        // `is_disbanded` is deliberately NOT written here. Clearing it would
        // put an archive row back inside the partial unique index, where the
        // clan that has since taken its tag already sits, and the violation
        // would abort this whole multi-row insert and lose every clan in the
        // batch. Only the disband path writes that column; a clan that has
        // ended never comes back, so the one-way door costs nothing real.
        languages: sql`excluded.languages`,
        lastRefreshedAt: sql`excluded.last_refreshed_at`,
      },
    });

  for (const info of infos.values()) {
    publish(clanChannel(region, info.id), { kind: "info" });
  }
  return infos;
}
