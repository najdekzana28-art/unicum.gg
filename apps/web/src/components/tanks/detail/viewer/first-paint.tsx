// Asking for the vehicle's files before anything that could ask for them exists.
//
// **The viewer cannot be early, by construction.** It is a canvas and a WebGL
// loop, so it is loaded beside the page rather than inside it and mounted only
// once React has hydrated: measured on the live site, the HTML landed at 1.4 s
// and the first byte of geometry was not asked for until 2.5. Nothing was slow
// in between, the browser simply had not been told there was anything to fetch.
//
// **A script, because an address cannot live in the payload.** Both the ways of
// naming a file from a page were tried in production and both fetch it for
// readers who never open that page: `ReactDOM.preload` raises a hint that React
// carries in the payload and replays on arrival, and a rendered `<link
// rel="preload">` is hoisted the same way, because React treats it as a
// resource rather than as markup. Next prefetches the payload of every link in
// view, so each page pulled its tech-tree neighbours: measured, five vehicles
// for one on the KV-1, and 25 files of the E 100 on the E 75's page, which
// merely links to it.
//
// A prefetch fetches a payload, it does not render it, and an inline script
// runs when the parser reaches it. So this fires on a real visit and on nothing
// else, while still being read before any of the page's own JavaScript.

/** The addresses to pull, as the detail payload named them. */
export type FirstPaint = {
  root: string;
  path: string;
  worn: string | null;
  geometry: string[];
  textures: string[];
} | null;

/**
 * The folder a vehicle is drawn from, which is its style's when it wears one.
 *
 * A vehicle issued wearing a 3D style ships no geometry worth drawing of its
 * own: the index points at the tank underneath and the meshes are the style's.
 */
const SKIN_FOLDER = "_skins";

export function VehicleFirstPaint({ model }: { model?: FirstPaint }) {
  // **Nothing, when the viewer is reading somewhere else.** A developer can
  // point it at a tree on disk, and these addresses are the mirror's: emitted
  // then, every one of them is a file fetched that nobody opens, while the
  // vehicle is drawn from bytes that were never preloaded.
  if (!model || process.env.NEXT_PUBLIC_MODELS_ROOT) return null;
  const dressed = model.worn
    ? `${model.path}/${SKIN_FOLDER}/${model.worn}`
    : model.path;
  // The two the hero blocks on before it can ask for a single mesh: it fetches
  // the collision, waits, fetches the manifest, waits, and only then knows
  // which pieces to pull. They are read from two different folders on a vehicle
  // wearing a style, since the armour is the tank's underneath.
  const fetched = [
    `${model.root}/vehicles/${model.path}/collision.json`,
    `${model.root}/vehicles/${dressed}/model.json`,
    ...model.geometry,
  ];
  // `as` has to match the request it is meant to serve or the answer lands in a
  // different cache entry and is fetched again: a mesh arrives through `fetch`
  // and a texture through an `<img>`. Anonymously, which is how the loaders
  // read across origins.
  const source = `(function(){try{var h=document.head;function p(u,a,f){var l=document.createElement('link');l.rel='preload';l.href=u;l.as=a;l.crossOrigin='anonymous';l.fetchPriority=f;h.appendChild(l)}${JSON.stringify(
    fetched,
  )}.forEach(function(u){p(u,'fetch','high')});${JSON.stringify(
    model.textures,
  )}.forEach(function(u){p(u,'image','low')})}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: source }} />;
}
