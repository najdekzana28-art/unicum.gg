import {
  MapPoiType,
  splitVariantField,
} from "@unicum.gg/shared";
import Image from "next/image";
import {
  BASE,
  CONTROL_POINT,
  poiUrl,
  spawnUrl,
} from "@/components/maps/detail/minimap-overlay";
import { cn } from "@/lib/utils";

/** The gameplay token a geometry field belongs to (`geometry:comp7:spawns:team1`). */
// A change recorded on a variant arena carries a `variant:<battleType>:` prefix,
// which sits in front of the key these read, so it comes off first.
const stripVariant = (field: string) =>
  splitVariantField(field)?.field ?? field;

/** The marker family a geometry field describes (`bases:team1`, `controlPoint`,
 * `pointsOfInterest:recon`, ...). */
const familyOf = (field: string) =>
  stripVariant(field).split(":").slice(2).join(":");

/**
 * The game's own minimap icon for a marker family.
 *
 * The same ones the map's viewer draws, so a base reads as a base and a spawn as
 * a spawn here too: a row of identical dots says something moved without ever
 * saying what. Spawns are numbered 1..4 in game, so each takes its own numeral.
 */
export function iconFor(field: string, index: number): string {
  const family = familyOf(field);
  if (family === "bases:team1") return BASE.team1;
  if (family === "bases:team2") return BASE.team2;
  if (family === "spawns:team1") return spawnUrl("team1", index);
  if (family === "spawns:team2") return spawnUrl("team2", index);
  if (family === "pointsOfInterest:recon") return poiUrl(MapPoiType.CommsCenter);
  if (family === "pointsOfInterest:flare") {
    return poiUrl(MapPoiType.ObservationPost);
  }
  if (family.startsWith("pointsOfInterest")) {
    return poiUrl(MapPoiType.ArtilleryHeadquarters);
  }
  return CONTROL_POINT;
}

/**
 * Marker size as a share of the minimap's width rather than a pixel count.
 *
 * The same drawing is rendered twice, in the history panel's 16rem column and
 * enlarged in its dialog, and a pixel size tuned for one swamps or disappears on
 * the other. The share is the 22 px the small map was drawn at, over the 256 px
 * it is drawn in, so the panel is unchanged and the enlarged view scales with it.
 */
const ICON_PCT = (22 / 256) * 100;

/** The intrinsic size requested from the optimizer. Bigger than the panel's own
 * 22 px because the same file is drawn several times larger in the dialog. */
const ICON_SOURCE = 64;

/** One marker of a version's before/after overlay, drawn with the game's icon.
 * The old position is ghosted and the new one solid, which is the whole reading
 * of the pair. */
export function HistoryMarker({
  src,
  at,
  ghost,
}: {
  src: string;
  at: { left: string; top: string };
  ghost?: boolean;
}) {
  return (
    // The width is a share of the minimap, not `max-content`: a shrink-to-fit
    // box is squeezed by the space left to the container edge, so a marker near
    // the border would render tiny.
    <span
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ ...at, width: `${ICON_PCT}%` }}
    >
      <Image
        src={src}
        alt=""
        width={ICON_SOURCE}
        height={ICON_SOURCE}
        className={cn(
          "h-auto w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
          ghost && "opacity-45 grayscale",
        )}
      />
    </span>
  );
}
