
import { SKIN_FOLDER } from "@/services/tank-viewer/styles";

// Asking for the vehicle's files in the markup, before anything that could ask
// for them itself exists.
//
// **The viewer cannot be early, by construction.** It is a canvas and a WebGL
// loop, so it is loaded beside the page rather than inside it and mounted only
// once React has hydrated: measured on the live site, the HTML landed at 1.4 s
// and the first byte of geometry was not asked for until 2.5. Nothing was slow
// in between, the browser simply had not been told there was anything to fetch.
//
// A `<link rel="preload">` in the head is told, and it needs no JavaScript at
// all. The bytes then arrive during the second the page spends hydrating, and
// the viewer finds them in cache rather than starting a round trip of its own.
//
// Server-rendered on purpose: emitted from the browser it would be exactly as
// late as the code it is meant to get ahead of.
//
// **Rendered as elements, never through `ReactDOM.preload`.** A hint raised
// during a server render travels in the payload and is replayed the moment that
// payload reaches the browser, and Next prefetches the payload of every link in
// view: the tech tree under a tank is four more tanks, so each page quietly
// pulled five vehicles instead of one, twenty megabytes against three. An
// element is part of the tree and does nothing until the route it belongs to is
// actually rendered.

/**
 * The addresses to pull, as the detail payload named them.
 *
 * Named by the server that built the payload rather than assembled here: the
 * viewer asks for a precise set of files, and an address built a second time
 * from a root and a folder is an address that can differ from it. A preload the
 * viewer then does not use is not an error anyone sees, it is simply paid for
 * twice.
 */
export type FirstPaint = {
  /** The build the viewer will read, which is what these addresses hang off. */
  root: string;
  /** Where the vehicle sits under `vehicles/`, for the two manifests below. */
  path: string;
  worn: string | null;
  geometry: string[];
  textures: string[];
} | null;

export function VehicleFirstPaint({ model }: { model?: FirstPaint }) {
  // **Nothing, when the viewer is reading somewhere else.** A developer can
  // point it at a tree on disk, and these addresses are the mirror's: emitted
  // then, every one of them is a file fetched that nobody opens, while the
  // vehicle is drawn from bytes that were never preloaded. The two have to name
  // the same place or neither should speak.
  if (!model || process.env.NEXT_PUBLIC_MODELS_ROOT) return null;
  // They are read from two different folders on a vehicle issued wearing a
  // style: the armour is the tank's underneath, the meshes are the style's.
  const dressed = model.worn
    ? `${model.path}/${SKIN_FOLDER}/${model.worn}`
    : model.path;
  return (
    <>
      {/* **The two the hero blocks on before it can ask for a single mesh.** It
          fetches the collision, waits, fetches the manifest, waits, and only
          then knows which pieces to pull: naming the meshes alone leaves that
          chain of two round trips in front of them. */}
      {[
        `${model.root}/vehicles/${model.path}/collision.json`,
        `${model.root}/vehicles/${dressed}/model.json`,
        ...model.geometry,
      ].map((at) => (
        // Through `fetch`, which is how the glTF loader reads a mesh, and
        // anonymously, which is how it reads one across origins. A preload
        // whose mode does not match the request it is meant to serve lands in
        // a different cache entry and is downloaded again.
        <link
          key={at}
          rel="preload"
          href={at}
          as="fetch"
          crossOrigin="anonymous"
          fetchPriority="high"
        />
      ))}
      {model.textures.map((at) => (
        // As images, which is what a texture loader creates, and behind
        // everything the page itself needs: the hero has a second of hydration
        // to wait through either way, so these have time to arrive without
        // taking any from the stylesheet and the scripts that decide when the
        // page can be read at all.
        <link
          key={at}
          rel="preload"
          href={at}
          as="image"
          crossOrigin="anonymous"
          fetchPriority="low"
        />
      ))}
    </>
  );
}
