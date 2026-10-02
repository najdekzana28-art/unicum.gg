import { TankClient, toTankClient } from "./common-test";

/**
 * How a vehicle names the client it is being read on, when one string has to
 * carry both: `amx-13-90@ct`.
 *
 * A comparison addresses its columns by slug, in the path, which leaves no room
 * for a query param per column and no way to tell two columns of the same
 * vehicle apart. Suffixing the slug does both, and stays readable in a link.
 */
export const TANK_CLIENT_SEPARATOR = "@";

/**
 * How a column says it is the second (or third) look at a vehicle already in
 * the comparison: `is-7~2`.
 *
 * The same vehicle set up two ways is the comparison a player runs before
 * spending credits, and it is the one thing the client suffix above cannot
 * express: both columns are the same tank on the same client, and only the
 * setups differ. Those live in a query param, so they cannot be what tells the
 * columns apart here.
 *
 * Explicit rather than implied by a repeat in the path, for two reasons. A bare
 * repeat is far more often a typo or a crawler than an intent, and collapsing it
 * is what keeps a comparison at one URL. And the setups cannot decide it either:
 * "apply this setup to every column" deliberately makes them all identical, so a
 * rule that collapsed equal setups would delete the duplicated column at the
 * exact moment a reader used it.
 *
 * `~` because it is unreserved in a URL, so it survives a path segment, a CSV
 * query value and a copy/paste without ever percent-encoding, and no slug of
 * ours contains one.
 */
export const TANK_OCCURRENCE_SEPARATOR = "~";

/** A vehicle on a given client, at its position among the columns showing that
 * same pair: what a comparison column is. `occurrence` is 1-based and 1 for the
 * vehicle's first column, which is the ordinary case and writes no suffix. */
export type TankRef = { slug: string; client: TankClient; occurrence: number };

/** A ref to write out. `occurrence` is optional so the common caller, which
 * only knows a slug and a client, needs to say nothing about repeats. */
export type TankRefInput = {
  slug: string;
  client: TankClient;
  occurrence?: number;
};

const OCCURRENCE_RE = new RegExp(`${TANK_OCCURRENCE_SEPARATOR}(\\d+)$`);

/** Read `is-7`, `is-7@ct`, `is-7~2` or `is-7@ct~2`. Anything malformed reads as
 * the plain live vehicle rather than failing: this comes out of a URL anyone can
 * type. */
export function parseTankRef(raw: string): TankRef {
  const trimmed = raw.trim().toLowerCase();

  // The occurrence comes off first: it is the outermost suffix, so stripping it
  // leaves exactly the `slug@client` the client rule already knows how to read.
  let rest = trimmed;
  let occurrence = 1;
  const repeat = OCCURRENCE_RE.exec(trimmed);
  if (repeat) {
    const n = Number(repeat[1]);
    // The suffix comes off whatever it says, because it is digits by the time it
    // matches and no slug of ours holds a `~`: leaving `is-7~0` whole would make
    // the marker part of the vehicle's name and lose the column to a catalogue
    // that has never heard of it. A zeroth column is not a column, so it reads
    // as the first one and normalization renumbers it from there.
    rest = trimmed.slice(0, repeat.index);
    if (Number.isSafeInteger(n) && n > 0) occurrence = n;
  }

  const at = rest.lastIndexOf(TANK_CLIENT_SEPARATOR);
  if (at <= 0) return { slug: rest, client: TankClient.Live, occurrence };
  return {
    slug: rest.slice(0, at),
    client: toTankClient(rest.slice(at + 1)),
    occurrence,
  };
}

/** Write a ref back. Live carries no suffix and neither does a first occurrence,
 * so an ordinary comparison keeps the URL it has always had. */
export function formatTankRef({ slug, client, occurrence }: TankRefInput): string {
  const onClient =
    client === TankClient.CommonTest
      ? `${slug}${TANK_CLIENT_SEPARATOR}${client}`
      : slug;
  return occurrence && occurrence > 1
    ? `${onClient}${TANK_OCCURRENCE_SEPARATOR}${occurrence}`
    : onClient;
}

/**
 * The columns a request asks for, as this comparison actually is.
 *
 * Two passes, and the order matters. Refs are deduped **as written**, so a bare
 * repeat (`is-7/vs/is-7`) still collapses to one column and a comparison keeps
 * one URL, while a deliberate repeat (`is-7/vs/is-7~2`) survives because the two
 * strings differ. Then occurrences are **renumbered densely** in the order the
 * columns appear, so `is-7~5` alone is `is-7` and `is-7~2/vs/is-7` is written
 * `is-7/vs/is-7~2`: every comparison has exactly one spelling, which is what the
 * canonical redirect is comparing against.
 *
 * Renumbering never reorders, so the setups, which align with the columns by
 * index, stay on the columns they were written for.
 */
export function normalizeTankRefs(raw: string[], limit: number): string[] {
  const seen = new Set<string>();
  const kept: TankRef[] = [];
  for (const part of raw) {
    const ref = parseTankRef(part);
    if (!ref.slug) continue;
    const written = formatTankRef(ref);
    if (seen.has(written)) continue;
    seen.add(written);
    kept.push(ref);
    if (kept.length === limit) break;
  }

  const counts = new Map<string, number>();
  return kept.map((ref) => {
    const pair = formatTankRef({ slug: ref.slug, client: ref.client });
    const occurrence = (counts.get(pair) ?? 0) + 1;
    counts.set(pair, occurrence);
    return formatTankRef({ ...ref, occurrence });
  });
}

/**
 * A vehicle's name, told apart from the columns it shares that name with.
 *
 * Shared because three places name a column and they must agree: the page's
 * title and its metadata, the board itself, and the OG card a shared link
 * unfurls into. A test column carries the client, a repeated one its position,
 * and a column that is both carries them together rather than in two brackets.
 */
export function tankRefLabel(
  name: string,
  { client, occurrence }: Pick<TankRefInput, "client" | "occurrence">,
): string {
  const parts: string[] = [];
  if (client === TankClient.CommonTest) parts.push("Common Test");
  if (occurrence && occurrence > 1) parts.push(String(occurrence));
  return parts.length ? `${name} (${parts.join(", ")})` : name;
}
