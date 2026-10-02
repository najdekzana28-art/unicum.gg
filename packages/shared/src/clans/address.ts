/**
 * How a clan is addressed in a URL.
 *
 * A living clan is addressed by its tag, which is the name everybody knows it
 * by and the one a reader would type. That cannot work for a clan that has
 * ended, because Wargaming FREES its tag the moment it does: the next clan to
 * take it owns the name, and the archive would either hide that clan or lose
 * its own page the day the name was taken. So an ended clan is addressed by its
 * tag AND its id, which is permanent, and the bare tag always means whoever
 * holds it today.
 */

/** The `-<id>` suffix is unambiguous by construction: a clan tag is 2 to 5
 * characters of `A-Z`, `0-9`, `-` and `_` (measured across 130,064 EU clans),
 * so no tag can be, or end in, a run of nine digits. */
const ARCHIVE_SUFFIX = /-(\d{9,})$/;

/** The path segment this clan is reached at. */
export function clanAddress(clan: {
  tag: string;
  id: number;
  isDisbanded?: boolean;
}): string {
  return clan.isDisbanded ? `${clan.tag}-${clan.id}` : clan.tag;
}

/**
 * Read a path segment back. `id` is set only for an archive address, and the
 * caller resolves by it rather than by the tag, since the tag may since have
 * been taken by a clan that is still playing.
 */
export function parseClanAddress(segment: string): {
  tag: string;
  id: number | null;
} {
  const match = ARCHIVE_SUFFIX.exec(segment);
  if (!match) return { tag: segment, id: null };
  return {
    tag: segment.slice(0, match.index),
    id: Number(match[1]),
  };
}
