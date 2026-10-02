// Which files a vehicle's first picture is made of.
//
// **Here rather than in the viewer, because two places now need the same
// answer.** The viewer reads the manifest and picks its pieces at the moment it
// builds them, which was fine while it was the only one asking. A page that
// wants those files fetched before the viewer exists has to name them from the
// server, and a name that differs by one file is not an error anybody sees: the
// browser fetches what was asked for, the viewer asks for something else, and
// the preload is simply paid for twice. So the rule lives once and both read it.
import type { MirrorModel } from "./models-shapes";

/** What a reader has mounted, by slot, under the game's own module names. */
export type MirrorMounted = Partial<Record<"gun" | "turret" | "chassis", string>>;

/** Which of the two texture sets a picture is drawn from. */
export type MirrorDefinition = "hd" | "sd";

/**
 * The client's shared micro-grain, which is not part of a first picture.
 *
 * Every material in the game names it and the mirror publishes one copy, 6.3 MB
 * of it, which is three quarters of everything a vehicle would otherwise pull.
 * The viewer stands the tank up on an invented grain and fetches the real one
 * afterwards, so naming it here would undo that by pulling it up the critical
 * path it was deliberately moved off.
 */
const DEFERRED_SLOT = "metallicDetailMap";

/**
 * The pieces a vehicle is drawn from, in the order they are assembled.
 *
 * A vehicle ships one turret and one gun per module a player can mount. The
 * reader's choice wins where they have made one, and the first by name is the
 * stock loadout, which is what a page carrying no choice shows.
 */
export function piecesOf(model: MirrorModel, mounted?: MirrorMounted): string[] {
  const names = Object.keys(model.pieces).sort();
  const chosen = (slot: keyof MirrorMounted) => {
    const key = mounted?.[slot];
    const piece = key ? model.modules?.[key] : undefined;
    return piece && model.pieces[piece] ? piece : undefined;
  };
  const first = (prefix: string) => {
    const slot =
      prefix === "Gun"
        ? "gun"
        : prefix === "Turret"
          ? "turret"
          : prefix === "Chassis"
            ? "chassis"
            : null;
    return (slot ? chosen(slot) : undefined) ?? names.find((n) => n.startsWith(prefix));
  };
  return ["Hull", "Chassis", "Turret", "Gun"]
    .map(first)
    .filter((n): n is string => n !== undefined);
}

/** The track link models, which are pieces of their own rather than a body part. */
function linksOf(model: MirrorModel): string[] {
  const t = model.tracks;
  if (!t) return [];
  return [t.segment, t.segment2, t.segmentRight, t.segment2Right].filter(
    (n): n is string => typeof n === "string" && Boolean(model.pieces[n]),
  );
}

/**
 * Every file the vehicle's first picture reads, as mirror-relative paths.
 *
 * Geometry and maps are kept apart because a browser fetches them differently:
 * a `.glb` arrives through `fetch` and a texture through an `<img>`, and a
 * preload that names the wrong one of the two is a second copy rather than a
 * head start.
 */
export function firstPaintFiles(
  model: MirrorModel,
  {
    mounted,
    definition = "sd",
  }: { mounted?: MirrorMounted; definition?: MirrorDefinition } = {},
): { geometry: string[]; textures: string[] } {
  const pieces = [...piecesOf(model, mounted), ...linksOf(model)];
  const geometry: string[] = [];
  const slots = new Set<number>();
  for (const name of pieces) {
    const piece = model.pieces[name];
    if (!piece) continue;
    if (!geometry.includes(piece.glb)) geometry.push(piece.glb);
    for (const mesh of piece.meshes ?? []) {
      for (const at of mesh.materials) slots.add(at);
    }
  }
  const textures: string[] = [];
  for (const at of slots) {
    const material = model.materials[at];
    for (const [slot, entry] of Object.entries(material?.textures ?? {})) {
      if (slot === DEFERRED_SLOT) continue;
      // The pair is the same texture at two sides, and the viewer samples one
      // of them: naming both would double the bytes to save nothing.
      const path = definition === "hd" && entry.hd ? entry.hd : entry.path;
      if (path && !textures.includes(path)) textures.push(path);
    }
  }
  return { geometry, textures };
}
