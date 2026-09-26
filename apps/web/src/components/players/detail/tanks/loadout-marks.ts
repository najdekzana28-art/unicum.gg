import type { LoadoutIcon } from "@unicum.gg/core/tanks/loadout-icons";
import { iconUrl } from "@unicum.gg/shared";
import { GRADE_OVERLAY } from "@/components/tanks/detail/specifications/equipment/category";

/**
 * The marks the game paints on a device box: how it was acquired, and what it
 * specializes in.
 *
 * Both exist because the picture alone does not carry them. Wargaming's API
 * returns the SAME artefact image for a Bounty Rammer and an ordinary one, and
 * the game tells them apart with a corner overlay composited on top; the
 * Equipment 2.0 category is likewise a coloured dot rather than anything in
 * the icon. Drawing the picture on its own makes two very different devices
 * look identical, which is what this file exists to prevent.
 *
 * The overlay table and the category colours are the tank page's own
 * (`specifications/equipment/category`), imported rather than copied: a second
 * table of the same grades is a second thing to keep true, and the two pages
 * would drift the first time Wargaming adds a grade.
 */

/** The experimental level (1-3) a modernized device carries in its key. */
function experimentalLevel(entry: LoadoutIcon): number {
  return entry.grade === "experimental"
    ? Number(entry.key.match(/(\d+)$/)?.[1] ?? 0)
    : 0;
}

/**
 * The corner overlay for a stored device, or null for standard gear.
 *
 * Takes what the loadout holds rather than a catalogue item, because that is
 * what a player page has: a key and the grade the catalogue answered with.
 */
export function gradeOverlay(
  entry: LoadoutIcon | undefined,
): string | null {
  if (!entry?.grade) return null;
  const level = experimentalLevel(entry);
  if (level > 0) {
    return iconUrl(`demountKit/experimental_level_icon_lvl${level}.png`);
  }
  return GRADE_OVERLAY[entry.grade] ?? null;
}
