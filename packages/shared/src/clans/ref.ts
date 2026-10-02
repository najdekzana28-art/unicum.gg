/** Minimal clan reference used across player/clan views (client-safe shape).
 * The lookups + emblem picking live in core (`wargaming/wot/clans/info`). */
export type ClanRef = {
  id: number;
  tag: string;
  name: string;
  color: string;
  emblem: string;
  // Empty `[]` from the public API (no languages there); enriched by callers.
  languages: string[];
  /** Whether the clan has since been disbanded. Optional because only the
   * lookups that read our own table know it: the public API blanks a disbanded
   * clan entirely, so a ref built from it cannot say. Absent reads as "not
   * known to be disbanded", which is what every caller rendered before. */
  isDisbanded?: boolean;
};
