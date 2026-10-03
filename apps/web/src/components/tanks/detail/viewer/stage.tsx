"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";

import type { PaintLock } from "@unicum.gg/shared";
import { useAfterLoad } from "@/hooks/use-after-load";
import { HERO_COLUMN } from "@/components/tanks/detail/viewer/column";
import type { HeroShell } from "@/components/tanks/detail/viewer/shell-rules";

/**
 * The viewer, fetched beside the page rather than inside it.
 *
 * It carries three.js, its GLTF loader and the whole of `services/tank-viewer`:
 * measured on the built app, 1052 KB of the tank page's JavaScript, a single
 * 664 KB chunk among it. Bundled in, every reader parsed all of it before the
 * page could respond to them. Split out, it is requested the moment this
 * component mounts, so the vehicle still comes up on its own and the page is
 * interactive while it does. There is nothing for the server to render either
 * way: it is a canvas and a WebGL loop.
 */
const TankViewer = dynamic(
  () => import("@/components/tanks/detail/viewer").then((m) => m.TankViewer),
  { ssr: false },
);

/**
 * The render and the model, one giving way to the other.
 *
 * They are held together here rather than side by side in the hero because the
 * swap is a client concern and the hero is not: the picture is the page's first
 * paint and has to stay until there is something better to show, and for a
 * vehicle the geometry mirror does not carry there never is.
 */
export function TankStage({
  code,
  pinnedRoot,
  pinnedPath,
  pinnedWorn,
  shells,
  builds,
  mechanic,
  paintLock,
  backdrop,
  children,
}: {
  code: string;
  /** Passed straight through: which build of the mirror the page resolved. */
  pinnedRoot?: string | null;
  pinnedPath?: string | null;
  pinnedWorn?: string | null;
  /** Passed straight through: the stage owns the swap, not the armour. */
  shells?: Record<string, HeroShell[]>;
  /**
   * Which mechanic this vehicle's second state is, where it has one.
   *
   * The client tags all seven of them `siegeMode`, so without this the hero
   * offers a Panhard EBR a siege button for what is its road mode.
   */
  mechanic?: string | null;
  /**
   * Why the game refuses to dress this vehicle, where it does. Passed straight
   * through: what it costs the picture is the viewer's business, not the
   * stage's.
   */
  paintLock?: PaintLock | null;
  /** Passed straight through too: the viewer reads the configurator's URL. */
  builds?: {
    modules: Record<string, number | null>;
    keys: Record<string, string>;
  }[];
  /** WG's hangar photograph, which the model replaces rather than stands on. */
  backdrop: React.ReactNode;
  children: React.ReactNode;
}) {
  /**
   * Whether there is no model to wait for.
   *
   * **Not "has it finished loading".** The picture used to sit on top until the
   * model replaced it, which made every visit look like it was waiting on
   * something even when it was quick: a photograph swapping for a tank is a
   * loading screen, however short. The vehicle now arrives into an empty
   * studio, and the picture is only ever seen where there is nothing else to
   * see.
   */
  const [absent, setAbsent] = useState(false);
  const missing = useCallback(() => setAbsent(true), []);
  /**
   * **A vehicle is 9.6 MB across thirty-five files and it was being fetched
   * while the page was still painting.** Under a throttled phone that was not a
   * slow page but an unresponsive one: Lighthouse reported the renderer as hung
   * rather than slow on three of the five tank pages tried, which is a page
   * Google cannot measure and may not finish rendering either.
   *
   * Nothing is gated behind a click. The vehicle still comes up on its own, it
   * just stops racing the page it is standing on.
   */
  const afterLoad = useAfterLoad();
  // **Measured rather than calculated.** The viewer needs where the column
  // falls, and the honest way to know is to put one there and read it: a width
  // restated in pixels would be a second copy of a layout decision, and it would
  // be wrong the first time the column changed.
  const column = useRef<HTMLDivElement>(null);
  // **The photograph goes with the render it was shot for.** It is a hangar
  // floor seen from high up, and a model drawn at eye level on top of it reads
  // as pasted on rather than standing there: two perspectives, one picture. The
  // model brings its own room, so the plate underneath is left dark and the
  // spotlight above it does the rest.
  //
  // Hidden rather than left out until it is wanted: it is the answer for a
  // vehicle whose model failed, and one fetched at that moment would be a
  // second wait, arriving exactly when something has already gone wrong.
  const fade = absent ? "opacity-100" : "opacity-0";
  return (
    <>
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${fade}`}
      >
        {backdrop}
      </div>
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${fade}`}
      >
        {children}
      </div>
      <div
        ref={column}
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${HERO_COLUMN}`}
      />
      {/* The viewer positions itself: it has to be able to leave this band for
        the window or the screen, and a box put around it here could not follow
        it out. */}
      {afterLoad ? (
        <TankViewer
          code={code}
          pinnedRoot={pinnedRoot}
          pinnedPath={pinnedPath}
          pinnedWorn={pinnedWorn}
          shells={shells}
          builds={builds}
          mechanic={mechanic}
          paintLock={paintLock}
          onAbsent={missing}
          column={column}
        />
      ) : null}
    </>
  );
}
