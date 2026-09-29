/**
 * The two mechanical rules a translation must satisfy, in one place.
 *
 * Both the writer (`generate-translations.ts`) and the checker
 * (`tests/validation/locales/quality.ts`) need them, and they must never
 * disagree: a rule the writer enforces and the test does not is unverified, and
 * a rule the test enforces and the writer does not fails every run.
 */

/** The apostrophe is one character, and it is not the one on the keyboard.
 *
 * French elides, English contracts, Turkish suffixes a symbol, and all three
 * want U+2019. The prompt asks for it and the model answers with the ASCII
 * quote often enough that a run reintroduces dozens, so it is applied rather
 * than hoped for.
 *
 * Unicode-aware on purpose: with JavaScript's ASCII `\w`, Ukrainian "м'який"
 * matched nothing and kept its straight quote through every run. */
export const typographic = (value: string): string =>
  value.replace(/(?<=[\p{L}\p{N}}€$£¥%])'/gu, "’");

/** Whether a string is written entirely in capitals, on its own terms. */
function allCaps(value: string): boolean {
  const cased = [...value].filter((c) => c.toLowerCase() !== c.toUpperCase());
  return cased.length >= 4 && cased.every((c) => c === c.toUpperCase());
}

/**
 * Whether a translation shouts where its source does not.
 *
 * The game writes some of its own headings in capitals, and a model copies the
 * habit into strings the interface styles itself: "Grand Final" came back as
 * "GRANDE FINALE" in French and "GROSSES FINALE" in German on runs where the
 * prompt had already asked it not to.
 *
 * The case cannot be repaired, only refused: lowercasing "GROSSES FINALE" gives
 * "grosses finale", and German needs "Gro\u00dfes Finale", with a letter the
 * uppercase form does not carry.
 *
 * Judged AGAINST THE SOURCE, which took two false positives to get right. A
 * script without case leaves only the Latin acronyms visible here, so Korean
 * "\uc6d0\uaca9 MCP \uc11c\ubc84 URL" is six upper-case letters and nothing else countable, and
 * both "all capitals" and "mostly capitals" read it as shouting. But those
 * letters are the source's own acronyms, copied because that is what a
 * translation of "Remote MCP server URL" does. So every run of letters the
 * source already spells that way is dropped before judging, and what remains is
 * the words the model actually chose. Nothing is left in the Korean case, and
 * twelve shouted letters are left in the French one.
 */
export function shouts(value: string, source: string): boolean {
  // A source that shouts may be shouted back. "EU / NA / ASIA" is written that
  // way on purpose, and its one translatable word has to match the two beside
  // it: flagging "EU / NA / ASIE" asked French to write the only word it could
  // change in a case the line does not use.
  if (allCaps(source)) return false;
  // Runs of CASED letters, not of letters: `\p{L}+` swallows the script around
  // them, so Chinese "VIII\u7ea7" came back as one token that the source "Tier
  // VIII" does not contain, and a Roman numeral read as shouting. Stopping at
  // the first uncased character leaves "VIII", which the source does contain.
  const runs = value.match(/[\p{Lu}\p{Ll}]+/gu) ?? [];
  const own = runs.filter((run) => !source.includes(run));
  const cased = own.join("").split("").filter((c) => c.toLowerCase() !== c.toUpperCase());
  return cased.length >= 4 && cased.every((c) => c === c.toUpperCase());
}

/**
 * Whether a namespace is one of the game's own catalogues.
 *
 * Two spellings, and the second is the one that matters. The writer batches by
 * KIND, so `translate()` is handed "game" or "app" rather than the path the
 * strings came from: a guard written as `startsWith("game/")` alone reads every
 * batched game string as prose, and the exemption it was meant to be silently
 * never fires.
 */
export function isGameNamespace(namespace: string): boolean {
  return namespace === "game" || namespace.startsWith("game/");
}

/**
 * The families of `game/vocabulary` that hold a NAME Wargaming gives something,
 * as opposed to a word describing it.
 *
 * The distinction decides what may be held against an existing translation. A
 * mode, a board and an award have one name per language and it is the game's:
 * a French player reads "Bastion" and "Offensive" on their own screen, so a
 * page that says "forteresse" or "Assaut" is not translated, it is translated
 * twice. The families left out hold ordinary words that merely happen to be
 * catalogued (`stronghold-sorts.battles` is "Battles", `vehicle-roles.support`
 * is "Support", `map-modes.standard` is "Standard"), and forcing the game's
 * rendering of those onto "Standard shell damage" or "Support us" is how a rule
 * meant to fix a handful of headings rewrites the tree.
 */
export const GAME_NAME_FAMILIES: readonly string[] = [
  "battle-types",
  "clan-modes",
  "player-modes",
  "clan-boards",
  "stronghold-tiers",
  "features",
  "mastery-badges",
];

/**
 * The catalogued names that are an ordinary English word at the same time.
 *
 * `battle-types.random` is "Random", which our prose writes for the mode
 * ("Random Battles") and for a map hazard ("Random events") alike, and only the
 * first is the game's. Nothing is lost by dropping it: the mode's full name is
 * catalogued beside it as `clan-modes.random`, and two words are unambiguous.
 */
const AMBIGUOUS_GAME_NAMES = new Set(["Random"]);

/**
 * A name the game gives something, in English and in the reader's language.
 *
 * `pattern` is built once with the name rather than inside the search below.
 * The same forty-odd names are tested against every string of every locale,
 * which is millions of matches per run, and the escaped source and the `u` flag
 * never change.
 */
export type GameName = { english: string; own: string; pattern: RegExp };

/** Every leaf of one `game/vocabulary` family, dotted from the family down. */
function leaves(value: unknown, prefix: string): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * What the game calls each of its own things, in one language.
 *
 * Read from the two `game/vocabulary` files rather than from a list here, so a
 * mode Wargaming adds is covered the day its name is written. A name whose
 * English carries a placeholder is skipped: `{onslaught} Night` is built from
 * another entry and has no word of its own to hold anything to.
 *
 * ONE entry per English name, and a name the locale renders two ways is dropped
 * rather than settled on whichever family came first. Several English names sit
 * in more than one family (Skirmish is in three), which is fine while the
 * renderings agree and is a contradiction in the catalogue when they do not:
 * Belarusian calls Skirmish both "Сутычка" and "Вылазка", Hindi both "मुठभेड़"
 * and "झड़प". Enforced, that asks for a string carrying BOTH, which no
 * translation can satisfy: the key is refused, retried, refused again, and
 * reported forever. A catalogue that has not made up its mind cannot hold prose
 * to a decision, so it holds it to nothing until the file is corrected.
 */
export function gameNames(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
): GameName[] {
  const byName = new Map<string, Set<string>>();
  for (const family of GAME_NAME_FAMILIES) {
    const theirs = Object.fromEntries(leaves(target[family], family));
    for (const [path, english] of leaves(source[family], family)) {
      const own = theirs[path];
      if (english.includes("{") || english.length < 4) continue;
      if (AMBIGUOUS_GAME_NAMES.has(english)) continue;
      if (!own || own === english) continue;
      const held = byName.get(english);
      if (held) held.add(own);
      else byName.set(english, new Set([own]));
    }
  }
  const settled: GameName[] = [];
  for (const [english, renderings] of byName) {
    if (renderings.size !== 1) continue;
    const [own] = renderings;
    if (own === undefined) continue;
    settled.push({
      english,
      own,
      pattern: new RegExp(
        `(^|[^\\p{L}\\p{N}])${english.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`,
        "u",
      ),
    });
  }
  // Longest first, so a string naming "Random Battles" is judged on that rather
  // than on a shorter name it happens to contain.
  return settled.sort((a, b) => b.english.length - a.english.length);
}

/**
 * Whether a translation carries a word, allowing for inflection.
 *
 * Full containment is wrong the moment a language declines: the Italian noun is
 * "Potenziamento" and a heading needs "Potenziamenti", the Ukrainian
 * "Модернізація" becomes "Модернізації" in the genitive, and neither contains
 * the catalogued form. Compared on a stem rather than on the whole word, a word
 * that never matches its own correct inflection would flag the string forever.
 *
 * The stem is three quarters of the word, floored at four characters, so it
 * still separates one name from another: "Melhoramentos" and "Melhorias" part
 * company at the fifth letter. A word holding no token of four characters gets
 * no tolerance and is compared whole, which is the right answer where that
 * happens rather than a gap: those are the scripts writing a name in two or
 * three characters and not inflecting it ("要塞", "赛事"), so there is no
 * ending to allow for.
 */
export function carriesWord(current: string, word: string): boolean {
  const text = current.toLowerCase();
  if (text.includes(word.toLowerCase())) return true;
  const words = word
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((part) => part.length >= 4);
  if (words.length === 0) return false;
  return words.every((part) =>
    text.includes(part.slice(0, Math.max(4, Math.ceil(part.length * 0.75)))),
  );
}

/**
 * The game's own name an English string writes and its translation does not.
 *
 * The one failure no other rule here sees. `carriesUndecidedTerm` catches a
 * translation that still says the English word, which is a model that gave up;
 * this catches one that translated it perfectly well into a word the game does
 * not use, which is a model that tried. "Stronghold boosts" came back as
 * "Boosts de forteresse" beside a stats table headed "Bastion", "Onslaught
 * Champion" as "Champion de l'Assaut" beside a board headed "Offensive", and
 * neither is visible in review: both read as French, and only a player knows
 * their own game says otherwise.
 *
 * Matched CASE-SENSITIVELY on the English, which is the same safeguard the term
 * block uses and for the same reason: a catalogued name is written the way the
 * game writes it, and its lowercase spelling mid-sentence is the ordinary word
 * we did not name. Placeholder contents are dropped first, since the word
 * inside `{tank}` is the developer's rather than the reader's.
 */
export function missingGameName(
  source: string,
  current: string,
  names: readonly GameName[],
): GameName | undefined {
  const bare = source.replace(/\{[^{}]*\}/g, " ");
  return names.find(
    (name) => name.pattern.test(bare) && !carriesWord(current, name.own),
  );
}
