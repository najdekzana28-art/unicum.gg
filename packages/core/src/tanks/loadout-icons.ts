import type { Region } from "@unicum.gg/wargaming";
import { assetsRefFor, iconUrl } from "@unicum.gg/shared";
import {
  getTankLoadout,
  type LoadoutEquipment,
} from "@unicum.gg/core/wargaming/wot/tanks/loadout";

/**
 * The picture and the proper name behind each key a loadout carries.
 *
 * The mod sends keys, because a key is what survives a patch and what an
 * aggregate groups by. A page needs a picture and a name, and both already
 * exist: the vehicle's own catalogue knows every device, directive and
 * consumable it can mount, with the image Wargaming publishes for each.
 *
 * Looked up rather than derived, and that is the whole point of this file. The
 * keys mostly resolve straight against the icon mirror, so it is tempting to
 * build a URL from the key and be done. They do not all resolve: a graded
 * variant (`grousers_tier1`) and a directive (`turbochargerBattleBooster`)
 * both point at the base device's picture, and guessing that rule means
 * stripping a suffix here and lowercasing a letter there until the 404s stop.
 * The catalogue holds the answer Wargaming gave, so it is read instead.
 *
 * Crew skills are the exception and are built from the key, because they
 * genuinely are one file per skill on the mirror and no catalogue maps them.
 */

/** What a key resolves to, for drawing. */
export interface LoadoutIcon {
  /** The catalogue key, which an experimental device's level is read from. */
  key: string;
  /**
   * The game's own name for it, in the language the catalogue was read in.
   *
   * Empty on an entry recovered from a device family (see below): that route
   * finds the picture but not the name, and the device's own name is not the
   * directive's. The caller falls back to the client's dictionary, which has
   * the right one.
   */
  name: string;
  /** The picture, or null when Wargaming publishes none. */
  image: string | null;
  /**
   * Equipment only: how it was acquired, `bond`, `bounty`, `bountyUpgraded`
   * or `experimental`.
   *
   * Carried because the picture alone does not say it. Wargaming's own API
   * returns the plain artefact image for a Bounty Rammer and for the ordinary
   * one alike, and the game marks the difference with a corner overlay
   * composited on top. Without this, two very different devices draw
   * identically.
   */
  grade?: string;
  /** Equipment only: its Equipment 2.0 categories, which the game dots. */
  categories?: string[];
}

/** Every key this vehicle can mount, pointing at its picture and its name. */
export async function loadoutIcons(
  region: Region,
  tankId: number,
): Promise<Map<string, LoadoutIcon>> {
  const icons = new Map<string, LoadoutIcon>();
  const catalogue = await getTankLoadout(region, tankId).catch(() => null);
  if (!catalogue) return icons;
  for (const item of catalogue.equipment) {
    if (!item.key) continue;
    icons.set(item.key, {
      key: item.key,
      name: item.name,
      image: item.image,
      grade: item.grade,
      categories: item.categories,
    });
  }
  for (const group of [catalogue.directives, catalogue.consumables]) {
    for (const item of group) {
      if (!item.key) continue;
      icons.set(item.key, {
        key: item.key,
        name: item.name,
        image: item.image,
      });
    }
  }
  addMissingDirectives(catalogue.equipment, icons);
  return icons;
}

/**
 * The directives the catalogue left out, recovered from the device they boost.
 *
 * The vehicle's directive list is built for the tank page's configurator,
 * which drops any directive whose effect moves no characteristic the table
 * shows: toggling one there would look like a no-op. Ventilation Purge is the
 * clearest case, since Improved Ventilation raises the crew's level rather
 * than a listed statistic, so it is filtered out on every vehicle.
 *
 * That filter is right for a control and wrong for a record. This page is not
 * offering the player a switch, it is reporting what they mounted, and a
 * directive they are carrying has to draw whatever it does to the spec sheet.
 * A text box with the directive's name in it was the visible symptom.
 *
 * A directive is named after the device family it enhances plus the suffix
 * Wargaming uses for it, which is how the catalogue joins the two itself, so
 * the key gives the family and the family gives the picture. The picture only:
 * the name comes from the client's own dictionary, because the device is not
 * the directive and the two are not called the same thing.
 */
function addMissingDirectives(
  equipment: LoadoutEquipment[],
  icons: Map<string, LoadoutIcon>,
): void {
  const SUFFIX = "BattleBooster";
  for (const device of equipment) {
    if (!device.icon) continue;
    const key = `${device.icon}${SUFFIX}`;
    const held = icons.get(key);
    // The standard grade wins: a family's picture should not come from its
    // bond variant when the ordinary device is right there.
    if (held?.image && held.name) continue;
    if (held && device.grade !== "standard") continue;
    icons.set(key, { key, name: "", image: device.image });
  }
}

/**
 * A crew skill's picture, from its key.
 *
 * One file per skill on the assets mirror, which is where the tank page's own
 * crew section reads them: Wargaming's own icon URLs for these are dead.
 */
export function crewSkillIcon(key: string): string {
  return `${iconUrl("tankmen/skills/big", assetsRefFor())}/${key}.png`;
}
