import {
  MODELS_BRANCH,
  MODELS_REPO,
  firstPaintFiles,
  MIRROR_SKIN_FOLDER,
  modelsCdn,
  modelUrl,
  type MirrorModel,
  type WotSrcBranch,
  modelsRefFor,
} from "@unicum.gg/wargaming";
import { cachedInRedis } from "../../../redis";

// Which build of the geometry mirror is current, and what it carries.
//
// **Both answers in one, because the viewer needs them together.** It cannot
// fetch a vehicle without knowing where the mirror keeps it, and it should not
// fetch anything without knowing which commit it is reading: pinned to the
// commit, every file under it is immutable and can be cached for as long as a
// CDN will hold it, and a patch invalidates the lot by changing the address.
//
// Read here rather than in the browser because the commit costs a call to
// GitHub's API, which is rate limited per address: sixty an hour would be gone
// in a minute of traffic. Behind one shared entry it is six an hour.

/** How long a resolved build is held. A patch reaches readers within this. */
const TTL_SECONDS = 10 * 60;

/** The mirror as it stands: the commit, and every vehicle it carries. */
export type MirrorBuild = {
  /**
   * The commit the geometry should be read at, where it could be resolved.
   *
   * Null when GitHub would not say, which is not worth failing over: the caller
   * falls back to the branch, which is the same files with a weaker guarantee
   * about when a patch reaches a reader.
   */
  sha: string | null;
  /** Where each vehicle's folder sits, by the code the client gives it. */
  vehicles: Record<string, string>;
  /**
   * The style a vehicle is issued already wearing, by code.
   *
   * **Not the same question as the index above, and not answerable from it.**
   * A reward vehicle usually ships no geometry of its own, so the index points
   * it at the tank it was made from and the style bolted on top is everything
   * that makes it itself: drawn without this, the Monkey King is a plain 121B.
   * Empty for every vehicle that simply wears what it was built with.
   */
  worn: Record<string, string>;
};

/** The commit a branch points at, or null if GitHub will not say right now. */
async function headOf(branch: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${MODELS_REPO}/git/ref/heads/${branch}`,
      { headers: { accept: "application/vnd.github+json" } },
    );
    if (!r.ok) return null;
    const body = (await r.json()) as { object?: { sha?: string } };
    const sha = body.object?.sha;
    return typeof sha === "string" && sha.length >= 7 ? sha : null;
  } catch {
    return null;
  }
}

/**
 * What the viewer needs before it can draw anything.
 *
 * **The index is the list of what exists**, which is how a vehicle the mirror
 * does not carry is told apart from a request that failed. Empty on any
 * failure, so a viewer offered nothing shows the render it already has rather
 * than reaching for files that are not there.
 */
export function getModelsMirror(branch?: WotSrcBranch): Promise<MirrorBuild> {
  const ref = modelsRefFor(branch) ?? MODELS_BRANCH;
  return cachedInRedis(
    `models:mirror:${ref}`,
    // A build that resolved is worth the full window. One that did not is worth
    // a minute: it is a GitHub blip, and holding it would keep every reader on
    // the weaker fallback for ten.
    (build: MirrorBuild) =>
      build.sha && Object.keys(build.vehicles).length > 0 ? TTL_SECONDS : 60,
    async () => {
      // The worn styles are read beside the index rather than by the viewer,
      // which would otherwise pay a second round trip before it could start
      // building: it needs both to know what to build, and one of them is 32
      // lines. A mirror published before this file existed answers 404, which
      // reads as "nothing wears anything" and leaves every vehicle drawn the
      // way it was.
      const [sha, vehicles, worn] = await Promise.all([
        headOf(ref),
        fetch(modelUrl("vehicles.json", ref))
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({})),
        fetch(modelUrl("worn.json", ref))
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({})),
      ]);
      return {
        sha,
        vehicles: vehicles as Record<string, string>,
        worn: worn as Record<string, string>,
      };
    },
  );
}

/**
 * Which build of the mirror a vehicle should be read at, and where it sits.
 *
 * **One answer, so the page and the viewer cannot name two.** They did: the
 * page resolved a build while assembling a payload cached for a day, the viewer
 * resolved its own through a ten minute entry, and the commit is part of every
 * path under the root. For most of the day they named different ones and the
 * vehicle came down twice, 10.4 MB on the wire for 5.2 MB of tank.
 *
 * So the build travels with the vehicle. A page served from an older cache
 * entry simply draws an older build, which is complete and immutable.
 *
 * **It deliberately names no files.** Naming them in the markup is what the
 * hero would gain most from, and it cannot be done from here: an address in the
 * payload, raised as a hint or rendered as an element, is acted on the moment
 * the payload reaches the browser, and Next prefetches the payload of every
 * link in view. Measured on the live site: opening the E 75 pulled the whole of
 * the E 100 because its page is one link away. Both forms were tried.
 */
export type VehicleFirstPaint = {
  /** The root the viewer should read, pinned to the build this was resolved at. */
  root: string;
  /** Where this vehicle's files sit under `vehicles/`. */
  path: string;
  /** The style it is issued wearing, where it is issued one. */
  worn: string | null;
  /** The geometry, which a viewer pulls through `fetch`. */
  geometry: string[];
  /** The maps it wears, which arrive as images. */
  textures: string[];
};

/**
 * How long a vehicle's first-paint list is held. Keyed by the build it was read
 * at, so what it names can never change.
 */
const FIRST_PAINT_SECONDS = 24 * 60 * 60;

/** How long the mirror is given to answer for one manifest. */
const MANIFEST_PATIENCE_MS = 5000;

/**
 * The build the hero should read this vehicle at, and the files it opens on.
 *
 * Null for a vehicle the mirror does not carry, which is drawn from a
 * photograph and has nothing to read.
 */
export async function getVehicleFirstPaint(
  code: string,
  branch?: WotSrcBranch,
): Promise<VehicleFirstPaint | null> {
  const ref = modelsRefFor(branch) ?? MODELS_BRANCH;
  const { sha, vehicles, worn } = await getModelsMirror(branch);
  const path = vehicles[code];
  if (!path) return null;
  const root = sha ? modelsCdn(sha) : modelsCdn(ref);
  const dressed = worn[code] ?? null;
  const folder = dressed ? `${path}/${MIRROR_SKIN_FOLDER}/${dressed}` : path;
  // **The derived list is cached, not the manifest it came from.** A manifest
  // is seventy kilobytes and what survives reading it is about two: held whole,
  // a sweep of the catalogue would write tens of megabytes into a two gigabyte
  // store shared with the page cache, which this project has filled once.
  const files = await cachedInRedis<{ geometry: string[]; textures: string[] } | null>(
    `models:firstpaint:${sha ?? ref}:${folder}`,
    (held) => (held ? FIRST_PAINT_SECONDS : 60),
    async () => {
      try {
        const r = await fetch(`${root}/vehicles/${folder}/model.json`, {
          // Every other outbound fetch in here carries one, and this sits
          // inside the tank detail assembly: a mirror that accepts the
          // connection and never answers would hang the endpoint with it.
          signal: AbortSignal.timeout(MANIFEST_PATIENCE_MS),
        });
        if (!r.ok) return null;
        return firstPaintFiles((await r.json()) as MirrorModel);
      } catch {
        return null;
      }
    },
  );
  return {
    root,
    path,
    worn: dressed,
    geometry: (files?.geometry ?? []).map((at) => `${root}/vehicles/${folder}/${at}`),
    // Already mirror-relative, in a skin's manifest as in a vehicle's own.
    textures: (files?.textures ?? []).map((at) => `${root}/${at}`),
  };
}
