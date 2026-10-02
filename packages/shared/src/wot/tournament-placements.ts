/**
 * How a tournament's finishing order is read, shared by the page that draws it
 * and the pass that writes the winner's crest.
 *
 * ONE implementation on purpose: the two ran on separate copies and disagreed,
 * which is the worst possible outcome for a mark that claims a result. The
 * bracket page showed ENIGMA winning EU tournament 5000015153 while the crest
 * was awarded to Piranhas, who had won the match FOR THIRD.
 */

/** The minimum a caller has to hand over: stages, their groups, and the
 * standings inside them. Both the API payload and the DB rows satisfy it. */
export type PlacementStage = {
  groups: { standings: { teamId: number; position: number | null }[] }[];
};

/**
 * The range of places a stored position covers: `from` is the best place of the
 * tie and `to` its worst, so a place only one team holds has `from === to`.
 *
 * Shown, a tie takes its BEST place, which is how a ranking is normally
 * written: two teams tied for third are both 3rd and the next one is 5th, not
 * "3-4" twice. The worst place is kept rather than thrown away because it is
 * what says how far a tie reaches, and a reward band can only be claimed for a
 * tie that fits inside it.
 */
export type PlaceSpan = { from: number; to: number };

/**
 * Whether a set of standings numbers its ties by their WORST place.
 *
 * A knockout does: everyone out in the same round ties, and a 30-team bracket
 * stores 1, 2, 4, 4, 8, 8, 8, 8, 13... That is the result rather than a
 * numbering bug, and renumbering it 1..n would invent a ranking the tournament
 * never decided. The two beaten semi-finalists take places 3 and 4 and are both
 * recorded as 4, which is how Wargaming reads it too, banding its rewards as
 * "3rd-4th place" and "5th-8th place".
 *
 * A round robin does NOT. A league stage with three teams level at the top
 * stores 1, 1, 1, 4, 4, 4, 4: the position IS the rank, already the best place
 * of the tie. Asia's tournament 2000000490 is exactly that, and read as a
 * knockout its four bottom teams came out sharing first place with the three
 * that actually led it, each of them a gold medal on a profile page.
 *
 * Which one it is falls out of the numbers, so nothing has to be told: under
 * the knockout convention the teams placed at or above any stored place number
 * exactly that place. A field with no ties at all satisfies both readings and
 * is numbered identically by either, so there is nothing to choose.
 */
function tiesAtWorstPlace(counts: Map<number, number>): boolean {
  let covered = 0;
  for (const place of [...counts.keys()].sort((a, b) => a - b)) {
    covered += counts.get(place)!;
    if (covered !== place) return false;
  }
  return true;
}

export function placeSpans(
  placements: Map<number, number>,
): Map<number, PlaceSpan> {
  const counts = new Map<number, number>();
  for (const place of placements.values()) {
    counts.set(place, (counts.get(place) ?? 0) + 1);
  }
  // Standings that answer to neither convention are read as ranks, which is the
  // reading that never moves a team UP: inventing a place is the failure that
  // reaches a reader as a medal, and a team shown at the number its own
  // tournament recorded cannot be wrong about more than its ties.
  const worst = tiesAtWorstPlace(counts);
  const spans = new Map<number, PlaceSpan>();
  for (const [place, held] of counts) {
    spans.set(
      place,
      // Floored on the knockout side all the same: the convention check makes
      // it unreachable, and a place of zero is the one answer no caller can do
      // anything sensible with.
      worst
        ? { from: Math.max(1, place - held + 1), to: place }
        : { from: place, to: place + held - 1 },
    );
  }
  return spans;
}

/**
 * The finishing order, when the tournament recorded one.
 *
 * Read off a stage's standings rather than off the tree, since that is where a
 * placement lives, and only from a stage that is a SINGLE bracket: a stage of
 * parallel groups (a qualifier drawn into five brackets, a group stage of two
 * pools) numbers its standings per group, so every pool has a 1st. Flattening
 * those claimed several winners for one tournament.
 *
 * The last such stage is usually the answer, but not always: a third-place
 * match is filed as its OWN stage, so the last one is a two-team bracket whose
 * winner is "1st" of a match for third. Taken at face value it crowned the
 * third-placed team and left every other team unplaced.
 *
 * What identifies it is not its title, which is free text, but its shape: every
 * one of its teams is tied at the same place in the stage before it. That is
 * what a decider IS, so it is read as one, and its order splits that tie
 * instead of replacing the tournament. Teams that reach a later stage on merit
 * hold DIFFERENT places in the earlier one, so a real final stage is untouched.
 */
export function finalPlacements(
  stages: PlacementStage[],
): { position: number; teamId: number }[] {
  const single = stages.filter((stage) => stage.groups.length === 1);
  if (single.length === 0) return [];

  let base = single[single.length - 1]!;
  let decider: PlacementStage | null = null;
  const previous = single[single.length - 2];
  if (previous) {
    const before = new Map(
      previous.groups[0]!.standings
        .filter((s) => s.position !== null)
        .map((s) => [s.teamId, s.position!]),
    );
    const contenders = base.groups[0]!.standings.map((s) => s.teamId);
    const places = contenders.map((id) => before.get(id));
    const allTied =
      contenders.length > 0 &&
      contenders.length < before.size &&
      places.every((place) => place !== undefined) &&
      new Set(places).size === 1;
    if (allTied) {
      decider = base;
      base = previous;
    }
  }

  const placed = new Map(
    base.groups[0]!.standings
      .filter((s) => s.position !== null)
      .map((s) => [s.teamId, s.position!]),
  );

  // A stage that separated nobody placed nobody, and Wargaming leaves two kinds
  // of those behind. A bracket drawn and never played stores every team at the
  // place its first match would have decided and nobody at first: Asia's
  // "Tuesday's 1v1 Tier V" of 12 July 2022 has eleven teams in its HK playoff,
  // eight recorded at 8 and three at 11. A round robin nobody played stores its
  // whole field level at the top: the HK stage of Asia's 2000001168 has six
  // teams, all of them 1st. Read as finishing orders, which is what they look
  // like, the first hands eight teams a share of first place and the second
  // hands it to six, each one a gold medal beside a profile whose winner's
  // crest refuses it.
  //
  // So an order has to put somebody first and has to tell somebody apart.
  // Refused here rather than downstream, because by then it is indistinguishable
  // from a result, and refused for every reader of this rule at once. Those
  // teams are left unplaced rather than placed wrongly, which is the honest
  // reading of a bracket nobody played.
  const distinct = new Set(placed.values());
  if (!distinct.has(1) || distinct.size < 2) return [];

  if (decider) {
    // The tie runs from `shared - n + 1` to `shared`, since a stored place is
    // its LOWEST. The decider's own order hands those out, so its winner takes
    // the best of them.
    const order = decider
      .groups[0]!.standings.filter((s) => s.position !== null)
      .slice()
      .sort((a, b) => a.position! - b.position!)
      .map((s) => s.teamId);
    const shared = placed.get(order[0]!);
    if (shared !== undefined) {
      order.forEach((teamId, i) => {
        placed.set(teamId, shared - order.length + 1 + i);
      });
    }
  }

  return [...placed]
    .map(([teamId, position]) => ({ teamId, position }))
    .sort((a, b) => a.position - b.position);
}
