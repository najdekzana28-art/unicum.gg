import {
  formatTankRef,
  tankRefLabel,
  TankClient,
  toTankClient,
} from "@unicum.gg/shared";

/**
 * How a comparison column is identified and named.
 *
 * A column is a vehicle on a game client at a position, not a vehicle: a
 * comparison can hold the same tank twice, once live and once as the running
 * Common Test has it, and it can hold the same tank on the same client twice
 * under two setups. So neither the slug nor the name is enough on its own, and
 * everything that keys, links to or labels a column goes through here rather
 * than reaching for `slug`.
 *
 * `client` is a bare string and `occurrence` may be missing, both narrowed on
 * the way in, because these run on both sides of the HTTP boundary: a TypeScript
 * enum does not survive it (the SDK types the field as its literal union), and a
 * comparison is cached for an hour, so a payload assembled before either field
 * existed carries neither. They read as the live, first column rather than as
 * `slug@undefined~undefined` in a URL.
 */
export type ColumnRef = { slug: string; client?: string; occurrence?: number };

/** Which client a column is on, whatever shape the field arrived in. */
export const columnClient = (v: ColumnRef): TankClient => toTankClient(v.client);

/** Which of the columns on this vehicle this one is, counted from 1. */
export const columnOccurrence = (v: ColumnRef): number =>
  typeof v.occurrence === "number" && v.occurrence > 1 ? v.occurrence : 1;

/** True when the column shows the test build rather than the live one. */
export const isTestColumn = (v: ColumnRef): boolean =>
  columnClient(v) === TankClient.CommonTest;

/** True when the comparison already held this vehicle before this column: the
 * same tank again, under a setup of its own. */
export const isRepeatColumn = (v: ColumnRef): boolean => columnOccurrence(v) > 1;

/** A column's reference, as it appears in the path: `is-7`, `is-7@ct`,
 * `is-7~2`. */
export const vehicleRef = (v: ColumnRef): string =>
  formatTankRef({
    slug: v.slug,
    client: columnClient(v),
    occurrence: columnOccurrence(v),
  });

/** A column's name, told apart from its twins only when it has any. */
export const vehicleLabel = (v: ColumnRef & { meta: { name: string } }): string =>
  tankRefLabel(v.meta.name, {
    client: columnClient(v),
    occurrence: columnOccurrence(v),
  });
