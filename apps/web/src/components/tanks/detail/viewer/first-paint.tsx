import ReactDOM from "react-dom";

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

/**
 * The addresses to pull, as the detail payload named them.
 *
 * Named by the server that built the payload rather than assembled here: the
 * viewer asks for a precise set of files, and an address built a second time
 * from a root and a folder is an address that can differ from it. A preload the
 * viewer then does not use is not an error anyone sees, it is simply paid for
 * twice.
 */
export type FirstPaint = { geometry: string[]; textures: string[] } | null;

export function VehicleFirstPaint({ model }: { model?: FirstPaint }) {
  // **Nothing, when the viewer is reading somewhere else.** A developer can
  // point it at a tree on disk, and these addresses are the mirror's: emitted
  // then, every one of them is a file fetched that nobody opens, while the
  // vehicle is drawn from bytes that were never preloaded. The two have to name
  // the same place or neither should speak.
  if (!model || process.env.NEXT_PUBLIC_MODELS_ROOT) return null;
  for (const at of model.geometry) {
    // Through `fetch`, which is how the glTF loader reads a mesh, and
    // anonymously, which is how it reads one across origins. A preload whose
    // mode does not match the request it is meant to serve lands in a different
    // cache entry and is downloaded again.
    ReactDOM.preload(at, {
      as: "fetch",
      crossOrigin: "anonymous",
      // The meshes are what the first frame cannot be drawn without, and they
      // are a quarter of the bytes the textures are.
      fetchPriority: "high",
    });
  }
  for (const at of model.textures) {
    // As images, which is what a texture loader creates, and behind everything
    // the page itself needs: the hero has a second of hydration to wait through
    // either way, so these have time to arrive without taking any from the
    // stylesheet and the scripts that decide when the page can be read at all.
    ReactDOM.preload(at, {
      as: "image",
      crossOrigin: "anonymous",
      fetchPriority: "low",
    });
  }
  return null;
}
