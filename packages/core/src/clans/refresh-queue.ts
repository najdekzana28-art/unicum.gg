import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@unicum.gg/core/db";
import { clanRefreshQueueByRegion, clansByRegion } from "@unicum.gg/shared";
import type { Region } from "@unicum.gg/wargaming";

const CHUNK_SIZE = 500;

// Priority a live clan page view enqueues at (drained before discovery
// priority 0).
export const LIVE_CLAN_REFRESH_PRIORITY = 10;

export type EnqueueClanOptions = {
  // Higher = drained sooner. Use >0 for user-initiated, 0 for discovery.
  priority?: number;
};

/**
 * The ids of `chunk` that are not a clan we have recorded as disbanded. An id we
 * have never seen passes: that is a clan waiting to be discovered, not a dead
 * one.
 */
async function liveOnly(region: Region, chunk: number[]): Promise<number[]> {
  const clans = clansByRegion[region];
  const dead = await db
    .select({ id: clans.id })
    .from(clans)
    .where(and(inArray(clans.id, chunk), eq(clans.isDisbanded, true)));
  if (dead.length === 0) return chunk;
  const deadIds = new Set(dead.map((r) => Number(r.id)));
  return chunk.filter((id) => !deadIds.has(id));
}

/**
 * Push clans into the refresh queue. The refresh-cron drains by priority
 * desc then queued_at asc. Idempotent: a higher-priority enqueue bumps an
 * existing row up, but a lower-priority discovery enqueue never downgrades
 * a user-bumped one.
 */
export async function enqueueClanRefresh(
  region: Region,
  clanIds: number[],
  options: EnqueueClanOptions = {},
): Promise<void> {
  if (clanIds.length === 0) return;
  const priority = options.priority ?? 0;
  const table = clanRefreshQueueByRegion[region];
  // Sort by id so concurrent bulk inserts grab row locks in the same order
  // (prevents Postgres 40P01 deadlocks under contention).
  const unique = Array.from(new Set(clanIds)).sort((a, b) => a - b);

  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    // A clan that has ended is never queued. Its refresh can only come back
    // disbanded again, so the drain would spend a slot of its five per tick to
    // learn what we already recorded, and it would do that on every view of the
    // archive page: the one caller enqueueing from a render does so when it
    // holds no roster, which is the permanent state of a clan whose roster was
    // deleted before the refresh learned to refuse an empty one. Checked here
    // rather than at the call sites so the invariant holds for all of them.
    const queueable = await liveOnly(region, chunk);
    if (queueable.length === 0) continue;
    await db
      .insert(table)
      .values(queueable.map((clanId) => ({ clanId, priority })))
      .onConflictDoUpdate({
        target: table.clanId,
        set: {
          priority: sql`GREATEST(${table.priority}, EXCLUDED.priority)`,
          queuedAt: sql`LEAST(${table.queuedAt}, EXCLUDED.queued_at)`,
        },
      });
  }
}

/**
 * Fire-and-forget variant for hot paths (page renders). Logs but never throws.
 */
export function enqueueClanRefreshBackground(
  region: Region,
  clanIds: number[],
  options: EnqueueClanOptions = {},
): void {
  void enqueueClanRefresh(region, clanIds, options).catch((err) =>
    console.error(`[refresh-queue] enqueueClanRefresh ${region} failed:`, err),
  );
}

/**
 * Remove processed entries. Called by the refresh-cron after a successful or
 * permanently-failed refresh, so we don't loop on dead rows forever.
 */
export async function dequeueClanRefresh(
  region: Region,
  clanId: number,
): Promise<void> {
  const table = clanRefreshQueueByRegion[region];
  await db.delete(table).where(eq(table.clanId, clanId));
}
