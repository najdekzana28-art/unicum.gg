import { bigint, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { Region } from "@unicum.gg/wargaming";

/**
 * A player's previous nicknames. WG gives no rename history, so this only
 * accumulates going forward: a `BEFORE UPDATE` trigger on `${region}_players`
 * appends the *old* nickname here whenever a refresh writes a different one, so
 * `recorded_at` is when that name stopped being current.
 *
 * The trigger skips an empty old nickname, because discovery inserts an account
 * id long before it knows the name (the mod's `/resolve` endpoint and a link to
 * a since-renamed account both hand over ids alone) and the refresh that fills
 * it in is not a rename. Without that guard the profile drew a previous-names
 * panel holding a blank row, which for a player discovered that way was their
 * whole history. `getPlayerNameHistory` skips a blank row too, plus one equal to
 * the current nickname: several writers feed this table, and the reader is the
 * one place the rule holds for all of them.
 */
export function makePlayerNameHistoryTable(region: string) {
  return pgTable(
    `${region}_player_name_history`,
    {
      id: serial("id").primaryKey(),
      accountId: bigint("account_id", { mode: "number" }).notNull(),
      nickname: text("nickname").notNull(),
      recordedAt: timestamp("recorded_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (t) => [
      index(`${region}_player_name_history_account_id_idx`).on(t.accountId),
      // Reverse lookup: which account used to carry this nickname. Backs the
      // redirect from a renamed player's old URL, and every miss on it (any
      // unknown nickname reaches this path) would otherwise scan the table.
      index(`${region}_player_name_history_nickname_lower_idx`).on(
        sql`LOWER(${t.nickname})`,
      ),
    ],
  );
}

export type PlayerNameHistoryTable = ReturnType<
  typeof makePlayerNameHistoryTable
>;
export type PlayerNameHistoryRow = PlayerNameHistoryTable["$inferSelect"];

export const playerNameHistoryByRegion: Record<Region, PlayerNameHistoryTable> =
  {
    [Region.EU]: makePlayerNameHistoryTable(Region.EU),
    [Region.NA]: makePlayerNameHistoryTable(Region.NA),
    [Region.ASIA]: makePlayerNameHistoryTable(Region.ASIA),
  };
