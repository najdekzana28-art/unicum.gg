import { sql } from "drizzle-orm";
import { tournamentsByRegion } from "@unicum.gg/shared";
import { Region, TournamentStatus } from "@unicum.gg/wargaming";

/**
 * How long after its end a tournament is treated as settled whatever status it
 * still carries.
 *
 * Wargaming abandons tournaments in a non-terminal state and never comes back to
 * them: Asia holds fourteen sitting at `finished` since 2023 and 2024, and one
 * at `running` three weeks after it ended. `finished` is documented as "results
 * are still being settled", and for a live one that is true and takes hours (EU
 * carries a few, always a day or two old), but past a week it means nobody ever
 * pressed the button and nobody ever will.
 *
 * Reading status alone therefore fails twice over, and in opposite directions:
 * the archive never claims those tournaments, so their page keeps an empty
 * bracket forever, while the live pass re-mirrors a 2023 draw every five minutes
 * for as long as the row exists. A week is generous against the hours the real
 * transition takes, and being wrong costs one extra mirror of a bracket that is
 * already final.
 */
const ABANDONED_AFTER = "7 days";

/**
 * Whether a row belongs to the archive: settled by status, or old enough that
 * its status will not change again.
 *
 * One expression rather than a hand-written `where` clause per caller, because
 * the pass that mirrors what is live and the pass that drains what has settled
 * must stay EXACTLY complementary. Any gap between them either strands a
 * tournament in neither pass or leaves it in both, and each of those is a bug
 * that only shows up weeks later. The pass that writes the finishing order
 * reads it too: a round robin in play has a leader sitting at position 1, so a
 * third rule here would hand out a crest for a tournament nobody had won yet.
 */
export function isArchived(table: (typeof tournamentsByRegion)[Region]) {
  return sql`(${table.status} = ${TournamentStatus.Complete}
    OR ${table.endAt} < now() - interval '${sql.raw(ABANDONED_AFTER)}')`;
}
