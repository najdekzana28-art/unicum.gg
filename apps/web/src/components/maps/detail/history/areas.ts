import {
  BATTLE_TYPE_LABEL,
  BattleType,
  MAP_AREA_MAP,
  MAP_AREA_ONSLAUGHT,
  MAP_VARIANT_PREFIX,
  type MapChangeArea,
} from "@unicum.gg/shared";
import type { TranslateFunction } from "@onruntime/translations";
import { battleTypeName } from "@/components/game-name";

/** The map's own rows first, then its Onslaught area, then the variants, so a
 * version reads from the ground everyone plays outwards. */
export function areaRank(area: MapChangeArea): number {
  if (area === MAP_AREA_MAP) return 0;
  if (area === MAP_AREA_ONSLAUGHT) return 1;
  return 2;
}

/** What to call an area above its rows. A variant area carries its battle type,
 * so it names itself. The map's own area is the map, and names nothing.
 *
 * The name is the game's own, in the reader's language: `BATTLE_TYPE_LABEL` is
 * the English catalogue the key space is built from, and `game/vocabulary` is
 * what Wargaming calls it. A French player reads "Offensive", never "Onslaught".
 */
export function areaLabel(
  area: MapChangeArea,
  tGame: TranslateFunction,
): string | null {
  if (area === MAP_AREA_MAP) return null;
  const battleType =
    area === MAP_AREA_ONSLAUGHT
      ? BattleType.Onslaught
      : area.slice(MAP_VARIANT_PREFIX.length);
  if (!(battleType in BATTLE_TYPE_LABEL)) return battleType;
  const name = battleTypeName(battleType, tGame);
  return name === `battle-types.${battleType}`
    ? BATTLE_TYPE_LABEL[battleType as BattleType]
    : name;
}
