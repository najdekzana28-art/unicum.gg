import {
  bigint,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { Region } from "@unicum.gg/wargaming";
import type { RatingMetric } from "../../constants/rating";
import type { ActivityWindow } from "../../wot/player-activity";
import type { RatingColor } from "../../wot/ratings";

/**
 * Whether a band of the region's players is still playing, one row per
 * (metric, band, window, day).
 *
 * The histograms beside this table say how many players each band holds, which
 * is the question nobody was asking: a band can hold a hundred thousand
 * accounts that all stopped playing in 2019. This says how many of them turned
 * up, so "are the good players still here" and "which band is the most active"
 * are readable at all.
 *
 * It is a SERIES rather than a singleton, which is the whole reason it is a
 * table of its own rather than four more columns on `*_player_distribution`.
 * That row is deleted and rewritten every hour, so it can only ever answer for
 * the present instant, and the interesting form of this question is the
 * movement: whether the top bands are thinning out faster than the rest, and
 * what an update or a new season does to each of them. Nothing can recover a
 * day that was overwritten, so the series has to start accumulating before it
 * can be read, exactly like `*_server_online` beside it.
 *
 * Daily rather than hourly, because the shortest window here is 24 hours and
 * two consecutive hourly points share 23 of them: an hourly series would be
 * twenty-four times the rows to redraw the same curve. The cron still runs
 * hourly and upserts the current day, so the day in progress refines until
 * midnight and then never moves again, and an outage costs resolution on one
 * day rather than a hole in the series.
 */
export function makePlayerActivityTable(region: string) {
  return pgTable(
    `${region}_player_activity`,
    {
      // The UTC day the row describes, which is the day the counters were read
      // rather than a day the battles were played in: every window here looks
      // backwards from the read, so a row is "as observed on this date". Pinned
      // to UTC like the rhythm heatmap's buckets, so nothing silently depends
      // on the worker's timezone.
      day: date("day", { mode: "string" }).notNull(),
      // The rating scale the band belongs to. All three are stored, like the
      // histograms and the win-rate grid, so the navbar's metric selector
      // switches the panel without anything being recomputed.
      metric: text("metric").$type<RatingMetric>().notNull(),
      band: text("band").$type<RatingColor>().notNull(),
      // How far back "active" looked. Three windows rather than one, because
      // they answer different things: 30 days is who still plays at all, and 24
      // hours is who played last night. Stored as rows rather than as three
      // sets of columns, so a fourth window is data rather than a migration.
      window: text("activity_window").$type<ActivityWindow>().notNull(),
      // The band's edges as the colour function drew them when the row was
      // written, half-open and null at the scale's two open ends. Carried for
      // the reason the win-rate grid carries its own: which players landed in
      // this row was decided at write time, so a threshold that moves later
      // must not relabel a row it never measured.
      bandFrom: integer("band_from"),
      bandTo: integer("band_to"),
      // The battle floor the population was drawn with, carried so the page can
      // name what it describes rather than assume today's constant.
      minBattles: integer("min_battles").notNull(),
      // Accounts in the band, whatever we know about them.
      players: integer("players").notNull(),
      /**
       * Accounts we actually looked at inside the window, and the one honest
       * denominator here.
       *
       * An account is only known to be idle if we asked recently enough to
       * tell: `last_battle_at` is Wargaming's own, but it is only as fresh as
       * our last read of it, so a player we have not refreshed in two months
       * reads as idle whether they are or not. Measured on EU, that is 3.7% of
       * the top band and 12.1% of the bottom one, which is a real bias and in
       * the direction that would flatter the result (the bands we refresh least
       * are the ones that look deadest). Scoring the rate against the accounts
       * we observed rather than against every account we hold is what keeps the
       * answer about the players instead of about our own refresh cadence:
       * recomputed that way the slope barely moves (9.1% to 47.0% across the
       * bands, against 8.0% to 45.2% unfiltered), which is what makes it safe
       * to publish.
       */
      observed: integer("observed").notNull(),
      // Observed accounts whose last battle falls inside the window.
      active: integer("active").notNull(),
      /**
       * Active accounts whose battle count for the window is known.
       *
       * The window's battles are a diff between two snapshots of ours, so an
       * account can be known to have played (Wargaming's `last_battle_at` moved)
       * while we hold no pair to measure it with. It is 96-99% of the active
       * accounts in every band on EU, so the intensity below is read off a near
       * complete sample, but it is carried rather than assumed: a read that
       * divided the battles by `active` would quietly understate every band by
       * however much of it we failed to measure.
       */
      measured: integer("measured").notNull(),
      // Battles the measured accounts played inside the window. Stored as a
      // total beside its own denominator rather than as a mean, so a band can be
      // re-summed with another instead of being an average of averages.
      battles: bigint("battles", { mode: "number" }).notNull(),
      computedAt: timestamp("computed_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    // Ordered the way the page reads it rather than the way the cron writes it:
    // a panel asks for one metric and one window and wants every band's days
    // ascending, which this serves as one contiguous range. The write has no
    // preference, since it names all four columns.
    (t) => [primaryKey({ columns: [t.metric, t.window, t.band, t.day] })],
  );
}

export type PlayerActivityTable = ReturnType<typeof makePlayerActivityTable>;
export type NewPlayerActivity = PlayerActivityTable["$inferInsert"];

export const playerActivityByRegion: Record<Region, PlayerActivityTable> = {
  [Region.EU]: makePlayerActivityTable(Region.EU),
  [Region.NA]: makePlayerActivityTable(Region.NA),
  [Region.ASIA]: makePlayerActivityTable(Region.ASIA),
};
